const express=require('express'),bcrypt=require('bcryptjs');
const db=require('../database/db'),auth=require('../services/auth');
const {configs,validate,snapshot,error}=require('../services/contributions');
const router=express.Router();
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.status)console.error('Collaboration:',e.message);res.status(e.status||500).json({success:false,message:e.status?e.message:'操作失败，请稍后重试'});}};
const ok=(res,data={})=>res.json({success:true,...data});
const id=v=>{if(!/^\d+$/.test(String(v))||Number(v)<1||!Number.isSafeInteger(Number(v)))throw error('记录编号不正确');return Number(v);};
const password=v=>{if(typeof v!=='string'||v.length<10||Buffer.byteLength(v)>72||!/[a-zA-Z]/.test(v)||!/[0-9]/.test(v))throw error('密码至少10位，包含字母和数字，且不超过72字节');return v;};
const signupAttempts=new Map();
router.post('/auth/register',wrap(async(req,res)=>{
 const ip=req.ip,now=Date.now();for(const [k,v]of signupAttempts)if(v.until<now)signupAttempts.delete(k);
 const attempts=signupAttempts.get(ip)||{count:0,until:now+3600000};if(attempts.count>=100)throw error('申请过于频繁，请一小时后再试',429);attempts.count++;signupAttempts.set(ip,attempts);
 const {username,name,email,application_note=''}=req.body;
 if(typeof username!=='string'||!/^[a-zA-Z0-9_]{4,40}$/.test(username))throw error('用户名为4至40位字母、数字或下划线');
 if(typeof name!=='string'||!name.trim()||name.length>100)throw error('请填写真实姓名（不超过100字）');
 if(typeof email!=='string'||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw error('请填写有效邮箱');
 if(typeof application_note!=='string'||application_note.length>1000)throw error('申请说明最多1000字');
 const hash=await bcrypt.hash(password(req.body.password),12);
 await db.transaction(tx=>{if(tx.get('SELECT id FROM admins WHERE username=? COLLATE NOCASE',[username]))throw error('用户名已存在',409);tx.run("INSERT INTO admins(username,password,name,email,application_note,role,status) VALUES (?,?,?,?,?,'editor','pending')",[username,hash,name.trim(),email.trim(),application_note.trim()]);});
 res.status(201).json({success:true,message:'申请已提交，请等待系统管理员审核开通。审核前不能登录。'});
}));
router.use(['/contributions','/accounts','/reviews'],auth.apiAuth);
router.use(['/accounts','/reviews'],auth.superOnly);
router.get('/contributions/schema',wrap(async(req,res)=>ok(res,{types:Object.fromEntries(Object.entries(configs).map(([k,c])=>[k,{label:c.label,fields:c.fields}]))})));
router.get('/contributions',wrap(async(req,res)=>{
 const submissions=await db.all('SELECT * FROM submissions WHERE owner_id=? ORDER BY updated_at DESC,id DESC',[req.user.id]);
 const owned=[];for(const [type,c]of Object.entries(configs)){for(const row of await db.all(`SELECT * FROM ${c.table} WHERE owner_id=? ORDER BY id DESC`,[req.user.id]))owned.push({type,record:row,url:c.url+row.id});}
 ok(res,{submissions:submissions.filter(s=>Object.hasOwn(configs,s.type)).map(s=>({...s,payload:JSON.parse(s.payload)})),owned});
}));
router.post('/contributions',wrap(async(req,res)=>{
 const {type,target_id,status='draft'}=req.body;if(!['draft','pending'].includes(status))throw error('状态不正确');const payload=validate(type,req.body.payload,status==='pending');const target=target_id==null?null:id(target_id);
 const result=await db.transaction(tx=>{
  let base=null;if(target){const row=tx.get(`SELECT * FROM ${configs[type].table} WHERE id=?`,[target]);if(!row||row.owner_id!==req.user.id)throw error('不能修改他人的内容',403);base=snapshot(type,row);}
  if(target&&tx.get("SELECT id FROM submissions WHERE type=? AND target_id=? AND owner_id=? AND status IN ('pending','draft','rejected')",[type,target,req.user.id]))throw error('此内容已有草稿或待审核版本，请在原记录上修改',409);
  return tx.run('INSERT INTO submissions(owner_id,type,target_id,payload,base_snapshot,status) VALUES (?,?,?,?,?,?)',[req.user.id,type,target,JSON.stringify(payload),base,status]);
 });res.status(201).json({success:true,id:result.lastID,message:status==='pending'?'已提交审核，审核通过后公开':'草稿已保存'});
}));
router.put('/contributions/:id',wrap(async(req,res)=>{
 await db.transaction(tx=>{
  const s=tx.get('SELECT * FROM submissions WHERE id=?',[id(req.params.id)]);if(!s||s.owner_id!==req.user.id)throw error('记录不存在',404);
  if(s.version!==req.body.version)throw error('内容已更新，请刷新后重试',409);
  if(s.status==='approved')throw error('已审核记录不可直接修改，请从已发布内容创建修改申请',409);
  const status=req.body.status||'draft';if(!['draft','pending'].includes(status))throw error('状态不正确');
  const payload=validate(s.type,req.body.payload,status==='pending');let base=s.base_snapshot;
  if(s.target_id){const row=tx.get(`SELECT * FROM ${configs[s.type].table} WHERE id=?`,[s.target_id]);if(!row||row.owner_id!==req.user.id)throw error('资料归属已改变，请联系管理员',403);
   if(snapshot(s.type,row)!==base)throw error('线上资料已被管理员修改，请删除旧申请并从最新资料重新编辑',409);}
  tx.run("UPDATE submissions SET payload=?,status=?,version=version+1,review_note='',reviewer_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",[JSON.stringify(payload),status,s.id]);
 });ok(res,{message:'已保存'});
}));
router.delete('/contributions/:id',wrap(async(req,res)=>{
 await db.transaction(tx=>{const s=tx.get('SELECT * FROM submissions WHERE id=?',[id(req.params.id)]);if(!s||s.owner_id!==req.user.id)throw error('记录不存在',404);if(s.status==='approved')throw error('已发布内容请联系系统管理员删除',409);tx.run('DELETE FROM submissions WHERE id=?',[s.id]);});ok(res);
}));
router.get('/accounts',wrap(async(req,res)=>ok(res,{users:await db.all('SELECT id,username,name,email,role,status,application_note,created_at FROM admins ORDER BY id DESC')})));
router.put('/accounts/:id',wrap(async(req,res)=>{
 const target=id(req.params.id),status=req.body.status;if(!['active','disabled','pending'].includes(status))throw error('账号状态不正确');
 await db.transaction(tx=>{const user=tx.get('SELECT * FROM admins WHERE id=?',[target]);if(!user)throw error('账号不存在',404);if(user.role==='superadmin')throw error('此入口不能停用或修改系统管理员',403);tx.run('UPDATE admins SET status=?,token_version=token_version+1 WHERE id=?',[status,target]);tx.run('DELETE FROM auth_sessions WHERE admin_id=?',[target]);});ok(res);
}));
router.post('/accounts/:id/reset-password',wrap(async(req,res)=>{
 const hash=await bcrypt.hash(password(req.body.password),12);await db.transaction(tx=>{const user=tx.get('SELECT id,role FROM admins WHERE id=?',[id(req.params.id)]);if(!user)throw error('账号不存在',404);if(user.role==='superadmin')throw error('请在账号安全中修改系统管理员密码',403);tx.run('UPDATE admins SET password=?,token_version=token_version+1 WHERE id=?',[hash,user.id]);tx.run('DELETE FROM auth_sessions WHERE admin_id=?',[user.id]);});ok(res,{message:'密码已重置，旧登录已失效'});
}));

// 删除普通管理员账号：资料收回、草稿清空、会话失效，然后删账号
router.delete('/accounts/:id',wrap(async(req,res)=>{
 const target=id(req.params.id);
 const owned=['team_members','news','papers','projects','patents','downloads'];
 await db.transaction(tx=>{
   const user=tx.get('SELECT * FROM admins WHERE id=?',[target]);
   if(!user)throw error('账号不存在',404);
   if(user.role==='superadmin')throw error('不能删除系统管理员账号',403);
   // 名下的已发布资料收回归系统管理员（owner_id 置空即「仅系统管理员维护」）
   for(const table of owned)tx.run(`UPDATE ${table} SET owner_id=NULL WHERE owner_id=?`,[target]);
   // 未审草稿、待审提交、登录会话一并清掉，避免留下悬空记录
   tx.run('DELETE FROM submissions WHERE owner_id=?',[target]);
   tx.run('DELETE FROM auth_sessions WHERE admin_id=?',[target]);
   tx.run('DELETE FROM admins WHERE id=?',[target]);
 });
 ok(res,{message:'账号已删除，原资料已收归系统管理员管理'});
}));
router.get('/accounts/content/:type',wrap(async(req,res)=>{
 const cfg=Object.hasOwn(configs,req.params.type)?configs[req.params.type]:null;if(!cfg)throw error('内容类型不正确');ok(res,{records:await db.all(`SELECT id,${req.params.type==='team'?'name':'title'} AS title,owner_id FROM ${cfg.table} ORDER BY id DESC`)});
}));
router.put('/accounts/content/:type/:id',wrap(async(req,res)=>{
 const cfg=Object.hasOwn(configs,req.params.type)?configs[req.params.type]:null;if(!cfg)throw error('内容类型不正确');const owner=req.body.owner_id==null?null:id(req.body.owner_id);
 await db.transaction(tx=>{if(owner){const user=tx.get("SELECT id FROM admins WHERE id=? AND status='active'",[owner]);if(!user)throw error('请选择已开通的账号');}
 const row=tx.get(`SELECT id,owner_id FROM ${cfg.table} WHERE id=?`,[id(req.params.id)]);if(!row)throw error('内容不存在',404);if(row.owner_id===owner)return;
 tx.run(`UPDATE ${cfg.table} SET owner_id=? WHERE id=?`,[owner,row.id]);
 tx.run("UPDATE submissions SET status='rejected',review_note='资料归属已改变，请联系系统管理员',version=version+1 WHERE type=? AND target_id=? AND status='pending'",[req.params.type,row.id]);});ok(res);
}));
router.get('/reviews',wrap(async(req,res)=>{
 const list=await db.all("SELECT s.*,a.name AS owner_name,a.username,a.status AS account_status FROM submissions s JOIN admins a ON a.id=s.owner_id WHERE s.status!='draft' ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.id DESC");
 ok(res,{submissions:list.filter(s=>Object.hasOwn(configs,s.type)).map(s=>({...s,payload:JSON.parse(s.payload),base_snapshot:s.base_snapshot?JSON.parse(s.base_snapshot):null}))});
}));
router.post('/reviews/:id/decision',wrap(async(req,res)=>{
 const {decision,note='',version}=req.body;if(!['approve','reject'].includes(decision))throw error('审核操作不正确');if(typeof note!=='string'||note.length>1000)throw error('审核意见最多1000字');if(decision==='reject'&&!note.trim())throw error('请填写退回原因');
 const result=await db.transaction(tx=>{
  const s=tx.get('SELECT * FROM submissions WHERE id=?',[id(req.params.id)]);if(!s)throw error('申请不存在',404);if(!Object.hasOwn(configs,s.type))throw error('此栏目已停用，历史申请不能再发布',410);if(s.status!=='pending'||s.version!==version)throw error('申请已变更，请刷新后审核',409);
  if(decision==='reject'){tx.run("UPDATE submissions SET status='rejected',review_note=?,reviewer_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[note,req.user.id,s.id]);return {};}
  if(!tx.get("SELECT id FROM admins WHERE id=? AND status='active'",[s.owner_id]))throw error('该账号尚未开通或已停用',409);
  const cfg=configs[s.type],payload=validate(s.type,JSON.parse(s.payload));let target=s.target_id;
  if(target){const row=tx.get(`SELECT * FROM ${cfg.table} WHERE id=?`,[target]);if(!row||row.owner_id!==s.owner_id||snapshot(s.type,row)!==s.base_snapshot)throw error('原资料已修改、删除或变更归属，请退回重新填写',409);
    const keys=Object.keys(payload);tx.run(`UPDATE ${cfg.table} SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`,[...Object.values(payload),target]);
  } else {
    const value={...payload,owner_id:s.owner_id,is_active:1};if(s.type==='team')value.role='member';
    const keys=Object.keys(value);target=tx.run(`INSERT INTO ${cfg.table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(value)).lastID;
  }
  tx.run("UPDATE submissions SET status='approved',target_id=?,review_note=?,reviewer_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[target,note,req.user.id,s.id]);return {url:cfg.url+target};
 });ok(res,{message:decision==='approve'?'审核通过，前台已更新':'已退回修改',...result});
}));
module.exports=router;
