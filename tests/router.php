<?php
// LOCAL TEST ROUTER ONLY: CLI server, fake transport, no SMTP connections.
declare(strict_types=1);
if(PHP_SAPI!=='cli-server') { http_response_code(404);exit; }
$root=dirname(__DIR__);$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if($path==='/__qa/unconfigured') { require $root.'/dist/api/contact.php'; return; }
if($path==='/api/contact.php') {
 require $root.'/server/Contact.php';require $root.'/server/Response.php';
 $c=['enabled'=>true,'origins'=>['http://127.0.0.1:4173','http://localhost:4173'],'secret'=>str_repeat('f',64),'state_dir'=>$root.'/private/http-qa','smtp_host'=>'smtp.example.invalid','smtp_port'=>465,'smtp_encryption'=>'smtps','smtp_user'=>'test@example.invalid','smtp_password'=>'fake-only','from'=>'test@example.invalid','to'=>'owner@example.invalid'];
 $json=str_contains($_SERVER['HTTP_ACCEPT']??'','application/json');
 if($_SERVER['REQUEST_METHOD']==='GET'&&\Murrif\Contact::validReceipt($_GET['receipt']??'',$c)){\Murrif\respond(\Murrif\Contact::result(200,'accepted'),false,[],$c);return;}
 $raw=file_get_contents('php://input',false,null,0,32769);
 $result=\Murrif\Contact::handle($_SERVER,$raw,$c,function($v,$c,$id){
   if(str_contains($v['message'],'TEST_FAILURE'))throw new RuntimeException('mock_failure');
   file_put_contents($c['state_dir'].'/test-count',"accepted\n",FILE_APPEND|LOCK_EX);
 });
 $values=[];if(!$json)parse_str($raw,$values);
 \Murrif\respond($result,$json,$values,$c);return;
}
if($path==='/__qa/no-js') {
 header("Content-Security-Policy: script-src 'none'");header('Content-Type: text/html; charset=UTF-8');
 // Absolute root-relative resources/actions solely for the local no-JS test document.
 $html=file_get_contents($root.'/index.html');$html=str_replace('<head>','<head><base href="/">',$html);echo $html;return;
}
// The dev document root contains public files only. Do not expose the repo.
return false;
