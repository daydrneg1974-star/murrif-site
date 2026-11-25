<?php
// Build a review/deployment folder without secrets or development files.
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || empty($argv[1])) { fwrite(STDERR,"Usage: php scripts/package.php /absolute/output\n"); exit(1); }
$source=dirname(__DIR__);$target=rtrim($argv[1],'/');
if (!str_starts_with($target,'/') || is_dir($target)) { fwrite(STDERR,"Output must be a new absolute directory.\n"); exit(1); }
function copyTree(string $from,string $to):void { if(is_dir($from)){mkdir($to,0755,true);foreach(scandir($from) as $name)if($name!=='.'&&$name!=='..')copyTree($from.'/'.$name,$to.'/'.$name);}else{if(!is_dir(dirname($to)))mkdir(dirname($to),0755,true);if(!copy($from,$to))throw new RuntimeException('copy');} }
$public=['index.html','privacy.html','consent.html','robots.txt','sitemap.xml','.htaccess','photo-fade.webp','photo-square.webp','og-image.jpg','portfolio-stroy.jpg','portfolio-zski.jpg','fonts','css','js','api'];
$private=['Contact.php','Smtp.php','Response.php','cleanup.php','config.example.php','composer.json','composer.lock','vendor','.htaccess'];
foreach($public as $name)copyTree($source.'/'.$name,$target.'/public_html/'.$name);
foreach($private as $name)copyTree($source.'/server/'.$name,$target.'/private/murrif-contact/'.$name);
echo "Packaged public_html and private/murrif-contact (no live config).\n";
