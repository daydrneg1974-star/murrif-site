<?php
// Optional daily CLI task; never put this file under public_html.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/Contact.php';
$config = require __DIR__.'/config.php';
$store = new \Murrif\StateStore($config['state_dir']);
$now = time();
$store->transaction(function (&$state) use ($now) {
    foreach (['messages', 'keys'] as $group) foreach ($state[$group] as $key=>$row) if ($row['at'] <= $now - 86400) unset($state[$group][$key]);
    foreach ($state['ips'] as $key=>$rows) { $state['ips'][$key] = array_values(array_filter($rows, fn($at)=>$at > $now-900)); if (!$state['ips'][$key]) unset($state['ips'][$key]); }
    $state['global'] = array_values(array_filter($state['global'], fn($at)=>$at > $now-3600));
});
// Retain diagnostics for at most 7 days when cleanup runs daily.
$file = $config['state_dir'].'/events.log';
$lock = fopen($config['state_dir'].'/events.lock', 'c');
if ($lock && flock($lock, LOCK_EX)) {
    if (is_file($file)) {
        $rows = array_filter(file($file), fn($row)=>(strtotime(substr($row,0,25)) ?: 0) > $now-604800);
        file_put_contents($file, implode('', $rows));
    }
    flock($lock, LOCK_UN); fclose($lock);
}
