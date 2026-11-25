<?php
declare(strict_types=1);
namespace Murrif;
use PHPMailer\PHPMailer\PHPMailer;

function createMail(array $values, array $config, string $id): PHPMailer
{
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_user'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = $config['smtp_encryption'] === 'smtps' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
    $mail->Timeout = 5;
    $mail->getSMTPInstance()->Timelimit = 8;
    $mail->SMTPDebug = 0;
    $mail->SMTPKeepAlive = false;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($config['from'], 'murrif.ru');
    $mail->addAddress($config['to']);
    if (filter_var($values['contact'], FILTER_VALIDATE_EMAIL)) $mail->addReplyTo($values['contact']);
    $mail->isHTML(false);
    $mail->Subject = 'Обращение с murrif.ru';
    $mail->Body = "Обращение: $id\nИмя: {$values['name']}\nКонтакт: {$values['contact']}\nУслуга: {$values['service']}\nПодбор формата: "
        . ($values['quiz'] ?: 'не проходил') . "\n\nЗадача:\n" . ($values['message'] ?: '—')
        . "\n\nСогласие: отмечено. Версия формы: 2026-11-24.\n";
    return $mail;
}

function smtpSend(array $values, array $config, string $id): void
{
    if (!createMail($values, $config, $id)->send()) throw new \RuntimeException('smtp_failed');
}
