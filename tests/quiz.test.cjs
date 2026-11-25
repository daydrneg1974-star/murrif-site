const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("var quiz = document.getElementById('quizCard');");
const end = html.indexOf('// --- Текущий год', start);
assert(start >= 0 && end > start);

function setup() {
  const timers = new Map();
  let nextTimer = 0;
  const element = () => ({
    hidden: false, dataset: {}, listeners: {}, textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, focus() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  const steps = Array.from({ length: 3 }, () => {
    const step = element();
    step.options = ['a', 'b', 'c'].map(answer => ({ ...element(), dataset: { answer } }));
    step.querySelectorAll = () => step.options;
    step.querySelector = () => element();
    return step;
  });
  const ids = Object.fromEntries(['quizCard', 'quizCounter', 'quizBack', 'quizResult', 'quizFormat', 'quizText', 'service', 'quizRestart', 'quizCta', 'quizValue'].map(id => [id, element()]));
  ids.quizCard.querySelectorAll = selector => selector === '.quiz__step' ? steps : [element(), element(), element()];
  ids.service.closest = () => element();
  ids.service.dispatchEvent = () => {};
  vm.runInNewContext(html.slice(start, end), {
    document: { getElementById: id => ids[id] },
    window: { matchMedia: () => ({ matches: false }) },
    form: { scrollIntoView() {} }, Event: class {},
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    ids, steps,
    choose(answer) {
      const step = steps.find(s => !s.hidden);
      assert(step, 'A question must be visible');
      const option = step.options.find(o => o.dataset.answer === answer);
      ids.quizCard.listeners.click({ target: { closest: () => option } });
    },
    flush() {
      for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
    },
    back() { ids.quizBack.listeners.click(); },
    step() { return steps.findIndex(s => !s.hidden); }
  };
}

for (const [answer, format] of [['a', 'Сайт-визитка'], ['b', 'Лендинг'], ['c', 'Веб-приложение']]) {
  test(`Quiz reaches ${format} and transfers it to the form`, () => {
    const page = setup();
    for (let i = 0; i < 3; i++) { page.choose(answer); page.flush(); }
    assert.equal(page.ids.quizResult.hidden, false);
    assert.equal(page.ids.quizFormat.textContent, format);
    let cancelled = false;
    page.ids.quizCta.listeners.click({ preventDefault() { cancelled = true; } });
    assert.equal(cancelled, true);
    assert.equal(page.ids.service.value, format);
    page.ids.quizRestart.listeners.click();
    assert.equal(page.step(), 0);
    assert.equal(page.ids.quizResult.hidden, true);
  });
}

test('Rapid repeated answers do not skip a question', () => {
  const page = setup();
  page.choose('a'); page.choose('b'); page.flush();
  assert.equal(page.step(), 1);
  page.choose('a'); page.flush(); page.choose('b'); page.flush();
  assert.equal(page.ids.quizFormat.textContent, 'Сайт-визитка');
});

test('Back during the answer delay stays on the previous question and remains usable', () => {
  const page = setup();
  page.choose('a'); page.flush();
  page.choose('b'); page.back();
  assert.equal(page.step(), 0);
  page.flush();
  assert.equal(page.step(), 0, 'A pending timer must not undo Back');
  for (let i = 0; i < 3; i++) { page.choose('c'); page.flush(); }
  assert.equal(page.ids.quizFormat.textContent, 'Веб-приложение');
});
