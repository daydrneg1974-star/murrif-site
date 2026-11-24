<?php
declare(strict_types=1);
// Only this small entry point belongs in public_html/api/.
ini_set('display_errors', '0');
ini_set('log_errors', '0'); // App diagnostics contain only neutral codes and random IDs.
umask(0077);
if (function_exists('set_time_limit')) @set_time_limit(25);
$private = getenv('MURRIF_CONTACT_DIR') ?: dirname(__DIR__, 2).'/private/murrif-contact';
$directory = realpath($private);
$public = realpath(dirname(__DIR__));
$json = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
if (!$directory || !$public || str_starts_with($directory.'/', $public.'/') || !is_file($directory.'/Contact.php')) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    header('Content-Type: '.($json ? 'application/json' : 'text/html').'; charset=UTF-8');
    echo $json ? '{"ok":false,"code":"unavailable","message":"Форма временно недоступна. Используйте прямые контакты.","errors":{}}' : '<!doctype html><html lang="ru"><meta charset="UTF-8"><title>Форма временно недоступна</title><p>Форма временно недоступна. Вернитесь назад, чтобы сохранить введённые данные, или <a href="../index.html#contacts">свяжитесь напрямую</a>.</p></html>';
    exit;
}
require $directory.'/Contact.php';
require $directory.'/Response.php';
$config = ['origins'=>['https://murrif.ru', 'https://www.murrif.ru']];
$raw = file_get_contents('php://input', false, null, 0, \Murrif\Contact::LIMIT_BYTES + 1);
$values = [];
if (strlen($raw ?: '') <= \Murrif\Contact::LIMIT_BYTES && !$json) parse_str($raw ?: '', $values);
try {
    if (is_file($directory.'/config.php')) $config = require $directory.'/config.php';
    if (!is_array($config)) throw new RuntimeException('config');
    if (is_file($directory.'/vendor/autoload.php')) require $directory.'/vendor/autoload.php';
    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) $config['enabled'] = false;
    $statePath = realpath($config['state_dir'] ?? $directory) ?: dirname($config['state_dir'] ?? $directory);
    if (str_starts_with($statePath.'/', $public.'/')) $config['enabled'] = false;
    require $directory.'/Smtp.php';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && \Murrif\Contact::validReceipt(is_string($_GET['receipt'] ?? null) ? $_GET['receipt'] : '', $config)) {
        \Murrif\respond(\Murrif\Contact::result(200, 'accepted'), false, [], $config); exit;
    }
    $result = \Murrif\Contact::handle($_SERVER, $raw ?: '', $config, '\\Murrif\\smtpSend');
    \Murrif\respond($result, $json, $values, $config);
} catch (Throwable $e) {
    \Murrif\respond(\Murrif\Contact::result(503, 'unavailable'), $json, $values, $config);
}
