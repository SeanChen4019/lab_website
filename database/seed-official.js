const db = require('./db');

const news = [
  ['teaching','我室老师获中国电子学会2026电子信息教学成果二等奖','实验室教师团队在电子信息人才培养与教学改革方面取得新成果。','2026-07-24','/images/official/news-teaching-award.png','https://cog.nuaa.edu.cn/2026/0723/c757a406147/page.htm'],
  ['team','支部共建庆七一，频谱同心促科创','我室研究生党支部与南京邮电大学通信与信息工程学院博士研究生第2党支部开展共建活动。','2026-07-02','/images/official/news-party-building.jpg','https://cog.nuaa.edu.cn/2026/0702/c757a403966/page.htm'],
  ['exchange','中国工程院院士苏东林调研电磁频谱研究院','中国工程院院士苏东林到访调研，围绕电磁频谱领域科研创新与人才培养进行交流。','2026-06-14','/images/official/news-academician-visit.png','https://cog.nuaa.edu.cn/2026/0614/c757a401662/page.htm'],
  ['education','我室老师教材入选“2026年高被引图书TOP 1%”榜单','实验室教师编著教材入选中国知网发布的2026年高被引图书榜单。','2026-06-03','/images/official/news-teaching-award.png','https://cog.nuaa.edu.cn/'],
  ['research','祝贺我室成果入选第二届空天信息技术大会“创新成果墙报激励计划”','实验室空天信息技术研究成果获得大会认可。','2026-05-26','/images/official/news-poster-award.png','https://cog.nuaa.edu.cn/2026/0526/c757a400104/page.htm'],
  ['research','祝贺我室成果荣获2026年IEEE ICC国际通信顶级会议最佳论文奖','实验室研究成果荣获IEEE ICC 2026最佳论文奖。','2026-05-26','/images/official/news-icc-award.png','https://cog.nuaa.edu.cn/2026/0526/c757a400080/page.htm'],
  ['exchange','中国卫通董事长孙京调研电磁频谱研究院','中国卫通董事长孙京一行到访调研，双方围绕卫星通信与频谱技术展开交流。','2026-05-15','/images/official/news-satellite-visit.png','https://cog.nuaa.edu.cn/2026/0515/c757a399253/page.htm'],
  ['exchange','中国科学院院士尤肖虎调研电磁频谱研究院','中国科学院院士尤肖虎到访电磁频谱研究院并开展学术交流。','2026-04-29','/images/official/news-academician-visit.png','https://cog.nuaa.edu.cn/'],
  ['research','我室深度参与基金委“低空智能飞行与安全管控”专题研讨会','实验室围绕低空智能飞行、通信保障与安全管控参与专题研讨。','2026-04-23','/images/official/news-poster-award.png','https://cog.nuaa.edu.cn/']
];

const members = [
  ['吴启晖','教授/博士生导师','leader','','wuqihui@nuaa.edu.cn','认知无线电、天地一体化网络、频谱智能管控','实验室主任，教育部长江学者特聘教授，IET Fellow，国家有突出贡献中青年专家。'],
  ['张小飞','教授/博士生导师','leader','/images/official/zhang-xiaofei.jpg','zhangxiaofei@nuaa.edu.cn','阵列信号处理、通信感知一体化','实验室副主任，国家网信优秀人才，爱思唯尔中国高被引学者。'],
  ['董超','教授/博士生导师','leader','/images/official/dong-chao.jpg','dch@nuaa.edu.cn','智能通信、编码与信息处理','实验室副主任，国家级青年人才。'],
  ['田畅','教授/博士生导师','member','/images/official/tian-chang.png','tianchang@nuaa.edu.cn','信息论、编码与智能通信','实验室骨干教师。'],
  ['张磊','教授/硕士生导师','member','','zhang_lei@nuaa.edu.cn','无线通信与智能信号处理','实验室骨干教师。'],
  ['周福辉','教授/博士生导师','member','/images/official/zhou-fuhui.jpg','zhoufuhui@ieee.org','频谱共享、无线资源管理','国家优秀青年科学基金获得者。'],
  ['施永荣','教授/博士生导师','member','','yongrongshi@hotmail.com','无线网络与频谱认知','国家级青年人才。'],
  ['周博','教授/博士生导师','member','','b.zhou@nuaa.edu.cn','智能通信与网络优化','国家级青年人才。'],
  ['叶方伟','教授/博士生导师','member','','fangweiye@nuaa.edu.cn','通信网络与智能决策','国家级青年人才。'],
  ['徐东方','研究员/博士生导师','member','','xudongfang@nuaa.edu.cn','电磁频谱感知与管控','国家级青年人才。'],
  ['罗高骏','副研究员/硕士生导师','member','','gaojun_luo@nuaa.edu.cn','无线信号处理','国家级青年人才。'],
  ['朱秋明','教授/博士生导师','member','/images/official/zhu-qiuming.jpg','zhuqiuming@nuaa.edu.cn','无线信道建模、空天地通信','IET Fellow，青蓝工程中青年学术带头人。'],
  ['朱友文','教授/博士生导师','member','','zhuyw@nuaa.edu.cn','通信与信息系统','青蓝工程中青年学术带头人。'],
  ['李建峰','教授/博士生导师','member','','lijianfeng@nuaa.edu.cn','无线通信与信号处理','实验室骨干教师。'],
  ['晋本周','教授/博士生导师','member','','jinbz@nuaa.edu.cn','天地一体化通信','实验室骨干教师。'],
  ['卢晓珍','研究员/硕士生导师','member','','luxiaozhen@nuaa.edu.cn','频谱数据分析','实验室骨干教师。'],
  ['屈毓锛','副教授/硕士生导师','member','','quyuben@nuaa.edu.cn','低空信息通信、智能网络','实验室骨干教师。'],
  ['黄洋','副教授/硕士生导师','member','','yang.huang.ceie@nuaa.edu.cn','智能无线通信','实验室骨干教师。'],
  ['仲伟志','副教授/硕士生导师','member','','zhongwz@nuaa.edu.cn','通信信号处理','实验室骨干教师。'],
  ['孙萌','副研究员/硕士生导师','member','','mengsun@nuaa.edu.cn','频谱认知与智能决策','实验室骨干教师。']
];

const areas = [
  ['认知与决策信息理论','以认知为核心，研究复杂电磁环境下的信息获取、学习、推理与智能决策理论。','cognition'],
  ['天地一体化网络','面向卫星、临近空间飞行器、航空平台和地面网络，研究多层异构网络协同。','network'],
  ['电磁频谱空间','研究频谱感知、频谱共享、动态授权、资源优化与电磁频谱安全。','spectrum'],
  ['低空智能通信与管控','面向无人机组网和低空安全需求，研究通信感知融合与智能管控技术。','low-altitude']
];

async function seed() {
  // 安全检查：必须传 --yes 确认才能执行破坏性操作
  if (!process.argv.includes('--yes')) {
    console.error('错误: 此脚本将清空并重新填充以下数据表:');
    console.error('  news, notices, team_members, research_areas, projects, banners, downloads');
    console.error('  如需继续，请使用: node database/seed-official.js --yes');
    process.exit(1);
  }

  for (const table of ['news','notices','team_members','research_areas','projects','banners','downloads']) {
    await db.run(`DELETE FROM ${table}`);
  }

  for (const [category,title,summary,date,image,source] of news) {
    const content = `${summary}\n\n本文根据天地一体频谱认知实验室原官方网站公开信息整理。原文链接：${source}`;
    await db.run(
      'INSERT INTO news (category,title,summary,content,image_url,is_top,is_active,publish_date) VALUES (?,?,?,?,?,0,1,?)',
      [category,title,summary,content,image,date]
    );
  }

  const notices = [
    ['2026第五届电磁频谱学术大会征文延期通知','大会征文安排与提交要求请以实验室原官方网站和会议通知为准。','2026-04-01'],
    ['实验室研究生招生与开放交流','欢迎通信工程、电子信息、信号处理等相关专业学生关注实验室招生信息。','2026-03-15'],
    ['实验室仪器设备使用与安全提醒','进入实验区域请遵守南京航空航天大学及实验室安全管理规定。','2026-03-01']
  ];
  for (const [title,content,date] of notices) {
    await db.run('INSERT INTO notices (title,content,is_top,is_active,publish_date) VALUES (?,?,0,1,?)',[title,content,date]);
  }

  let order = 1;
  for (const member of members) {
    await db.run(
      'INSERT INTO team_members (name,title,role,photo_url,email,research_area,bio,sort_order,is_active) VALUES (?,?,?,?,?,?,?,?,1)',
      [...member,order++]
    );
  }
  order = 1;
  for (const [title,description,icon] of areas) {
    await db.run('INSERT INTO research_areas (title,description,icon,sort_order,is_active) VALUES (?,?,?,?,1)',[title,description,icon,order++]);
  }

  const projects = [
    ['国家重点研发计划相关项目','围绕天地一体化网络、电磁频谱认知与低空智能通信开展关键技术研究。','科技部','2022-01-01','2026-12-31','进行中'],
    ['国家自然科学基金重点类项目','面向复杂电磁环境下的频谱感知、认知决策和资源优化开展基础研究。','国家自然科学基金委员会','2023-01-01','2027-12-31','进行中'],
    ['重大科研仪器研制相关项目','开展电磁频谱感知、分析、测试与验证平台研究。','国家自然科学基金委员会','2021-01-01','2026-12-31','进行中']
  ];
  for (const p of projects) {
    await db.run('INSERT INTO projects (title,description,funding_source,start_date,end_date,status,is_active) VALUES (?,?,?,?,?,?,1)',p);
  }

  await db.run('INSERT INTO banners (title,image_url,link_url,sort_order,is_active) VALUES (?,?,?,?,1)',
    ['南航明故宫校区梧桐道','/images/official/nuaa-wutong-road-hd.jpg','/about',1]);
  await db.run('INSERT INTO banners (title,image_url,link_url,sort_order,is_active) VALUES (?,?,?,?,1)',
    ['实验室科研与人才培养','/images/official/news-academician-visit.png','/research',2]);

  const settings = {
    site_name:'电磁频谱认知智能通信实验室',
    site_subtitle:'南京航空航天大学电子信息工程学院',
    site_description:'南京航空航天大学电磁频谱认知智能通信实验室官方网站',
    site_keywords:'天地一体化网络,频谱认知,电磁频谱,低空智能通信,南京航空航天大学',
    contact_address:'江苏省南京市江宁区将军大道29号 南京航空航天大学',
    icp_number:'苏ICP备05070685号',
    footer_text:'版权所有 © 南京航空航天大学'
  };
  for (const [key,value] of Object.entries(settings)) {
    await db.run('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)',[key,value]);
  }
  console.log('Official content seeded.');
}

seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
