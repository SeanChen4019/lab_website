const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const db=require('../database/db');
const secret=process.env.JWT_SECRET || 'nuaa-lab-jwt-secret-2026';
async function issue(user) {
  const jti=crypto.randomUUID();
  const expires=Math.floor(Date.now()/1000)+86400;
  await db.run('DELETE FROM auth_sessions WHERE expires_at < ?', [Math.floor(Date.now()/1000)]);
  await db.run('INSERT INTO auth_sessions(jti,admin_id,expires_at) VALUES (?,?,?)',[jti,user.id,expires]);
  return jwt.sign({id:user.id,version:user.token_version,jti},secret,{expiresIn:'24h'});
}
async function verify(token) {
  const payload=jwt.verify(token,secret,{algorithms:['HS256']});
  const user=await db.get('SELECT id,username,name,email,role,status,token_version FROM admins WHERE id=?',[payload.id]);
  if(!user || user.status!=='active' || user.token_version!==payload.version || !payload.jti) throw Error('登录已失效');
  if(!await db.get('SELECT jti FROM auth_sessions WHERE jti=? AND admin_id=? AND expires_at>?',[payload.jti,user.id,Math.floor(Date.now()/1000)])) throw Error('登录已失效');
  return {...user,jti:payload.jti};
}
function bearer(req) { const m=/^Bearer (\S+)$/i.exec(req.headers.authorization || ''); return m ? m[1] : null; }
async function apiAuth(req,res,next) {
  try { req.user=await verify(bearer(req)); next(); }
  catch(_) { res.status(401).json({success:false,message:'登录已过期或账号不可用，请重新登录'}); }
}
function superOnly(req,res,next) { if(req.user.role!=='superadmin') return res.status(403).json({success:false,message:'仅超级管理员可以执行此操作'}); next(); }
module.exports={issue,verify,bearer,apiAuth,superOnly};
