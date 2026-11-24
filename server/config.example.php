<?php
declare(strict_types=1);
// Copy to private/murrif-contact/config.php OUTSIDE public_html.
// Enter secrets using the hosting file editor or SSH; never in chat or Git.
return [
    'enabled' => false, // Enable only after configuration and publication approval.
    'origins' => ['https://murrif.ru', 'https://www.murrif.ru'],
    'secret' => '', // Generate locally on server: bin2hex(random_bytes(32)).
    'state_dir' => __DIR__ . '/var',
    'smtp_host' => '', // For a SpaceWeb mailbox: smtp.spaceweb.ru (confirm mailbox first).
    'smtp_port' => 465,
    'smtp_encryption' => 'smtps', // smtps (465) or starttls (587); never unencrypted.
    'smtp_user' => '',
    'smtp_password' => '',
    'from' => '', // Existing authenticated mailbox; usually equals smtp_user.
    'to' => '', // Owner-approved mailbox. Must match privacy/consent documents.
];
