const {AsyncLocalStorage}=require('node:async_hooks');
const crypto=require('node:crypto');
const context=new AsyncLocalStorage();
function revision(row){if(!row)return null;const value={};for(const key of Object.keys(row).sort())if(key!=='_revision')value[key]=row[key];return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function guard(tx,sql){const item=context.getStore();if(!item || item.checked || !new RegExp('^(?:UPDATE|DELETE FROM)\\s+'+item.table+'\\b','i').test(sql.trim()))return;
 const row=tx.get('SELECT * FROM '+item.table+' WHERE id=?',[item.id]);
 if(!row || revision(row)!==item.expected)throw Object.assign(new Error('这条资料已被其他操作修改，请刷新列表后重新编辑；本次未覆盖新版本'),{status:409});
 item.checked=true;
}
module.exports={revision,guard,run:(value,fn)=>context.run(value,fn)};
