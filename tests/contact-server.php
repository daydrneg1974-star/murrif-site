<?php
declare(strict_types=1);
require __DIR__.'/../server/Contact.php';
require __DIR__.'/../server/Response.php';
use Murrif\Contact;
$tests=0;
function check(bool $condition,string $name):void { global $tests; $tests++; if(!$condition)throw new RuntimeException("FAIL $name"); echo "PASS $name\n"; }
$root=sys_get_temp_dir().'/murrif-test-'.bin2hex(random_bytes(8));
mkdir($root,0700);
$c=['enabled'=>true,'origins'=>['https://example.invalid'],'secret'=>str_repeat('a',64),'state_dir'=>$root,'smtp_host'=>'smtp.example.invalid','smtp_port'=>465,'smtp_encryption'=>'smtps','smtp_user'=>'sender@example.invalid','smtp_password'=>'test-only','from'=>'sender@example.invalid','to'=>'owner@example.invalid'];
$server=['REQUEST_METHOD'=>'POST','CONTENT_TYPE'=>'application/json','HTTP_ORIGIN'=>'https://example.invalid','REMOTE_ADDR'=>'192.0.2.1'];
function valid(array $override=[]):array{return array_replace(['name'=>'Тест 🙂','contact'=>'test@example.invalid','service'=>'Сайт-визитка','message'=>'Тест <>&','consent'=>'on','quiz'=>'Сайт-визитка','website'=>'','request_id'=>bin2hex(random_bytes(16))],$override);}
$calls=0;$send=function($v,$cfg,$id)use(&$calls){$calls++;};
function run(array $v,array $s=[],array $cfg=[],?callable $transport=null,?int $now=null):array {global $server,$c,$send;return Contact::handle(array_replace($server,$s),json_encode($v),array_replace($c,$cfg),$transport??$send,$now);}
try {
 $v=valid();$r=run($v);check($r['ok']&&$calls===1,'valid Unicode request accepted by fake transport');
 check(run($v)['ok']&&$calls===1,'same key retry does not resend');
 $otherKey=$v;$otherKey['request_id']=bin2hex(random_bytes(16));check(run($otherKey)['ok']&&$calls===1,'same payload new key does not resend');
 check(run(array_replace($v,['message'=>'changed']))['code']==='conflict'&&$calls===1,'idempotency key bound to payload');
 foreach(['name'=>'','contact'=>'','service'=>'bogus','consent'=>'','message'=>str_repeat('я',4001),'website'=>'bot','quiz'=>'bad'] as $key=>$value) check(run(valid([$key=>$value]))['status']===422,'reject invalid '.$key);
 foreach(['name','contact','message','service','consent','quiz','website','request_id'] as $key)check(run(valid([$key=>['bad']]))['status']===422,'reject array '.$key);
 foreach(['name'=>str_repeat('я',81),'contact'=>str_repeat('a',161),'name-space'=>"\u{00A0}"] as $key=>$value)check(run(valid([$key==='name-space'?'name':$key=>$value]))['status']===422,'length / whitespace '.$key);
 check(run(valid(['contact'=>"test@example.invalid\r\nBcc: attacker@example.invalid"]))['status']===422,'header injection rejected');
 check(run(valid(['to'=>'attacker@example.invalid']))['status']===422,'recipient substitution rejected');
 foreach(['@test_user','+7 (999) 123-45-67','https://t.me/test_user'] as $contact)check(run(valid(['contact'=>$contact]))['ok'],'phone / messenger needs no email '.$contact);
 check(run(valid(['message'=>'fifth']))['ok'],'fifth unique message accepted');
 check(run(valid(['message'=>'sixth']))['status']===429,'IP rate limit persisted');
 check(run(valid(['message'=>'sixth']),['HTTP_X_FORWARDED_FOR'=>'198.51.100.9'])['status']===429,'untrusted forwarding header cannot bypass rate limit');
 check(run(valid(),['REQUEST_METHOD'=>'GET'])['status']===405,'method');
 check(run(valid(),['CONTENT_TYPE'=>'text/plain'])['status']===415,'content type');
 check(run(valid(),['CONTENT_LENGTH'=>40000])['status']===413,'declared size');
 check(Contact::handle($server,str_repeat('x',32769),$c,$send)['status']===413,'actual size');
 check(Contact::handle($server,'{"name":',$c,$send)['status']===400,'invalid JSON');
 check(Contact::handle($server,'[]',$c,$send)['status']===400,'nonobject JSON');
 check(Contact::handle($server,"{\"name\":\"\xFF\"}",$c,$send)['status']===400,'invalid UTF8');
 check(run(valid(),['HTTP_ORIGIN'=>'https://evil.invalid'])['status']===403,'foreign origin');
 check(run(valid(),['HTTP_ORIGIN'=>'null'])['status']===403,'null origin');
 check(run(valid(),['HTTP_SEC_FETCH_SITE'=>'cross-site'])['status']===403,'fetch metadata');
 check(run(valid(),[],['enabled'=>false])['status']===503,'disabled config');
 check(run(valid(),[],['smtp_password'=>''])['status']===503,'missing config');
 $bad=valid(['message'=>'transport-fails']);$fail=function(){throw new RuntimeException('secret test@example.invalid 123456');};
 $r=run($bad,['REMOTE_ADDR'=>'192.0.2.2'],[],$fail);check($r['status']===503&&!$r['ok'],'SMTP exception is not success');
 $before=$calls;check(run($bad)['code']==='uncertain'&&$calls===$before,'uncertain delivery never automatically resent');
 $r=run(valid(['message'=>'timeout']),['REMOTE_ADDR'=>'192.0.2.3'],[],function(){throw new RuntimeException('timeout');});check($r['code']==='uncertain','transport timeout');
 $nested=valid(['message'=>'concurrent']);$concurrentResult=null;
 $r=run($nested,['REMOTE_ADDR'=>'192.0.2.4'],[],function()use($nested,&$concurrentResult){$concurrentResult=run($nested);});
 check($r['ok']&&$concurrentResult['code']==='uncertain','concurrent replay sees durable pending reservation');
 $content=file_get_contents($root.'/state.json').file_get_contents($root.'/events.log');
 foreach(['test@example.invalid','Тест','192.0.2.','test-only','123456'] as $needle)check(!str_contains($content,$needle),'no sensitive data in state/log '.$needle);
 $html=\Murrif\renderResponse(Contact::result(422,'invalid',['name'=>'error']),valid(['message'=>'</textarea><script>alert(1)</script>']));
 check(!str_contains($html,'<script>')&&str_contains($html,'&lt;script&gt;'),'HTML response escapes values and preserves text');
 $receipt=Contact::receipt(str_repeat('b',24),$c);check(Contact::validReceipt($receipt,$c),'signed receipt');check(!Contact::validReceipt($receipt.'x',$c),'forged receipt rejected');
 $form=valid(['message'=>'no-JS']);$form['request_id']='';
 $r=Contact::handle(array_replace($server,['CONTENT_TYPE'=>'application/x-www-form-urlencoded','REMOTE_ADDR'=>'192.0.2.6']),http_build_query($form),$c,$send);
 check($r['ok'],'native no-JS form encoding');
 check(Contact::handle(array_replace($server,['CONTENT_TYPE'=>'application/x-www-form-urlencoded']),http_build_query($form).'&name=duplicate',$c,$send)['status']===400,'duplicate fields rejected');
 require __DIR__.'/../server/vendor/autoload.php'; require __DIR__.'/../server/Smtp.php';
 $mail=\Murrif\createMail(valid(),$c,'test-id');
 check($mail->From===$c['from']&&array_keys($mail->getAllRecipientAddresses())===[$c['to']],'SMTP fixed sender and recipient');
 check(array_column($mail->getReplyToAddresses(),0)===['test@example.invalid'],'validated email used for Reply-To');
 check(\Murrif\createMail(valid(['contact'=>'@test_user']),$c,'test-id')->getReplyToAddresses()===[],'no Reply-To for messenger');
 check($mail->SMTPSecure==='ssl'&&$mail->SMTPOptions['ssl']['verify_peer']===true&&$mail->SMTPOptions['ssl']['verify_peer_name']===true,'TLS certificate checks enabled');
 check($mail->SMTPDebug===0&&$mail->Timeout===5&&$mail->getSMTPInstance()->Timelimit===8,'SMTP diagnostics disabled and bounded operation timeouts');
 check($mail->ContentType==='text/plain'&&$mail->preSend(),'PHPMailer builds plain UTF8 MIME message without network');
 check(!str_contains($mail->getSentMIMEMessage(),'Bcc:'),'no unrequested Bcc header');
 check(str_contains($mail->Body,'Подбор формата: Сайт-визитка'),'quiz recommendation reaches mail body');
 $later=time()+86401;check(run($v,[],[],null,$later)['ok'],'expired records cleaned and legitimate new request accepted');
 echo "TOTAL $tests PASS\n";
} finally {foreach(glob($root.'/*')as$file)unlink($file);rmdir($root);}
