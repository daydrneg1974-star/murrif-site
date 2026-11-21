const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

function parseColor(value) {
  if (value.startsWith('#')) return [...value.slice(1).match(/../g).map(v => parseInt(v, 16)), 1];
  const channels = value.match(/[\d.]+/g).map(Number);
  return channels.length === 3 ? [...channels, 1] : channels;
}

function over(foreground, background) {
  return [...background.slice(0, 3).map((v, i) => foreground[i] * foreground[3] + v * (1 - foreground[3])), 1];
}

function luminance(color) {
  return color.slice(0, 3).map(v => v / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function measure(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const variables = Object.fromEntries([...html.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));
  const resolve = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert(variables[name], `Missing ${name}`);
    return variables[name];
  });
  const colors = value => {
    const matches = resolve(value).match(/#[\da-f]{6}\b|rgba?\([\d.,\s]+\)/gi);
    assert(matches, `No color in ${value}`);
    return matches.map(parseColor);
  };
  const property = (selector, name) => {
    const start = html.indexOf(selector + ' {');
    assert(start >= 0, `Missing CSS rule ${selector}`);
    const rule = html.slice(html.indexOf('{', start) + 1, html.indexOf('}', start));
    const match = rule.match(new RegExp('(?:^|;)\\s*' + name + ':\\s*([^;]+)'));
    assert(match, `Missing ${selector} / ${name}`);
    return match[1].trim();
  };
  const background = selector => colors(property(selector, 'background'));
  const base = colors(variables['--bg'])[0];
  const samples = [];
  const add = (label, background, tokens = ['--ink-soft', '--ink-muted']) => {
    for (const token of tokens) {
      const foreground = colors(variables[token] || token)[0];
      samples.push({ label, token, foreground: foreground.slice(0, 3), background: background.slice(0, 3), ratio: contrast(foreground, background) });
    }
  };
  assert.equal(variables['--bg'], '#383840', 'Keep the approved graphite background');
  add('page', base);
  add('surface', colors(variables['--surface'])[0]);
  const white = [255, 255, 255, 1];
  const header = background('.header__inner')[0];
  const headerOverPage = over(header, base);
  const headerOverWhite = over(header, white);
  const headerLink = file === 'index.html' ? '.nav__link' : '.header__back';
  const addHeader = (label, surface) => {
    for (const selector of ['.logo__role', headerLink]) {
      add(`${label} / ${selector}`, surface, [property(selector, 'color')]);
    }
  };
  addHeader('header over page', headerOverPage);
  addHeader('header over white', headerOverWhite);

  if (file === 'index.html') {
    const scrolled = over(background('.header.is-scrolled .header__inner')[0], white);
    addHeader('scrolled header over white', scrolled);
    // At rest the .72 header is at the top of the page; after scrolling it is .86.
    // Keep the existing hover/active surfaces and test both reachable stable states.
    for (const [label, surface] of [['header over page', headerOverPage], ['scrolled header over white', scrolled]]) {
      for (const selector of ['.nav__link:hover', '.nav__link.is-active']) {
        add(`${label} / ${selector}`, over(background(selector)[0], surface), [property(selector, 'color')]);
      }
    }
    const mobile = over(background('.nav')[0], white);
    add('mobile menu over white', mobile, [property('.nav__link', 'color')]);
    for (const selector of ['.nav__link:hover', '.nav__link.is-active']) {
      add(`mobile menu over white / ${selector}`, over(background(selector)[0], mobile), [property(selector, 'color')]);
    }
  } else {
    for (const [label, surface] of [['header over page', headerOverPage], ['header over white', headerOverWhite]]) {
      add(`${label} / .header__back:hover`, over(background('.header__back:hover')[0], surface), [property('.header__back:hover', 'color')]);
    }
  }

  const glass = file === 'index.html' ? colors(variables['--glass']) : background('.card');
  glass.forEach((color, i) => add(`glass endpoint ${i + 1}`, over(color, base)));

  if (file === 'index.html') {
    const form = background('.form');
    const input = background('.field input, .field select, .field textarea')[0];
    const placeholders = '.field input::placeholder, .field textarea::placeholder';
    form.forEach((color, i) => {
      add(`form endpoint ${i + 1}`, color);
      add(`placeholder endpoint ${i + 1}`, over(input, color), [property(placeholders, 'color')]);
    });
    assert.equal(property(placeholders, 'opacity'), '1', 'Placeholder opacity must not reduce contrast');

    const contacts = over(background('.contacts::before')[0], base);
    add('contacts maximum glow', contacts);
    glass.forEach((color, i) => add(`contacts glass endpoint ${i + 1}`, over(color, contacts)));

    // Conservative maximum-alpha combinations of the existing decorative layers.
    // This is a CSS regression check, not a pixel/layout or full WCAG audit.
    const dots = colors(property('.hero::before', 'background-image'))[0];
    const hero = over(background('.hero::after')[0], over(dots, base));
    add('hero badge over maximum dots and glow', over(background('.badge')[0], hero), ['--ink-soft']);
    add('why card maximum glow', over(background('.why__highlight::after')[0], over(glass[0], base)), ['--ink-soft']);

    const quizGlow = over(background('.quiz::before')[0], base);
    background('.quiz__card').forEach((color, i) => {
      const card = over(color, quizGlow);
      add(`quiz card endpoint ${i + 1}`, card);
      for (const option of ['.quiz__option', '.quiz__option:hover']) {
        const letter = over(background('.quiz__letter')[0], over(background(option)[0], card));
        add(`quiz letter ${option} endpoint ${i + 1}`, letter, ['--ink-soft']);
      }
    });
  } else {
    const glow = over(background('.doc::before')[0], base);
    add('document maximum glow', glow);
    glass.forEach((color, i) => add(`document glass endpoint ${i + 1}`, over(color, glow)));
  }
  return samples;
}

for (const file of ['index.html', 'privacy.html', 'consent.html']) {
  test(`${file}: secondary text and placeholders meet 4.5:1 on their CSS surfaces`, t => {
    const samples = measure(file);
    for (const sample of samples) {
      assert(sample.ratio >= 4.5, `${sample.label} / ${sample.token}: ${sample.ratio.toFixed(4)}:1`);
    }
    const minimum = Math.min(...samples.map(sample => sample.ratio));
    t.diagnostic(`${samples.length} color/surface pairs; minimum ${minimum.toFixed(4)}:1`);
  });
}

module.exports = { measure };

// Verifier regression: a sticky translucent header can move over the light CTA.
// The previous page-background-only samples missed this observed state.
for (const file of ['index.html', 'privacy.html', 'consent.html']) {
  test(`${file}: secondary header text stays legible over a light underlay`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const variables = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const property = (selector, name) => {
      let value;
      for (const rule of rules) {
        if (!rule[1].split(',').map(s => s.trim()).includes(selector)) continue;
        const declarations = [...rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)];
        for (const declaration of declarations) if (declaration[1] === name) value = declaration[2].trim();
      }
      assert(value, `Missing ${selector} ${name}`);
      return value.replace(/var\((--[\w-]+)\)/g, (_, token) => {
        assert(variables[token], `Missing ${token}`);
        return variables[token];
      });
    };
    const color = value => {
      if (value === 'white') value = '#ffffff';
      if (/^#[\da-f]{3}$/i.test(value)) value = '#' + [...value.slice(1)].map(v => v + v).join('');
      return parseColor(value);
    };
    const selectors = file === 'index.html' ? ['.logo__role', '.nav__link'] : ['.logo__role', '.header__back'];
    const states = file === 'index.html' ? ['.header__inner', '.header.is-scrolled .header__inner'] : ['.header__inner'];
    for (const state of states) {
      // White is the conservative upper bound for content behind the preserved
      // translucent surface; this does not alter or mock the product CSS.
      const background = over(color(property(state, 'background')), [255, 255, 255, 1]);
      for (const selector of selectors) {
        const ratio = contrast(color(property(selector, 'color')), background);
        assert(ratio >= 4.5, `${state} / ${selector} over light content: ${ratio.toFixed(4)}:1 < 4.5:1`);
      }
    }
  });
}
