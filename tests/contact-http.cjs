// Requires the local tests/router.php server. No real SMTP transport.
const assert = require('node:assert/strict');
const fs=require('node:fs');
const root='http://127.0.0.1:4173';
const data={name:'HTTP test',contact:'http@example.invalid',service:'Сайт-визитка',message:'HTTP contract '+Date.now(),consent:'on',website:'',quiz:'Лендинг',request_id:require('node:crypto').randomBytes(16).toString('hex')};
const post=(body,opts={})=>fetch(root+(opts.path||'/api/contact.php'),{method:'POST',redirect:'manual',headers:{Origin:root,'Content-Type':'application/json',Accept:'application/json',...opts.headers},body:typeof body==='string'?body:JSON.stringify(body)});
(async()=>{
 const results=[];
 const record=(name)=>results.push({name,status:'PASS'});
 let r=await post(data);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);record('HTTP JSON accepted by fake transport');
 r=await post(data);assert.equal(r.status,200);record('HTTP retry');
 r=await post({...data,name:'',message:'invalid'});assert.equal(r.status,422);assert((await r.json()).errors.name);record('HTTP validation');
 r=await post(data,{path:'/__qa/unconfigured'});assert.equal(r.status,503);assert.equal((await r.json()).ok,false);record('production entry point without enabled SMTP config');
 r=await post(new URLSearchParams({...data,request_id:require('node:crypto').randomBytes(16).toString('hex'),message:'native form '+Date.now()}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'text/html'}});
 assert.equal(r.status,303);const location=r.headers.get('location');assert(!location.includes('example.invalid'));record('native form uses POST-redirect-GET and opaque receipt');
 r=await fetch(new URL(location,root+'/api/contact.php'));assert.equal(r.status,200);assert((await r.text()).includes('Почтовый сервер принял'));record('receipt GET');
 r=await post(new URLSearchParams({...data,name:'',message:'</textarea><script>secret</script>'}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'text/html'}});
 assert.equal(r.headers.get('referrer-policy'),'same-origin');const html=await r.text();assert.equal(r.status,422);assert(html.includes('&lt;script&gt;'));assert(html.includes('http@example.invalid'));assert(!html.includes('<script>'));record('no-JS invalid fields preserved and escaped');
 r=await fetch(root+'/api/contact.php');assert.equal(r.status,405);record('bare GET cannot claim success');
 const paths=['/css/style.css?v=20261124-2','/js/contact.js?v=20261124-1','/fonts/onest-cyrillic.woff2','/fonts/onest-latin.woff2','/fonts/jetbrains-mono-cyrillic.woff2','/fonts/jetbrains-mono-latin.woff2'];
 for(const path of paths){r=await fetch(root+path);assert.equal(r.status,200,path);}record('CSS JS fonts return 200');
 fs.mkdirSync('docs/reports/contact-2026-11-24',{recursive:true});fs.writeFileSync('docs/reports/contact-2026-11-24/http.json',JSON.stringify(results,null,2)+'\n');console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
