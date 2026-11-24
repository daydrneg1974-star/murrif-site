<?php
declare(strict_types=1);
namespace Murrif;

final class Contact
{
    public const SERVICES = ['Пока не знаю, нужна консультация', 'Сайт-визитка', 'Лендинг', 'Веб-приложение'];
    public const LIMIT_BYTES = 32768;
    public const TTL = 86400;
    public const MESSAGES = [
        'accepted' => 'Почтовый сервер принял сообщение. Спасибо за обращение! Это подтверждение отправки, а не доставки во входящие.',
        'invalid' => 'Проверьте отмеченные поля. Сообщение не отправлено.',
        'rate_limit' => 'Слишком много обращений. Попробуйте через 15 минут или воспользуйтесь прямыми контактами.',
        'unavailable' => 'Форма временно недоступна. Данные сохранены на этой странице. Свяжитесь со мной по контактам на сайте.',
        'uncertain' => 'Не удалось подтвердить отправку. Сообщение могло быть принято: повторно его не отправляем. Уточните получение по прямым контактам.',
        'conflict' => 'Этот запрос уже использован с другими данными. Обновите страницу перед новым обращением.',
        'request' => 'Не удалось обработать запрос. Вернитесь к форме на сайте.',
    ];

    public static function result(int $status, string $code, array $errors = [], ?string $id = null): array
    {
        return ['status' => $status, 'code' => $code, 'ok' => $code === 'accepted',
            'message' => self::MESSAGES[$code], 'errors' => $errors, 'request_id' => $id];
    }

    public static function validate(array $data): array
    {
        $allowed = ['name', 'contact', 'service', 'message', 'consent', 'website', 'request_id', 'quiz'];
        if (array_diff(array_keys($data), $allowed)) {
            return [[], ['form' => 'Недопустимый состав полей.']];
        }
        $values = [];
        $errors = [];
        foreach ($allowed as $key) {
            $value = $data[$key] ?? '';
            if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
                $errors[$key] = 'Неверный формат поля.';
                continue;
            }
            // Unicode spaces, including NBSP, count as empty.
            $values[$key] = preg_replace('/^\s+|\s+$/u', '', $value);
        }
        if ($errors) return [[], $errors];
        foreach (['name' => 80, 'contact' => 160, 'message' => 4000] as $key => $max) {
            if (($key !== 'message' && $values[$key] === '') || mb_strlen($values[$key]) > $max) {
                $errors[$key] = $key === 'message' ? 'Сократите текст до 4000 символов.' : "Заполните поле: не более $max символов.";
            }
            $pattern = $key === 'message' ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F\x{2028}\x{2029}]/u';
            if (preg_match($pattern, $values[$key])) $errors[$key] = 'Уберите недопустимые управляющие символы.';
        }
        if (!in_array($values['service'], self::SERVICES, true)) $errors['service'] = 'Выберите услугу из списка.';
        $contact = $values['contact'];
        $email = filter_var($contact, FILTER_VALIDATE_EMAIL) !== false;
        $telegram = preg_match('/^(?:@|https:\/\/t\.me\/)[A-Za-z][A-Za-z0-9_]{4,31}$/D', $contact);
        $phone = preg_match('/^\+?[0-9 ()\-]+$/D', $contact) && preg_match('/^[0-9]{7,15}$/D', preg_replace('/\D/', '', $contact));
        if (!$email && !$telegram && !$phone) $errors['contact'] = 'Укажите email, телефон (7–15 цифр) или Telegram: @username.';
        if ($values['consent'] !== 'on') $errors['consent'] = 'Отметьте согласие на обработку данных.';
        if ($values['website'] !== '') $errors['form'] = 'Запрос отклонён. Используйте прямые контакты.';
        if ($values['request_id'] !== '' && !preg_match('/^[a-f0-9]{32}$/D', $values['request_id'])) $errors['form'] = 'Неверный идентификатор запроса.';
        if ($values['quiz'] !== '' && !in_array($values['quiz'], array_slice(self::SERVICES, 1), true)) $errors['form'] = 'Неверный результат подбора.';
        return [$values, $errors];
    }

    public static function configured(array $c): bool
    {
        if (($c['enabled'] ?? false) !== true) return false;
        foreach (['secret', 'state_dir', 'smtp_host', 'smtp_user', 'smtp_password', 'from', 'to'] as $key) {
            if (!isset($c[$key]) || !is_string($c[$key]) || $c[$key] === '') return false;
        }
        return strlen($c['secret']) >= 64 && filter_var($c['from'], FILTER_VALIDATE_EMAIL)
            && filter_var($c['to'], FILTER_VALIDATE_EMAIL) && !empty($c['origins'])
            && (($c['smtp_encryption'] === 'smtps' && $c['smtp_port'] === 465)
                || ($c['smtp_encryption'] === 'starttls' && $c['smtp_port'] === 587));
    }

    private static function origin(array $server, array $origins): bool
    {
        if (isset($server['HTTP_SEC_FETCH_SITE']) && !in_array($server['HTTP_SEC_FETCH_SITE'], ['same-origin', 'same-site', 'none'], true)) return false;
        if (isset($server['HTTP_ORIGIN'])) return in_array($server['HTTP_ORIGIN'], $origins, true);
        $parts = parse_url($server['HTTP_REFERER'] ?? '');
        if (!$parts || !isset($parts['scheme'], $parts['host'])) return false;
        $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        return in_array($origin, $origins, true);
    }

    public static function handle(array $server, string $raw, array $c, callable $send, ?int $now = null): array
    {
        $now ??= time();
        if (($server['REQUEST_METHOD'] ?? '') !== 'POST') return self::result(405, 'request');
        if (strlen($raw) > self::LIMIT_BYTES || (int)($server['CONTENT_LENGTH'] ?? 0) > self::LIMIT_BYTES) return self::result(413, 'request');
        $type = strtolower(trim(explode(';', $server['CONTENT_TYPE'] ?? '')[0]));
        if (!in_array($type, ['application/json', 'application/x-www-form-urlencoded'], true)) return self::result(415, 'request');
        if (!self::origin($server, $c['origins'] ?? [])) return self::result(403, 'request');
        if ($type === 'application/json') {
            try { $decoded = json_decode($raw, false, 16, JSON_THROW_ON_ERROR); }
            catch (\JsonException $e) { return self::result(400, 'request'); }
            if (!$decoded instanceof \stdClass) return self::result(400, 'request');
            $data = (array)$decoded;
        } else {
            $data = [];
            foreach (explode('&', $raw) as $pair) {
                $parts = explode('=', $pair, 2);
                $key = urldecode($parts[0]);
                if (array_key_exists($key, $data)) return self::result(400, 'request');
                $data[$key] = urldecode($parts[1] ?? '');
            }
        }
        [$values, $errors] = self::validate($data);
        if ($errors) return self::result(422, 'invalid', $errors);
        if (!self::configured($c)) return self::result(503, 'unavailable');
        // No raw IP, message, email or phone is persisted in the state file.
        $fingerprint = hash_hmac('sha256', json_encode(array_intersect_key($values, array_flip(['name','contact','service','message','consent','quiz'])), JSON_UNESCAPED_UNICODE), $c['secret']);
        $ipKey = hash_hmac('sha256', $server['REMOTE_ADDR'] ?? 'unknown', $c['secret']);
        $key = $values['request_id'] !== '' ? $values['request_id'] : substr($fingerprint, 0, 32);
        $id = bin2hex(random_bytes(12));
        $store = new StateStore($c['state_dir']);
        try {
            $decision = $store->transaction(function (&$state) use ($now, $fingerprint, $ipKey, $key, $id) {
                foreach ($state['messages'] as $f => $row) if ($row['at'] <= $now - self::TTL) unset($state['messages'][$f]);
                foreach ($state['keys'] as $k => $row) if ($row['at'] <= $now - self::TTL) unset($state['keys'][$k]);
                foreach ($state['ips'] as $ip => $row) {
                    $state['ips'][$ip] = array_values(array_filter($row, fn($at) => $at > $now - 900));
                    if (!$state['ips'][$ip]) unset($state['ips'][$ip]);
                }
                $state['global'] = array_values(array_filter($state['global'], fn($at) => $at > $now - 3600));
                if (isset($state['keys'][$key]) && $state['keys'][$key]['fingerprint'] !== $fingerprint) return self::result(409, 'conflict');
                if (isset($state['messages'][$fingerprint])) {
                    $old = $state['messages'][$fingerprint];
                    return self::result($old['status'] === 'accepted' ? 200 : 409, $old['status'] === 'accepted' ? 'accepted' : 'uncertain', [], $old['id']);
                }
                if (count($state['ips'][$ipKey] ?? []) >= 5 || count($state['global']) >= 60 || count($state['messages']) >= 2000) return self::result(429, 'rate_limit');
                $state['ips'][$ipKey][] = $now;
                $state['global'][] = $now;
                $state['keys'][$key] = ['at' => $now, 'fingerprint' => $fingerprint];
                $state['messages'][$fingerprint] = ['at' => $now, 'status' => 'pending', 'id' => $id];
                return null;
            });
            if ($decision !== null) return $decision;
            // Reservation is durable before SMTP. A crash leaves pending and never triggers an automatic resend.
            try {
                $send($values, $c, $id);
                $outcome = 'accepted';
            } catch (\Throwable $e) {
                // Never log SMTP exception details: they may contain addresses or credentials.
                $outcome = 'uncertain';
            }
            $store->transaction(function (&$state) use ($fingerprint, $outcome) { $state['messages'][$fingerprint]['status'] = $outcome; });
            self::log($c, $id, $outcome);
            return self::result($outcome === 'accepted' ? 200 : 503, $outcome, [], $id);
        } catch (\Throwable $e) {
            // Includes a failure to persist acceptance after SMTP. Do not claim acceptance or retry transport.
            self::log($c, $id, 'state_error');
            return self::result(503, 'uncertain', [], $id);
        }
    }

    public static function log(array $c, string $id, string $code): void
    {
        $file = $c['state_dir'] . '/events.log';
        // Bounded local diagnostic log; only enum codes, random IDs and timestamp.
        $lock = @fopen($c['state_dir'] . '/events.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if ($lock) fclose($lock); return; }
        if (is_file($file) && filesize($file) > 262144) @unlink($file);
        @file_put_contents($file, gmdate('c') . " $id $code\n", FILE_APPEND);
        @chmod($file, 0600);
        flock($lock, LOCK_UN); fclose($lock);
    }

    public static function receipt(string $id, array $c): string
    {
        $value = $id . '.' . (time() + 600);
        return $value . '.' . hash_hmac('sha256', $value, $c['secret']);
    }
    public static function validReceipt(string $receipt, array $c): bool
    {
        if (!preg_match('/^([a-f0-9]{24})\.([0-9]{10})\.([a-f0-9]{64})$/D', $receipt, $m) || empty($c['secret'])) return false;
        return (int)$m[2] >= time() && (int)$m[2] <= time() + 600 && hash_equals(hash_hmac('sha256', $m[1].'.'.$m[2], $c['secret']), $m[3]);
    }
}

final class StateStore
{
    public function __construct(private string $directory) {}
    public function transaction(callable $fn): mixed
    {
        if (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true) && !is_dir($this->directory)) throw new \RuntimeException('state_directory');
        $lock = @fopen($this->directory . '/state.lock', 'c');
        if (!$lock) throw new \RuntimeException('state_lock');
        @chmod($this->directory . '/state.lock', 0600);
        try {
            if (!flock($lock, LOCK_EX | LOCK_NB)) throw new \RuntimeException('state_busy');
            $path = $this->directory . '/state.json';
            $state = is_file($path) ? json_decode((string)file_get_contents($path), true, 32, JSON_THROW_ON_ERROR) : ['messages'=>[], 'keys'=>[], 'ips'=>[], 'global'=>[]];
            foreach (['messages','keys','ips','global'] as $key) if (!is_array($state[$key] ?? null)) throw new \RuntimeException('state_invalid');
            $result = $fn($state);
            $temp = tempnam($this->directory, '.state-');
            if ($temp === false) throw new \RuntimeException('state_temp');
            try {
                if (file_put_contents($temp, json_encode($state, JSON_THROW_ON_ERROR), LOCK_EX) === false || !chmod($temp, 0600) || !rename($temp, $path)) throw new \RuntimeException('state_write');
            } finally { if (is_file($temp)) unlink($temp); }
            return $result;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}
