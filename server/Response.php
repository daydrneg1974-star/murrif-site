<?php
declare(strict_types=1);
namespace Murrif;

function escape(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function renderResponse(array $result, array $values = []): string
{
    $value = static fn(string $key): string => escape(is_string($values[$key] ?? null) ? mb_substr($values[$key], 0, 4000) : '');
    $error = static fn(string $key): string => isset($result['errors'][$key]) ? '<p class="field__error" id="'.$key.'-error">'.escape($result['errors'][$key]).'</p>' : '';
    $invalid = static fn(string $key): string => isset($result['errors'][$key]) ? ' aria-invalid="true" aria-describedby="'.$key.'-error"' : '';
    $out = '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Обращение — murrif.ru</title><link rel="stylesheet" href="../css/style.css?v=20261124-2"></head><body><main class="container response"><h1>Ваше обращение</h1><p role="status">'.escape($result['message']).'</p>';
    if (!empty($result['request_id'])) $out .= '<p>Номер обращения: '.escape($result['request_id']).'</p>';
    if (!$result['ok']) {
        $out .= '<form class="form" action="contact.php" method="post"><h2 class="form__title">Проверить сообщение</h2>'.$error('form');
        foreach (['name'=>'Как к вам обращаться', 'contact'=>'Телефон, Telegram или email'] as $key=>$label) {
            $max = $key === 'name' ? 80 : 160;
            $out .= '<div class="field"><label for="'.$key.'">'.$label.' *</label><input id="'.$key.'" name="'.$key.'" maxlength="'.$max.'" value="'.$value($key).'" required'.$invalid($key).'>'.$error($key).'</div>';
        }
        $out .= '<div class="field"><label for="service">Что нужно</label><select id="service" name="service"'.$invalid('service').'>';
        foreach (Contact::SERVICES as $service) $out .= '<option'.(($values['service'] ?? '') === $service ? ' selected' : '').'>'.escape($service).'</option>';
        $out .= '</select>'.$error('service').'</div><div class="field"><label for="message">Коротко о задаче</label><textarea id="message" name="message" maxlength="4000"'.$invalid('message').'>'.$value('message').'</textarea>'.$error('message').'</div>';
        $out .= '<input type="hidden" name="request_id" value="'.$value('request_id').'"><input type="hidden" name="quiz" value="'.$value('quiz').'"><div hidden aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>';
        $out .= '<label class="consent"><input type="checkbox" name="consent" id="consent" required'.(($values['consent'] ?? '') === 'on' ? ' checked' : '').$invalid('consent').'><span>Даю <a href="../consent.html">согласие на обработку персональных данных</a></span></label>'.$error('consent');
        $out .= '<button class="btn btn--light" type="submit">Отправить сообщение</button><p class="form__note">Повтор того же сообщения проверяется сервером и не создаёт новое письмо в течение суток.</p></form>';
    }
    return $out.'<p><a href="../index.html#contacts">Вернуться к контактам на сайте</a></p></main></body></html>';
}

function respond(array $result, bool $json, array $values, array $config): void
{
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Robots-Tag: noindex, nofollow');
    header("Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    if ($result['status'] === 405) header('Allow: POST');
    if ($result['status'] === 429) header('Retry-After: 900');
    if (!$json && $result['ok'] && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        header('Location: contact.php?receipt='.Contact::receipt($result['request_id'], $config), true, 303);
        return;
    }
    http_response_code($result['status']);
    header('Content-Type: '.($json ? 'application/json' : 'text/html').'; charset=UTF-8');
    if ($json) echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    else echo renderResponse($result, $values);
}
