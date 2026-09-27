const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),bcrypt=require('bcryptjs');
(async()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-access-'));process.env.LAB_DB_PATH=path.join(dir,'lab.db');process.env.LAB_UPLOAD_DIR=path.join(dir,'uploads');fs.copyFileSync(path.join(__dirname,'../database/lab.db'),process.env.LAB_DB_PATH);
const SQL=await require('sql.js')();const copy=new SQL.Database(fs.readFileSync(process.env.LAB_DB_PATH));copy.run('UPDATE admins SET password=? WHERE id=(SELECT MIN(id) FROM admins)',[bcrypt.hashSync('AccessTest2026',10)]);const username=copy.exec('SELECT username FROM admins ORDER BY id LIMIT 1')[0].values[0][0];fs.writeFileSync(process.env.LAB_DB_PATH,Buffer.from(copy.export()));copy.close();
const app=require('../server'),db=require('../database/db'),s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port;
async function call(route,method='GET',body,token){const response=await fetch(base+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};}
const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r;};
try{
const admin=check(await call('/auth/login','POST',{username,password:'AccessTest2026'}));const token=admin.token;assert.equal(admin.user.role,'superadmin');
const payload={username:'member_a',name:'测试教师',email:'a@example.org',password:'MemberTest2026',application_note:'权限测试',role:'superadmin',status:'active'};
check(await call('/auth/register','POST',payload),201);check(await call('/auth/register','POST',{...payload,username:'MEMBER_A'}),409);check(await call('/auth/login','POST',{username:'member_a',password:payload.password}),403);
check(await call('/auth/register','POST',{...payload,username:'member_b',name:'测试学生'}),201);
const users=check(await call('/accounts','GET',null,token)).users;const a=users.find(x=>x.username==='member_a'),b=users.find(x=>x.username==='member_b');assert.equal(a.role,'editor');
for(const u of [a,b])check(await call('/accounts/'+u.id,'PUT',{status:'active'},token));
const user=check(await call('/auth/login','POST',{username:a.username,password:payload.password})).token,other=check(await call('/auth/login','POST',{username:b.username,password:payload.password})).token;
for(const endpoint of ['/news','/team','/papers','/settings','/accounts','/reviews','/stats','/banners'])check(await call(endpoint,'GET',null,user),403);
check(await call('/news','POST',{title:'forbidden'},user),403);check(await call('/settings','PUT',{site_name:'forbidden'},user),403);
const schemas=check(await call('/contributions/schema','GET',null,user)).types;
const fixtures={team:{name:'审核教师',member_type:'teacher',email:'a@example.org',resume:'测试履历'},papers:{title:'审核论文',year:2026,authors:'Test Author'},news:{title:'审核新闻',content:'<p>正文</p><script>bad()</script>'},notices:{title:'审核通知'},projects:{title:'审核项目'},patents:{title:'审核专利'},downloads:{title:'审核资源',file_url:'https://example.org/data.zip'}};
for(const [type,payload]of Object.entries(fixtures)){
 const created=check(await call('/contributions','POST',{type,payload,status:'pending'},user),201);const review=check(await call('/reviews','GET',null,token)).submissions.find(x=>x.id===created.id);
 check(await call('/contributions/'+created.id,'PUT',{payload,version:review.version,status:'draft'},other),404);
 const approved=check(await call('/reviews/'+created.id+'/decision','POST',{decision:'approve',version:review.version},token));
 check(await call('/reviews/'+created.id+'/decision','POST',{decision:'approve',version:review.version},token),409);
 const owned=check(await call('/contributions','GET',null,user)).owned.find(x=>x.type===type);assert(owned);assert.equal(owned.record.owner_id,a.id);if(type==='news')assert(!owned.record.content.includes('<script>'));
 const oldTitle=owned.record.title||owned.record.name;const edit={...owned.record,...(type==='team'?{name:oldTitle+'修改'}:{title:oldTitle+'修改'})};
 const change=check(await call('/contributions','POST',{type,target_id:owned.record.id,payload:edit,status:'pending'},user),201);
 const still=check(await call('/contributions','GET',null,user)).owned.find(x=>x.type===type).record;assert.equal(still.title||still.name,oldTitle);
 check(await call('/reviews/'+change.id+'/decision','POST',{decision:'reject',note:'请补充来源',version:1},token));
 check(await call('/contributions/'+change.id,'PUT',{payload:edit,status:'pending',version:2},user));
 check(await call('/reviews/'+change.id+'/decision','POST',{decision:'approve',version:3},token));
 const changed=check(await call('/contributions','GET',null,user)).owned.find(x=>x.type===type).record;assert.equal(changed.title||changed.name,oldTitle+'修改');
 check(await call('/contributions','POST',{type,target_id:owned.record.id,payload:edit,status:'pending'},other),403);
 console.log('PASS review create/reject/resubmit/update/ownership:',type);
}
const own=check(await call('/contributions','GET',null,user)).owned.find(x=>x.type==='news');
const draft=check(await call('/contributions','POST',{type:'news',target_id:own.record.id,payload:{...own.record,title:'冲突版本'},status:'pending'},user),201);
await db.run('UPDATE news SET title=? WHERE id=?',['管理员的新版本',own.record.id]);check(await call('/reviews/'+draft.id+'/decision','POST',{decision:'approve',version:1},token),409);
check(await call('/contributions/'+draft.id,'DELETE',null,user));
check(await call('/accounts/content/team/'+check(await call('/contributions','GET',null,user)).owned.find(x=>x.type==='team').record.id,'PUT',{owner_id:b.id},token));
check(await call('/accounts/'+a.id,'PUT',{status:'disabled'},token));check(await call('/contributions','GET',null,user),401);
check(await call('/auth/password','PUT',{currentPassword:'MemberTest2026',newPassword:'ChangedTest2026'},other));check(await call('/contributions','GET',null,other),401);
const newToken=check(await call('/auth/login','POST',{username:b.username,password:'ChangedTest2026'})).token;check(await call('/auth/logout','POST',{},newToken));check(await call('/contributions','GET',null,newToken),401);
check(await call('/accounts/'+admin.user.id,'PUT',{status:'disabled'},token),403);
console.log('PASS pending accounts, tampered role, 7 content workflows, isolation, conflict, reassignment, disable, password and logout revocation');
console.log('Isolated test database:',dir);
}finally{await new Promise(r=>s.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
