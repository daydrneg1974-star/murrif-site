const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf("var form = document.getElementById('contactForm');");
const end = html.indexOf('// --- Квиз:', start);
assert(start >= 0 && end > start, 'Contact form script must be present');
const script = html.slice(start, end);
const fieldNames = ['name', 'contact', 'service', 'message', 'consent'];
const recipient = 'owner@example.invalid';

function validValues(overrides = {}) {
  return {
    name: 'Тестовый посетитель',
    contact: 'test@example.invalid',
    service: 'Пока не знаю, нужна консультация',
    message: 'Нужен сайт для тестового проекта.',
    consent: true,
    ...overrides
  };
}

// Each case gets new fields, listeners, status and navigation history.
// Native cancelable events make a missing preventDefault observable.
function setup(values = {}) {
  let focusedField;
  const fields = Object.fromEntries(fieldNames.map(name => [name, {
    value: name === 'consent' ? 'on' : values[name] ?? '',
    checked: name === 'consent' && Boolean(values.consent),
    focus() { focusedField = name; }
  }]));
  const status = { textContent: '', className: '' };
  const button = { disabled: true };
  const form = new EventTarget();
  form.elements = fields;
  form.querySelector = selector => {
    assert.equal(selector, 'button[type="submit"]');
    return button;
  };
  form.reset = () => {
    for (const field of Object.values(fields)) {
      field.value = '';
      field.checked = false;
    }
  };
  const drafts = [];
  let href = 'https://example.invalid/#contacts';
  const location = {
    get href() { return href; },
    set href(value) { drafts.push(value); href = value; }
  };
  const context = {
    document: {
      getElementById(id) {
        assert(['contactForm', 'formStatus'].includes(id));
        return id === 'contactForm' ? form : status;
      }
    },
    window: { location },
    encodeURIComponent
  };
  vm.runInNewContext(script, context);
  const configuredRecipient = context.EMAIL;
  // No browser, mail client or network is involved; even drafts use test addresses.
  context.EMAIL = recipient;
  const snapshot = () => Object.fromEntries(fieldNames.map(name => [name, {
    value: fields[name].value,
    checked: fields[name].checked
  }]));
  return {
    fields, status, button, drafts, location, configuredRecipient, snapshot,
    get focusedField() { return focusedField; },
    submit() {
      const before = snapshot();
      const event = new Event('submit', { cancelable: true });
      const defaultAllowed = form.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, 'Every submission must call preventDefault');
      assert.equal(defaultAllowed, false, 'Native form submission must be cancelled');
      assert.deepEqual(snapshot(), before, 'Every field must survive submission unchanged');
      return event;
    }
  };
}

const invalidRequiredCases = [
  ['Empty form', {}, 'name'],
  ['Missing name', validValues({ name: '' }), 'name'],
  ['Missing contact', validValues({ contact: '' }), 'contact'],
  ['Whitespace-only name', validValues({ name: ' \t\n ' }), 'name'],
  ['Whitespace-only contact', validValues({ contact: ' \t\n ' }), 'contact']
];
for (const [label, values, focus] of invalidRequiredCases) {
  test(`${label}: cancel submission, preserve fields and focus the missing value`, () => {
    const page = setup(values);
    page.submit();
    assert.equal(page.status.textContent, 'Пожалуйста, укажите имя и способ связи.');
    assert.match(page.status.className, /form__status--error/);
    assert.equal(page.focusedField, focus);
    assert.deepEqual(page.drafts, []);
    assert.equal(page.location.href, 'https://example.invalid/#contacts');
  });
}

test('Missing consent cancels submission without navigation and focuses consent', () => {
  const page = setup(validValues({ consent: false }));
  page.submit();
  assert.equal(page.status.textContent, 'Отметьте согласие на обработку данных, чтобы отправить заявку.');
  assert.match(page.status.className, /form__status--error/);
  assert.equal(page.focusedField, 'consent');
  assert.deepEqual(page.drafts, []);
  assert.equal(page.location.href, 'https://example.invalid/#contacts');
});

test('Valid submission cancels the default, encodes the draft and preserves all five fields', () => {
  const page = setup(validValues({
    name: '  Тестовый <посетитель> & = ? # + %  ',
    contact: '  test+form@example.invalid  ',
    message: '  Текст &bcc=other@example.invalid = ? # + %\nПродолжение: <тест> 🙂  '
  }));
  const before = page.snapshot();
  page.submit();
  assert.equal(page.drafts.length, 1);
  const draft = new URL(page.drafts[0]);
  assert.equal(draft.protocol, 'mailto:');
  assert.equal(draft.pathname, recipient);
  assert.deepEqual([...draft.searchParams.keys()], ['subject', 'body']);
  assert.equal(draft.hash, '');
  assert.equal(draft.searchParams.get('subject'), 'Заявка с сайта: Пока не знаю, нужна консультация');
  assert.equal(draft.searchParams.get('body'),
    'Имя: Тестовый <посетитель> & = ? # + %\n' +
    'Контакт: test+form@example.invalid\n' +
    'Услуга: Пока не знаю, нужна консультация\n\n' +
    'Задача:\nТекст &bcc=other@example.invalid = ? # + %\nПродолжение: <тест> 🙂');
  assert.deepEqual(page.snapshot(), before);
  assert.match(page.status.className, /form__status--ok/);
  assert.match(page.status.textContent, /откроется почтовый клиент/);
});

for (const message of ['', ' \t\n ']) {
  test(`Optional ${message ? 'whitespace-only' : 'empty'} message is represented by a dash`, () => {
    const page = setup(validValues({ message }));
    page.submit();
    assert.match(new URL(page.drafts[0]).searchParams.get('body'), /Задача:\n—$/);
    assert.equal(page.fields.message.value, message);
  });
}

test('Repeated submission cancels each event and prepares the same draft without clearing fields', () => {
  const page = setup(validValues());
  const before = page.snapshot();
  const firstEvent = page.submit();
  const secondEvent = page.submit();
  assert.notEqual(firstEvent, secondEvent);
  assert.equal(page.drafts.length, 2);
  assert.equal(page.drafts[0], page.drafts[1]);
  assert.deepEqual(page.snapshot(), before);
  assert.match(page.status.className, /form__status--ok/);
});

test('Correcting consent after an error prepares a draft and replaces the error state', () => {
  const page = setup(validValues({ consent: false }));
  page.submit();
  assert.deepEqual(page.drafts, []);
  page.fields.consent.checked = true;
  page.submit();
  assert.equal(page.drafts.length, 1);
  assert.match(page.status.className, /form__status--ok/);
  assert.doesNotMatch(page.status.className, /form__status--error/);
});

test('Configured recipient agrees with the public email contact', () => {
  const contact = html.match(/href="mailto:([^"?]+)"/);
  assert(contact, 'Public email contact must be present');
  const configuredRecipient = setup().configuredRecipient;
  // Preserve the original configuration check; simulated drafts use example.invalid.
  assert.equal(configuredRecipient, 'daydrneg1974@gmail.com');
  assert.equal(configuredRecipient, contact[1]);
});

test('Without JavaScript the submit button starts disabled and fallback contacts are explained', () => {
  const markup = html.match(/<form\b[\s\S]*?<\/form>/)[0];
  assert.match(markup, /<button[^>]*type="submit"[^>]*\bdisabled/);
  assert.match(markup, /<noscript>[\s\S]*?Для заявки напишите/);
});

test('Successful script initialization enables the submit button', () => {
  assert.equal(setup().button.disabled, false);
});

// Verifier regressions: a previous successful draft must not bypass validation
// or leave the next attempt using stale field values.
test('Revoking consent after a successful draft blocks the next attempt and clears success state', () => {
  const page = setup(validValues());
  page.submit();
  const firstDraft = page.drafts[0];
  page.fields.consent.checked = false;
  page.submit();
  page.submit();
  assert.deepEqual(page.drafts, [firstDraft]);
  assert.equal(page.status.textContent, 'Отметьте согласие на обработку данных, чтобы отправить заявку.');
  assert.match(page.status.className, /form__status--error/);
  assert.doesNotMatch(page.status.className, /form__status--ok/);
  assert.equal(page.focusedField, 'consent');
  assert.equal(page.fields.consent.checked, false);
});

test('A later draft uses edited fields, while an intervening invalid attempt cannot create a draft', () => {
  const page = setup(validValues());
  page.submit();
  const firstDraft = page.drafts[0];
  page.fields.name.value = '\u00a0\u2003';
  page.fields.contact.value = '  changed+reply@example.invalid  ';
  page.fields.service.value = 'Лендинг';
  page.fields.message.value = 'Новая задача: два раздела & форма.\nСтрока №2.';
  page.submit();
  assert.deepEqual(page.drafts, [firstDraft]);
  assert.equal(page.focusedField, 'name');
  assert.match(page.status.className, /form__status--error/);
  page.fields.name.value = '  Второй посетитель  ';
  const before = page.snapshot();
  page.submit();
  assert.equal(page.drafts.length, 2);
  assert.notEqual(page.drafts[1], firstDraft);
  const changedDraft = new URL(page.drafts[1]);
  assert.equal(changedDraft.pathname, recipient);
  assert.equal(changedDraft.searchParams.get('subject'), 'Заявка с сайта: Лендинг');
  assert.equal(changedDraft.searchParams.get('body'),
    'Имя: Второй посетитель\nКонтакт: changed+reply@example.invalid\n' +
    'Услуга: Лендинг\n\nЗадача:\nНовая задача: два раздела & форма.\nСтрока №2.');
  assert.deepEqual(page.snapshot(), before);
  assert.match(page.status.className, /form__status--ok/);
  assert.doesNotMatch(page.status.className, /form__status--error/);
});
