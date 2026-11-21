const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("var burger = document.getElementById('burger');");
const end = html.indexOf('// --- Тень у шапки', start);
assert(start >= 0 && end > start, 'Mobile menu script must be present');

function setup() {
  const listeners = {};
  const attributes = { 'aria-expanded': 'false' };
  const classes = new Set();
  const outside = {};
  const link = { closest: selector => selector === 'a' ? link : null };
  const document = {
    activeElement: outside,
    getElementById: id => id === 'burger' ? burger : nav,
    addEventListener: (type, fn) => { listeners[type] = fn; }
  };
  const burger = {
    setAttribute: (name, value) => { attributes[name] = value; },
    getAttribute: name => attributes[name],
    addEventListener: (type, fn) => { listeners.burgerClick = fn; },
    focus: () => { document.activeElement = burger; }
  };
  const nav = {
    classList: { toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } },
    contains: element => element === link || element === nav,
    addEventListener: (type, fn) => { listeners.navClick = fn; }
  };
  vm.runInNewContext(html.slice(start, end), {
    document,
    window: { addEventListener() {} }
  });
  return { listeners, attributes, classes, document, burger, link, outside };
}

test('Escape from an open menu closes it and returns focus to the toggle', () => {
  const page = setup();
  page.listeners.burgerClick();
  assert.equal(page.attributes['aria-expanded'], 'true');
  page.document.activeElement = page.link;
  page.listeners.keydown({ key: 'Escape' });
  assert.equal(page.attributes['aria-expanded'], 'false');
  assert.equal(page.attributes['aria-label'], 'Открыть меню');
  assert.equal(page.classes.has('is-open'), false);
  assert.equal(page.document.activeElement, page.burger);
});

for (const open of [false, true]) {
  test(`Escape outside the ${open ? 'open' : 'closed'} menu does not move focus`, () => {
    const page = setup();
    if (open) page.listeners.burgerClick();
    page.listeners.keydown({ key: 'Escape' });
    assert.equal(page.document.activeElement, page.outside);
  });
}

test('Other keys do not close the menu or move focus', () => {
  const page = setup();
  page.listeners.burgerClick();
  page.document.activeElement = page.link;
  page.listeners.keydown({ key: 'Tab' });
  assert.equal(page.attributes['aria-expanded'], 'true');
  assert.equal(page.document.activeElement, page.link);
});

test('Following a menu link closes the menu without cancelling anchor navigation', () => {
  const page = setup();
  page.listeners.burgerClick();
  let defaultPrevented = false;
  page.listeners.navClick({
    target: page.link,
    preventDefault() { defaultPrevented = true; }
  });
  assert.equal(page.attributes['aria-expanded'], 'false');
  assert.equal(page.classes.has('is-open'), false);
  assert.equal(defaultPrevented, false);
});
