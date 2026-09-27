const assert=require('assert/strict'),app=require('../server'),db=require('../database/db');
(async()=>{const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port;let token;
async function api(path,method='GET',body){const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw Error(path+': '+res.status+' '+JSON.stringify(data));assert(data.success);return data;}
try{token=(await api('/auth/login','POST',{username:process.env.TEST_ADMIN_USERNAME,password:process.env.TEST_ADMIN_PASSWORD})).token;
const entries=[
['banners','banners','banners',{title:'测试轮播',image_url:'/images/placeholder.svg',link_url:'/about',sort_order:1,is_active:1},'/'],
['news','news','news',{title:'测试新闻',category:'research',summary:'摘要',content:'<p>正文</p>',publish_date:'2026-09-26',is_active:1,is_top:0},'/news/'],
['team','members','team_members',{name:'测试成员',title:'教师',member_type:'teacher',role:'member',bio:'简介',is_active:1},'/team/'],
['alumni','alumni','alumni',{name:'测试毕业生',degree_level:'master',graduation_year:2026,destination_type:'employment',destination:'测试单位',is_active:1},null],
['projects','projects','projects',{title:'测试项目',description:'项目说明',start_date:'2026-01-01',end_date:'2027-01-01',status:'进行中',content:'<p>项目正文</p>',is_active:1},'/project/'],
['platforms','platforms','platforms',{name:'测试平台',level:'national',description:'平台说明',is_active:1},'/platforms'],
['patents','patents','patents',{title:'测试专利',grant_date:'2026-09-26',patent_no:'TEST',content:'<p>专利正文</p>',is_active:1},'/patent/'],
['papers','papers','papers',{title:'测试论文',authors:'测试作者',venue:'测试期刊',year:2026,pub_type:'journal',link:'https://example.org/paper',sort_order:9,abstract:'摘要',content:'<p>论文正文</p>',is_active:1},'/paper/'],
['social-posts','posts','social_posts',{title:'测试媒体',platform:'测试媒体',publish_date:'2026-09-26',url:'https://example.org/article',is_active:1},'/'],
['downloads','downloads','downloads',{title:'测试数据',description:'测试资源',file_url:'/images/placeholder.svg',file_size:'1 KB',category:'dataset',is_active:1},'/download/']];
for(const [route,key,table,payload,front]of entries){const before=await db.all('SELECT id FROM '+table);await api('/'+route,'POST',payload);const rows=await db.all('SELECT * FROM '+table);const row=rows.find(x=>!before.some(y=>y.id===x.id));assert(row,route+' creates');const field=payload.name?'name':'title',changed={...payload,[field]:payload[field]+'修改'};
if(route==='papers'){delete changed.link;delete changed.sort_order;}
await api('/'+route+'/'+row.id,'PUT',changed);if(route==='papers'){const saved=await db.get('SELECT * FROM papers WHERE id=?',[row.id]);assert.equal(saved.link,payload.link);assert.equal(saved.sort_order,9);}assert.equal((await db.get('SELECT * FROM '+table+' WHERE id=?',[row.id]))[field],changed[field]);
if(front){const url=front==='/'?front:front.endsWith('/')?front+row.id:front;const res=await fetch(base+url);assert.equal(res.status,200,route+' public');if(route!=='downloads'&&route!=='banners')assert((await res.text()).includes(changed[field]),route+' visible');}
await api('/'+route+'/'+row.id,'PUT',{...changed,is_active:0});if(front&&front.endsWith('/')&&route!=='banners'){const res=await fetch(base+front+row.id,{redirect:'manual'});assert.equal(res.status,404,route+' unpublished');}
await api('/'+route+'/'+row.id,'DELETE');assert.equal(await db.get('SELECT id FROM '+table+' WHERE id=?',[row.id]),null);const missing=await fetch(base+'/api/'+route+'/'+row.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});assert.equal(missing.status,404);
console.log('PASS create/update/publication/unpublish/delete:',route);
}
const settings=await api('/settings');await api('/settings','PUT',{site_name:'验收站点名称'});assert((await (await fetch(base+'/')).text()).includes('验收站点名称'));await api('/settings','PUT',settings.settings);
await api('/page-content/about-intro','PUT',{content:'<p>验收简介</p><script>unsafe()</script>'});const content=await api('/page-content/about-intro');assert(!JSON.stringify(content).includes('<script>'));assert((await (await fetch(base+'/about')).text()).includes('验收简介'));
const upload=new FormData();upload.append('file',new Blob(['%PDF-1.4\n%test'],{type:'application/pdf'}),'test.pdf');const uploaded=await fetch(base+'/api/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:upload});assert.equal(uploaded.status,200);const uploadData=await uploaded.json();assert.equal((await fetch(base+uploadData.url)).status,200);
console.log('PASS settings, rich-content sanitization, upload');
}finally{await new Promise(r=>s.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
