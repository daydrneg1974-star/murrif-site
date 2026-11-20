const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("var form = document.getElementById('contactForm');");
const end = html.indexOf('// --- Квиз:', start);
assert(start >= 0 && end > start);
const fields = Object.fromEntries(['name', 'contact', 'service', 'message', 'consent'].map(name => [name, {
  value: '', checked: false, focused: false, focus() { this.focused = true; }
}]));
const status = {};
const submit = { disabled: true };
let handler;
const form = {
  elements: fields,
  addEventListener(type, callback) { if (type === 'submit') handler = callback; },
  querySelector() { return submit; },
  reset() { Object.values(fields).forEach(field => { field.value = ''; field.checked = false; }); }
};
const window = { location: { href: '' } };
vm.runInNewContext(html.slice(start, end), {
  document: { getElementById(id) { return id === 'contactForm' ? form : status; } },
  window,
  encodeURIComponent
});
const results = [];
function check(name, test) {
  try { test(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, reason: error.message }); }
}
const event = { preventDefault() {} };
check('Empty name and contact are rejected', () => {
  handler(event);
  assert.match(status.textContent, /укажите имя/);
  assert(fields.name.focused);
  assert.equal(window.location.href, '');
});
fields.name.value = 'Тест восстановления';
fields.contact.value = 'test@example.invalid';
fields.service.value = 'Пока не знаю, нужна консультация';
fields.message.value = 'Текст & знак = строка\nПродолжение';
check('Missing consent is rejected', () => {
  handler(event);
  assert.match(status.textContent, /согласие/);
  assert.equal(window.location.href, '');
});
fields.consent.checked = true;
handler(event);
check('Mail draft has the correct recipient and escaped contents', () => {
  const draft = new URL(window.location.href);
  assert.equal(draft.protocol, 'mailto:');
  assert.equal(draft.pathname, 'daydrneg1974@gmail.com');
  assert.match(draft.searchParams.get('body'), /Текст & знак = строка\nПродолжение/);
  assert.match(draft.searchParams.get('subject'), /Пока не знаю, нужна консультация/);
});
check('Draft stays in the form after preparing an email', () => {
  assert.equal(fields.name.value, 'Тест восстановления');
  assert.equal(fields.contact.value, 'test@example.invalid');
});
check('Without JavaScript the submit button starts disabled and fallback contacts are explained', () => {
  const markup = html.match(/<form\b[\s\S]*?<\/form>/)[0];
  assert.match(markup, /<button[^>]*type="submit"[^>]*\bdisabled/);
  assert.match(markup, /<noscript>[\s\S]*?Для заявки напишите/);
});
check('Successful script initialization enables the submit button', () => assert.equal(submit.disabled, false));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;
