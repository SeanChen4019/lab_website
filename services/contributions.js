const cleanRichContent=require('./rich-content');
const field=(key,label,type='text',extra={})=>({key,label,type,...extra});
const title=()=>field('title','标题','text',{required:true,max:200});
const summary=()=>field('summary','摘要','textarea',{max:500});
const content=()=>field('content','正文','rich',{max:50000});
const cover=(key='cover_image')=>field(key,'封面图片','image');
const date=(key='publish_date',label='发布日期')=>field(key,label,'date');
const abstract=()=>field('abstract','摘要','textarea',{max:5000});
const configs={
 team:{label:'教师 / 学生主页',table:'team_members',url:'/team/',fields:[
 field('name','姓名','text',{required:true,max:100}),field('title','职称 / 身份'),field('member_type','成员类型','select',{options:{teacher:'教师',student:'学生'}}),
 field('member_status','在读 / 毕业','select',{options:{current:'在读 / 在职',alumni:'已毕业'}}),field('student_level','培养层次','select',{options:{'':'不适用',undergraduate:'本科生',master:'硕士研究生',doctor:'博士研究生'}}),
 field('enrollment_year','入学年份','year'),field('graduation_year','毕业年份','year'),field('email','联系邮箱','email'),field('photo_url','个人照片','image'),
 field('research_area','研究方向','textarea',{max:300}),field('bio','个人简介','textarea',{max:2000}),field('resume','个人履历（每行一条）','textarea',{max:10000}),field('recent_updates','近期动态（日期｜标题｜链接，每行一条）','textarea',{max:5000}),field('destination','毕业去向','textarea',{max:500})]},
 papers:{label:'论文',table:'papers',url:'/paper/',fields:[title(),field('authors','作者','textarea',{max:500}),field('venue','期刊 / 会议'),field('year','发表年份','year'),field('level','论文级别'),field('pub_type','类型','select',{options:{journal:'期刊',conference:'会议'}}),field('direction','研究方向'),field('doi','DOI'),field('link','论文链接','url'),field('pdf_url','PDF 文件 / 链接','file'),field('code_url','代码链接','url'),cover(),abstract(),content()]},
 news:{label:'新闻',table:'news',url:'/news/',fields:[title(),field('category','栏目','select',{options:{research:'科研动态',team:'团队动态',teaching:'教学动态',exchange:'合作交流',education:'人才培养'}}),date(),summary(),cover('image_url'),content()]},
 projects:{label:'项目',table:'projects',url:'/project/',fields:[title(),field('funding_source','项目来源'),field('description','项目简介','textarea',{max:2000}),date('start_date','开始日期'),date('end_date','结束日期'),field('status','项目状态','select',{options:{'进行中':'进行中','已结题':'已结题'}}),cover(),content()]},
 patents:{label:'专利',table:'patents',url:'/patent/',fields:[title(),field('patent_no','专利号'),field('inventors','发明人','textarea',{max:500}),field('kind','专利类型'),field('status','授权状态'),date('grant_date','授权日期'),cover(),abstract(),content()]},
 downloads:{label:'数据集 / 教材 / 下载',table:'downloads',url:'/download/',fields:[title(),field('description','说明','textarea',{max:2000}),field('category','资源类型','select',{options:{dataset:'数据集',textbook:'教材'}}),field('file_url','文件 / 下载链接','file'),field('file_size','文件大小或版本说明')]}
};
function error(message,status=400){return Object.assign(new Error(message),{status});}
function safeUrl(value){
 if(!value)return '';
 if(/[\\\u0000-\u0020]/.test(value))throw error('链接中不能含有空格、控制字符或反斜杠');
 if(value.startsWith('/')&&!value.startsWith('//'))return value;
 try { const url=new URL(value); if(['https:','http:'].includes(url.protocol))return url.href; } catch(_) {}
 throw error('请使用站内路径或 http(s) 链接');
}
function validate(type,input,strict=true){
 const cfg=Object.hasOwn(configs,type)?configs[type]:null;if(!cfg)throw error('不支持的内容类型');
 if(!input || typeof input!=='object'||Array.isArray(input))throw error('内容格式不正确');
 const out={};
 for(const f of cfg.fields){
  let v=input[f.key]??'';if(typeof v!=='string'&&typeof v!=='number')throw error(f.label+'格式不正确');v=String(v).trim();
  if(v.length>(f.max||500))throw error(f.label+'内容过长');
  if(strict&&f.required&&!v)throw error('请填写'+f.label);
  if(f.type==='select'){ if(!v&&!Object.hasOwn(f.options,''))v=Object.keys(f.options)[0];if(!Object.hasOwn(f.options,v))throw error(f.label+'选项不正确'); }
  if(f.type==='year'){if(v && (!/^\d{4}$/.test(v)||Number(v)<1900||Number(v)>2100))throw error(f.label+'应为1900至2100');v=v?Number(v):null;}
  if(f.type==='date'){if(v){const d=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(d)||d.toISOString().slice(0,10)!==v)throw error(f.label+'无效');}else if(f.key==='publish_date')v=new Date().toISOString().slice(0,10);}
  if(['image','file','url'].includes(f.type))v=safeUrl(v);
  if(f.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw error('邮箱格式不正确');
  if(f.type==='rich')v=cleanRichContent(v);
  out[f.key]=v;
 }
 if(strict&&type==='papers'&&!out.year)throw error('请填写论文发表年份');
 if(out.enrollment_year&&out.graduation_year&&out.graduation_year<out.enrollment_year)throw error('毕业年份不能早于入学年份');
 return out;
}
function snapshot(type,row){if(!row)return null;const result={};for(const f of configs[type].fields)result[f.key]=row[f.key]??'';for(const k of ['owner_id','is_active','sort_order','is_top','role'])if(Object.hasOwn(row,k))result[k]=row[k];return JSON.stringify(result);}
module.exports={configs,validate,snapshot,error,safeUrl};
