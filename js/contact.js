(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) api.bind(root.document.getElementById('contactForm'), root);
})(typeof window !== 'undefined' ? window : {}, function () {
  'use strict';
  var services = ['Пока не знаю, нужна консультация', 'Сайт-визитка', 'Лендинг', 'Веб-приложение'];
  function validate(data) {
    var errors = {};
    ['name', 'contact', 'message'].forEach(function (key) {
      var max = { name: 80, contact: 160, message: 4000 }[key];
      var value = (data[key] || '').trim();
      if ((key !== 'message' && !value) || Array.from(value).length > max) {
        errors[key] = key === 'message' ? 'Сократите текст до 4000 символов.' : 'Заполните поле: не более ' + max + ' символов.';
      }
      var controls = key === 'message' ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/ : /[\x00-\x1F\x7F\u2028\u2029]/;
      if (controls.test(value)) errors[key] = 'Уберите недопустимые управляющие символы.';
    });
    var contact = (data.contact || '').trim();
    var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    var telegram = /^(?:@|https:\/\/t\.me\/)[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact);
    var phone = /^\+?[0-9 ()\-]+$/.test(contact) && /^[0-9]{7,15}$/.test(contact.replace(/\D/g, ''));
    if (!email && !telegram && !phone) errors.contact = 'Укажите email, телефон (7–15 цифр) или Telegram: @username.';
    if (services.indexOf(data.service) < 0) errors.service = 'Выберите услугу из списка.';
    if (data.consent !== 'on') errors.consent = 'Отметьте согласие на обработку данных.';
    return errors;
  }
  function bind(form, win) {
    if (!form || !win.fetch || !win.AbortController || !win.crypto || !win.crypto.getRandomValues) return;
    var status = win.document.getElementById('formStatus');
    var button = form.querySelector('button[type="submit"]');
    var busy = false;
    var lastPayload;
    var requestId;
    function show(message, state) {
      status.textContent = message;
      status.className = 'form__status is-visible ' + (state === 'accepted' ? 'form__status--ok' : state === 'sending' ? '' : 'form__status--error');
      status.dataset.state = state;
    }
    function fieldErrors(errors) {
      ['name', 'contact', 'service', 'message', 'consent'].forEach(function (key) {
        var target = win.document.getElementById(key + '-error');
        target.textContent = errors[key] || '';
        target.hidden = !errors[key];
        if (errors[key]) form.elements[key].setAttribute('aria-invalid', 'true');
        else form.elements[key].removeAttribute('aria-invalid');
      });
      var first = Object.keys(errors).find(function (key) { return form.elements[key] && key !== 'website' && key !== 'request_id' && key !== 'quiz'; });
      if (first) form.elements[first].focus();
    }
    form.noValidate = true;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy) return;
      var data = {};
      ['name', 'contact', 'service', 'message', 'website', 'quiz'].forEach(function (key) { data[key] = form.elements[key].value.trim(); });
      data.consent = form.elements.consent.checked ? 'on' : '';
      var errors = validate(data);
      fieldErrors(errors);
      if (Object.keys(errors).length) { show('Проверьте отмеченные поля. Сообщение не отправлено.', 'invalid'); return; }
      // Keep the same key for an explicit retry after a lost response. Never retry POST automatically.
      var payload = JSON.stringify(data);
      if (payload !== lastPayload) {
        var bytes = new Uint8Array(16);
        win.crypto.getRandomValues(bytes);
        requestId = Array.from(bytes, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
        lastPayload = payload;
      }
      data.request_id = requestId;
      busy = true;
      button.disabled = true;
      button.textContent = 'Отправляю…';
      form.setAttribute('aria-busy', 'true');
      show('Отправляю сообщение…', 'sending');
      var controller = new win.AbortController();
      var timeout = win.setTimeout(function () { controller.abort(); }, 35000);
      try {
        var response = await win.fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data), credentials: 'omit', signal: controller.signal });
        var result = await response.json();
        if (response.ok && result.ok === true && result.code === 'accepted') {
          show(result.message, 'accepted');
          form.reset();
          lastPayload = undefined;
          requestId = undefined;
        } else {
          fieldErrors(result.errors || {});
          show(typeof result.message === 'string' ? result.message : 'Форма временно недоступна. Используйте прямые контакты.', result.code || 'unavailable');
        }
      } catch (error) {
        show('Нет подтверждения от сервера. Данные сохранены. Можно повторить запрос: сервер проверит, было ли принято это сообщение. Автоматической повторной отправки нет.', 'network');
      } finally {
        win.clearTimeout(timeout);
        busy = false;
        button.disabled = false;
        button.textContent = 'Отправить сообщение';
        form.removeAttribute('aria-busy');
      }
    });
  }
  return { validate: validate, bind: bind };
});
