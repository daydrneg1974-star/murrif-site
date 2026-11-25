const test = require('node:test');
const assert = require('node:assert/strict');
const {validate, bind} = require('../js/contact.js');
const valid = () => ({name:'Тестовый посетитель',contact:'test@example.invalid',service:'Сайт-визитка',message:'Тест 🙂',consent:'on',website:'',quiz:''});
for (const contact of ['test@example.invalid','+7 (999) 111-22-33','@test_user','https://t.me/test_user']) {
  test('client accepts contact ' + contact, () => assert.deepEqual(validate({...valid(),contact}),{}));
}
for (const [field,value] of [['name',' \u00a0 '],['name','я'.repeat(81)],['contact','not a contact'],['contact','test@example.invalid\r\nBcc: x@example.invalid'],['message','я'.repeat(4001)],['service','arbitrary'],['consent','']]) {
  test('client rejects ' + field + ' / ' + value.slice(0,20),()=> assert(validate({...valid(),[field]:value})[field]));
}
function setup(fetch) {
  const data=valid(); let handler; let resets=0; let timeout;
  const field = value => ({value,checked:true,setAttribute(){},removeAttribute(){},focus(){}});
  const fields=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,field(value)]));
  const status={dataset:{}}; const button={};
  const errors=Object.fromEntries(['name','contact','service','message','consent'].map(k=>[k+'-error',{}]));
  const form={elements:fields,action:'https://example.invalid/api/contact.php',querySelector:()=>button,setAttribute(){},removeAttribute(){},addEventListener:(name,fn)=>handler=fn,reset(){resets++;}};
  const win={fetch,AbortController,crypto:require('node:crypto').webcrypto,setTimeout:fn=>(timeout=fn,1),clearTimeout(){},document:{getElementById:id=>id==='formStatus'?status:errors[id]}};
  bind(form,win);
  return {form,status,button,submit:()=>handler({preventDefault(){}}),get resets(){return resets;},timeout:()=>timeout()};
}
test('success waits for confirmed response, blocks duplicate clicks and clears only then',async()=>{
  let resolve,calls=0;
  const page=setup(()=>{calls++;return new Promise(r=>resolve=r);});
  const pending=page.submit(); assert.equal(page.button.disabled,true); assert.equal(page.resets,0);
  await page.submit(); assert.equal(calls,1);
  resolve({ok:true,json:async()=>({ok:true,code:'accepted',message:'accepted'})}); await pending;
  assert.equal(page.status.dataset.state,'accepted');assert.equal(page.resets,1);assert.equal(page.button.disabled,false);
});
for (const code of ['invalid','rate_limit','unavailable','uncertain']) test('preserves all fields on '+code,async()=>{
  const page=setup(async()=>({ok:false,json:async()=>({ok:false,code,message:code,errors:{}})}));
  await page.submit();assert.equal(page.resets,0);assert.equal(page.status.dataset.state,code);assert.equal(page.form.elements.name.value,valid().name);
});
test('lost response reuses id on user retry and never auto-retries',async()=>{
  const bodies=[];const page=setup(async(url,options)=>{bodies.push(JSON.parse(options.body));throw Error('network');});
  await page.submit();assert.equal(bodies.length,1);assert.equal(page.resets,0);
  await page.submit();assert.equal(bodies.length,2);assert.equal(bodies[0].request_id,bodies[1].request_id);
  page.form.elements.message.value='new';await page.submit();assert.notEqual(bodies[1].request_id,bodies[2].request_id);
});
test('invalid JSON or false-positive HTTP response does not report success',async()=>{
  for(const response of [{ok:true,json:async()=>({ok:false})},{ok:true,json:async()=>{throw Error('HTML');}}]) {
    const page=setup(async()=>response);await page.submit();assert.equal(page.resets,0);assert.notEqual(page.status.dataset.state,'accepted');
  }
});
test('client timeout aborts once and retains data',async()=>{
  let calls=0; const page=setup((url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));});
  const pending=page.submit();page.timeout();await pending;assert.equal(calls,1);assert.equal(page.resets,0);assert.equal(page.status.dataset.state,'network');
});
