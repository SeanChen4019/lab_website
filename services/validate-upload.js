const fs=require('node:fs/promises');
// Check actual bytes, not only the filename and a browser-supplied MIME value.
module.exports=async function(file){
 const ext=require('node:path').extname(file.originalname).toLowerCase();
 const handle=await fs.open(file.path,'r');let bytes;
 try{bytes=Buffer.alloc(16);const r=await handle.read(bytes,0,16,0);bytes=bytes.subarray(0,r.bytesRead);}finally{await handle.close();}
 const hex=bytes.toString('hex'),text=bytes.toString('ascii');
 let valid=true;
 if(['.jpg','.jpeg'].includes(ext))valid=hex.startsWith('ffd8ff');
 else if(ext==='.png')valid=hex.startsWith('89504e470d0a1a0a');
 else if(ext==='.gif')valid=/^GIF8[79]a/.test(text);
 else if(ext==='.pdf')valid=text.startsWith('%PDF-');
 else if(['.zip','.docx','.xlsx','.pptx'].includes(ext))valid=hex.startsWith('504b0304')||hex.startsWith('504b0506')||hex.startsWith('504b0708');
 else if(['.doc','.xls','.ppt'].includes(ext))valid=hex.startsWith('d0cf11e0a1b11ae1');
 else if(ext==='.rar')valid=hex.startsWith('526172211a07');
 if(!valid)throw Object.assign(new Error('文件内容与扩展名不一致，请上传原始文件'),{status:400});
};
