const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const assert=require('node:assert/strict');const test=require('node:test');
const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('homepage external CSS, form contract, SEO and local assets',()=>{
 assert(!/<style\b|\sstyle=/.test(html));assert(html.includes('css/style.css?v='));assert(html.includes('action="api/contact.php" method="post"'));assert(!html.includes("window.location.href = 'mailto:"));
 assert(html.includes('https://murrif.ru/'));assert(!/noindex/i.test(html));
 for(const file of ['robots.txt','sitemap.xml'])assert.equal(fs.readFileSync(path.join(root,file),'utf8').includes('https://murrif.ru/'),true);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 for(const [,id]of html.matchAll(/href="#([^"]+)"/g))assert(ids.includes(id),id);
 for(const [,src]of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!/^(?:[a-z]+:|\/)/i.test(src))assert(fs.existsSync(path.join(root,src.split('?')[0])),src);
 for(const [,script]of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script);
});
test('portfolio images and buttons match, status and lazy image dimensions retained',()=>{
 const cards=[...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
  .filter(([,attributes])=>(attributes.match(/\bclass="([^"]+)"/)?.[1]||'').split(/\s+/).includes('work'))
  .map(([, ,card])=>card);
 assert.equal(cards.length,2,'Both portfolio cards must actually be checked');
 assert(cards[0].includes('Демопроект'));
 assert(cards[1].includes('Версия для просмотра'));
 for(const card of cards) {
  const hrefs=[...card.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);assert.equal(hrefs.length,2);assert.equal(hrefs[0],hrefs[1]);
  assert(/loading="lazy"/.test(card));assert(/width="\d+" height="\d+"/.test(card));assert.equal((card.match(/rel="noopener noreferrer"/g)||[]).length,2);
 }
});
