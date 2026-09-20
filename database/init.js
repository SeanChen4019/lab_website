const initSQL = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'lab.db');

async function initDatabase() {
  // 安全检查：如果数据库已存在且未传 --force，拒绝覆盖
  if (fs.existsSync(DB_PATH)) {
    if (!process.argv.includes('--force')) {
      console.error('错误: 数据库文件已存在!');
      console.error('  路径: ' + DB_PATH);
      console.error('  如果要强制覆盖（会丢失所有数据），请使用: node database/init.js --force');
      process.exit(1);
    }
    console.warn('警告: 正在覆盖已存在的数据库文件...');
  }

  const SQL = await initSQL();
  const db = new SQL.Database();

  // 创建管理员表
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建轮播图表
  db.run(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      image_url TEXT NOT NULL,
      link_url TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建新闻/动态表
  db.run(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      image_url TEXT,
      is_top INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      publish_date DATE DEFAULT CURRENT_DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建通知公告表
  db.run(`
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      link_url TEXT,
      is_top INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      publish_date DATE DEFAULT CURRENT_DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建团队成员表
  db.run(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT,
      role TEXT NOT NULL,
      photo_url TEXT,
      email TEXT,
      research_area TEXT,
      bio TEXT,
      member_type TEXT DEFAULT 'teacher',
      member_status TEXT DEFAULT 'current',
      student_level TEXT DEFAULT '',
      enrollment_year INTEGER,
      graduation_year INTEGER,
      destination TEXT DEFAULT '',
      resume TEXT DEFAULT '',
      recent_updates TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建历届毕业生表
  db.run(`
    CREATE TABLE IF NOT EXISTS alumni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      degree_level TEXT NOT NULL,
      graduation_year INTEGER,
      major TEXT,
      destination_type TEXT DEFAULT 'employment',
      destination TEXT,
      position TEXT,
      photo_url TEXT,
      note TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建下载资源表
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      file_url TEXT NOT NULL,
      file_size TEXT,
      download_count INTEGER DEFAULT 0,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建研究方向表
  db.run(`
    CREATE TABLE IF NOT EXISTS research_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建项目表
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      funding_source TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT '进行中',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建网站设置表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 插入默认管理员（幂等：已存在则跳过）
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(
    `INSERT OR IGNORE INTO admins (username, password, name, role) VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, '系统管理员', 'superadmin']
  );

  // 插入默认设置
  const defaultSettings = [
    ['site_name', '电磁频谱认知智能通信实验室'],
    ['site_subtitle', '南京航空航天大学电子信息工程学院'],
    ['site_keywords', '频谱认知,天地一体化,南京航空航天大学,电磁频谱'],
    ['site_description', '电磁频谱认知智能通信实验室官方网站'],
    ['contact_email', ''],
    ['contact_phone', ''],
    ['contact_address', '南京市江宁区将军大道29号 南京航空航天大学'],
    ['icp_number', '苏ICP备05003162号'],
    ['footer_text', '版权所有 © 南京航空航天大学']
  ];

  for (const [key, value] of defaultSettings) {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  }

  // 插入示例轮播图
  const banners = [
    ['实验室风采', '/images/banners/banner1.jpg', ''],
    ['学术交流', '/images/banners/banner2.jpg', ''],
    ['科研成果', '/images/banners/banner3.jpg', '']
  ];

  for (const [title, image_url, link_url] of banners) {
    db.run(
      `INSERT INTO banners (title, image_url, link_url) VALUES (?, ?, ?)`,
      [title, image_url, link_url]
    );
  }

  // 插入示例通知
  const notices = [
    ['关于申报2026年度国家自然科学基金项目的通知', '请各位老师积极申报国家自然科学基金项目，截止日期为2026年3月20日。', '', 1],
    ['实验室年度学术研讨会报名通知', '定于2026年4月举办实验室年度学术研讨会，欢迎各位师生踊跃报名。', '', 0],
    ['关于开展实验室安全检查的通知', '为确保实验室安全运行，将于下周进行安全检查，请各课题组做好准备。', '', 0],
    ['研究生招生信息', '欢迎报考电磁频谱认知智能通信实验室硕士/博士研究生', '', 0],
    ['实验室开放日活动通知', '实验室将于每月第一个周五举办开放日活动，欢迎参观交流。', '', 0]
  ];

  for (const [title, content, link_url, is_top] of notices) {
    db.run(
      `INSERT INTO notices (title, content, link_url, is_top) VALUES (?, ?, ?, ?)`,
      [title, content, link_url, is_top]
    );
  }

  // 插入示例新闻
  const newsItems = [
    ['team', '实验室团队在IEEE ICC 2026获最佳论文奖', '实验室研究团队的论文在IEEE国际通信大会上荣获最佳论文奖。', '详细内容...', '', 1],
    ['team', '张教授入选国家级人才计划', '实验室张教授成功入选国家级人才计划，为实验室发展注入新动力。', '详细内容...', '', 0],
    ['research', '频谱感知技术取得重大突破', '实验室在频谱感知技术方面取得重大突破，相关成果发表在顶级期刊上。', '详细内容...', '', 1],
    ['research', '天地一体化通信系统研究进展', '实验室在天地一体化通信系统方面的研究取得重要进展。', '详细内容...', '', 0],
    ['teaching', '实验室教学成果获省级一等奖', '实验室申报的教学成果获得省级教学成果一等奖。', '详细内容...', '', 1],
    ['teaching', '研究生培养质量不断提升', '实验室研究生培养质量持续提升，多名研究生获得国家奖学金。', '详细内容...', '', 0],
    ['exchange', '实验室承办全国频谱认知学术会议', '实验室成功承办第十二届全国频谱认知学术会议。', '详细内容...', '', 1],
    ['exchange', '国际学术交流活动丰富多彩', '实验室积极开展国际学术交流，与多所国际知名高校建立合作关系。', '详细内容...', '', 0],
    ['education', '实验室教材入选国家级规划教材', '实验室编写的教材成功入选国家级规划教材。', '详细内容...', '', 1],
    ['education', '研究生创新能力培养成效显著', '实验室注重研究生创新能力培养，学生在各类竞赛中屡获佳绩。', '详细内容...', '', 0]
  ];

  for (const [category, title, summary, content, image_url, is_top] of newsItems) {
    db.run(
      `INSERT INTO news (category, title, summary, content, image_url, is_top) VALUES (?, ?, ?, ?, ?, ?)`,
      [category, title, summary, content, image_url, is_top]
    );
  }

  // 插入示例团队成员
  const members = [
    ['张三', '教授/博士生导师', 'leader', '', 'zhangsan@nuaa.edu.cn', '频谱认知与智能通信', '实验室主任，长期从事频谱认知技术研究...'],
    ['李四', '教授/博士生导师', 'member', '', 'lisi@nuaa.edu.cn', '天地一体化通信', '主要研究方向为天地一体化通信系统...'],
    ['王五', '副教授/硕士生导师', 'member', '', 'wangwu@nuaa.edu.cn', '信号处理', '专注于通信信号处理技术研究...'],
    ['赵六', '讲师', 'member', '', 'zhaoliu@nuaa.edu.cn', '机器学习与通信', '研究兴趣为机器学习在通信系统中的应用...']
  ];

  for (const [name, title, role, photo_url, email, research_area, bio] of members) {
    db.run(
      `INSERT INTO team_members (name, title, role, photo_url, email, research_area, bio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, title, role, photo_url, email, research_area, bio]
    );
  }

  // 插入示例研究方向
  const areas = [
    ['频谱认知与感知', '研究频谱感知、频谱检测、频谱分析等关键技术', 'wifi'],
    ['天地一体化通信', '研究天地一体化网络架构、协议和关键技术', 'satellite'],
    ['智能信号处理', '研究基于人工智能的信号处理技术', 'cpu'],
    ['电磁频谱管控', '研究电磁频谱管理和控制技术', 'shield']
  ];

  for (const [title, description, icon] of areas) {
    db.run(
      `INSERT INTO research_areas (title, description, icon) VALUES (?, ?, ?)`,
      [title, description, icon]
    );
  }

  // 插入示例项目
  const projects = [
    ['国家自然科学基金重点项目：天地一体化频谱认知关键技术研究', '研究天地一体化网络中的频谱认知关键技术', '国家自然科学基金委员会', '2024-01-01', '2028-12-31', '进行中'],
    ['国家重点研发计划：智能频谱管控系统', '开发智能化频谱管控系统', '科技部', '2023-06-01', '2026-05-31', '进行中'],
    ['横向合作项目：5G频谱共享技术', '与企业合作开展5G频谱共享技术研究', '华为技术有限公司', '2025-01-01', '2026-12-31', '进行中']
  ];

  for (const [title, description, funding_source, start_date, end_date, status] of projects) {
    db.run(
      `INSERT INTO projects (title, description, funding_source, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, funding_source, start_date, end_date, status]
    );
  }

  // 插入示例下载
  const downloads = [
    ['实验室设备使用申请表', '实验室设备使用申请表模板', '/uploads/device_apply.doc', '25KB', 'forms'],
    ['研究生开题报告模板', '研究生开题报告标准模板', '/uploads/proposal_template.doc', '50KB', 'templates'],
    ['实验室安全手册', '实验室安全规章制度手册', '/uploads/safety_manual.pdf', '2MB', 'documents']
  ];

  for (const [title, description, file_url, file_size, category] of downloads) {
    db.run(
      `INSERT INTO downloads (title, description, file_url, file_size, category) VALUES (?, ?, ?, ?, ?)`,
      [title, description, file_url, file_size, category]
    );
  }

  // 保存数据库
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);

  console.log('数据库初始化完成！');
  console.log('默认管理员账号: admin / admin123');
  console.log('数据库文件:', DB_PATH);

  db.close();
}

initDatabase().catch(console.error);
