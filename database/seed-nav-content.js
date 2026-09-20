const db = require('./db');

// 为新导航结构填充演示内容：平台、专利、论文、社媒动态、学生、数据集与教材。
// 重复运行会先清空对应表再插入（教师与已有新闻不受影响）。

const platforms = [
  ['national', '电磁频谱空间认知与管控技术创新平台', '面向国家电磁频谱空间安全重大需求，建设覆盖“感知—认知—决策—管控”全链路的创新平台，支撑频谱智能感知、频谱态势研判与动态管控关键技术攻关与验证。',
    '/images/site/platform-spectrum-lab.png', 1],
  ['national', '天地一体化通信综合测试验证平台', '依托卫星地面站与信道模拟设施，构建覆盖卫星、临近空间、航空与地面网络的一体化通信测试环境，支撑低轨星座接入、星地链路与频谱共享技术验证。',
    '/images/site/platform-ground-station.png', 2],
  ['provincial', '低空智能通信与管控重点实验室（共建）', '联合地方政府与行业单位共建，面向无人机物流、城市空中交通等低空经济场景，开展低空组网、通信感知融合与安全管控研究与试验。',
    '/images/site/platform-uav-test.png', 1],
  ['provincial', '空天信息联合研究中心', '与科研院所、龙头企业共建产学研合作平台，围绕空天信息技术转化、联合课题研究与高层次人才培养开展深度合作。',
    '/images/site/platform-joint-center.png', 2]
];

const patents = [
  ['一种基于深度强化学习的低轨卫星频谱感知方法', 'ZL202410123456.7', '吴启晖; 周福辉; 王晓东', '发明专利', '已授权', '2025-11-20'],
  ['一种空天地一体化网络频谱动态分配装置', 'ZL202310987654.3', '张小飞; 李建峰; 刘思远', '发明专利', '已授权', '2025-06-10'],
  ['一种无人机集群通信抗干扰资源调度方法', 'ZL202410234567.8', '董超; 屈毓锛; 陈嘉豪', '发明专利', '已授权', '2025-03-18'],
  ['一种面向复杂电磁环境的频谱态势预测系统', 'ZL202310456789.1', '徐东方; 卢晓珍; 赵文静', '发明专利', '已授权', '2024-09-05'],
  ['一种阵列信号波达方向估计方法及装置', 'ZL202310345678.5', '张小飞; 仲伟志; 孙浩然', '发明专利', '已授权', '2024-05-22'],
  ['一种星地频谱共享智能判决方法', 'ZL202510019876.2', '周博; 叶方伟; 李雨桐', '发明专利', '实质审查', '2025-12-01']
];

const papers = [
  ['Deep Reinforcement Learning Based Spectrum Sensing for LEO Satellite Communication Systems', 'Qihui Wu, Fuhui Zhou, Xiaodong Wang, et al.', 'IEEE Transactions on Wireless Communications', 2025, 'SCI一区', 'journal'],
  ['Joint Beamforming and Spectrum Allocation for Space-Air-Ground Integrated Networks', 'Xiaofei Zhang, Jianfeng Li, Siyuan Liu, et al.', 'IEEE Transactions on Communications', 2025, 'SCI一区', 'journal'],
  ['Spectrum Situation Prediction in Complex Electromagnetic Environment via Graph Neural Networks', 'Dongfang Xu, Xiaozhen Lu, Wenjing Zhao, et al.', 'IEEE Transactions on Cognitive Communications and Networking', 2024, 'SCI二区', 'journal'],
  ['Anti-Interference Resource Scheduling for UAV Swarm Communications: A Multi-Agent RL Approach', 'Chao Dong, Yuben Qu, Jiahao Chen, et al.', 'IEEE Internet of Things Journal', 2024, 'SCI一区', 'journal'],
  ['Array Signal Processing Based DOA Estimation Under Mutually Coupled Sensors', 'Xiaofei Zhang, Weizhi Zhong, Haoran Sun, et al.', 'IEEE Transactions on Signal Processing', 2024, 'SCI一区', 'journal'],
  ['Intelligent Spectrum Sharing Between Satellite and Terrestrial Networks: Architecture and Key Technologies', 'Bo Zhou, Fangwei Ye, Yutong Li, et al.', 'IEEE Wireless Communications Magazine', 2024, 'SCI一区', 'journal'],
  ['Best Paper Award: Cognitive Spectrum Access for LEO Mega-Constellations', 'Qihui Wu, Fuhui Zhou, et al.', 'IEEE International Conference on Communications (ICC)', 2026, '顶会最佳论文', 'conference'],
  ['Energy-Efficient Task Offloading for Air-Ground Integrated Edge Networks', 'Meng Sun, Yang Huang, Tianyu Wu, et al.', 'IEEE Global Communications Conference (GLOBECOM)', 2025, 'CCF-C类会议', 'conference']
];

// 社会媒体对实验室的报道（platform 字段存媒体名称）
const socialPosts = [
  ['科技日报', '电磁频谱认知智能通信：给无线世界装上"智慧大脑"', 'https://example.com/media/keji-daily', '/images/official/news-icc-award.png', '2026-08-15', 1],
  ['新华日报', '南航电磁频谱团队：守护看不见的"频谱国土"', 'https://example.com/media/xh-daily', '/images/official/news-academician-visit.png', '2026-07-30', 2],
  ['中国教育报', '科教融合育英才——走进南航电磁频谱实验室', 'https://example.com/media/china-education', '/images/official/news-teaching-award.png', '2026-07-05', 3],
  ['江苏卫视', '低空经济起飞，无人机通信如何保驾护航', 'https://example.com/media/js-tv', '/images/site/platform-uav-test.png', '2026-06-18', 4],
  ['人民网', '卫星互联网时代，频谱共享难题这样破解', 'https://example.com/media/people-cn', '/images/site/platform-ground-station.png', '2026-05-26', 5],
  ['南航新闻网', '我室成果荣获 IEEE ICC 2026 最佳论文奖', 'https://example.com/media/nuaa-news', '/images/official/news-icc-award.png', '2026-05-26', 6],
  ['中国青年报', '把论文写在祖国的空天上', 'https://example.com/media/cyol', '/images/official/news-party-building.jpg', '2026-04-29', 7],
  ['澎湃新闻', '专家解读：电磁频谱安全为何关乎国计民生', 'https://example.com/media/thepaper', '/images/site/platform-spectrum-lab.png', '2026-04-12', 8]
];

const students = [
  ['王晓东', '博士研究生', 'student', 'current', 'doctor', 2023, null, '频谱感知与智能决策', '研究低轨卫星星座频谱感知与动态接入方法。'],
  ['刘思远', '博士研究生', 'student', 'current', 'doctor', 2024, null, '天地一体化资源分配', '研究空天地一体化网络波束成形与频谱共享。'],
  ['李雨桐', '博士研究生', 'student', 'current', 'doctor', 2024, null, '星地频谱共享', '研究星地频谱共享智能判决与干扰协调。'],
  ['陈嘉豪', '硕士研究生', 'student', 'current', 'master', 2024, null, '无人机抗干扰通信', '研究无人机集群通信抗干扰资源调度。'],
  ['赵文静', '硕士研究生', 'student', 'current', 'master', 2025, null, '频谱态势预测', '研究基于图神经网络的频谱态势预测。'],
  ['孙浩然', '硕士研究生', 'student', 'current', 'master', 2025, null, '阵列信号处理', '研究复杂阵列条件下的DOA估计方法。'],
  ['周雨薇', '硕士研究生', 'student', 'current', 'master', 2025, null, '低空智能通信', '研究低空无人机组网与通信感知融合。'],
  ['吴天宇', '硕士研究生', 'student', 'current', 'master', 2026, null, '智能频谱管理', '研究基于强化学习的频谱接入决策。']
];

const alumniMembers = [
  ['陈思详', '硕士毕业生', 'student', 'alumni', 'master', 2026, 2026, '华为 · 算法部', '频谱认知与智能决策', ''],
  ['林晨', '博士毕业生', 'student', 'alumni', 'doctor', 2022, 2025, '南京理工大学 · 讲师', '天地一体化网络', '入职高校任教。'],
  ['黄一鸣', '硕士毕业生', 'student', 'alumni', 'master', 2023, 2025, '中国电科第十四研究所', '频谱感知', ''],
  ['徐婧', '硕士毕业生', 'student', 'alumni', 'master', 2023, 2025, '中兴通讯 · 预研部', '无线资源管理', ''],
  ['郑凯文', '硕士毕业生', 'student', 'alumni', 'master', 2022, 2024, '华为 · 无线网络部', '智能通信', ''],
  ['王蕾', '博士毕业生', 'student', 'alumni', 'doctor', 2020, 2024, '航天科技集团第五研究院', '星地通信', ''],
  ['刘洋', '硕士毕业生', 'student', 'alumni', 'master', 2021, 2023, '江苏省电信规划设计院', '频谱数据分析', '']
];

const datasets = [
  ['SpectrumNet-1.0 电磁频谱认知公开数据集', '面向频谱感知与调制识别研究，包含 12 类典型辐射源信号、多信道实测频谱数据与标注元数据，共计约 120GB。', '', '约 120GB', 'dataset'],
  ['UAV-Channel-2025 低空无人机信道测量数据集', '城市与郊区低空场景（30–300 m）无人机空地信道测量数据，含路径损耗、时延扩展与小尺度衰落统计。', '', '约 36GB', 'dataset'],
  ['SatSpectrum 卫星频谱占用数据集', 'C/Ku 频段卫星频谱占用长期观测数据，可用于频谱共享与干扰识别研究。', '', '约 58GB', 'dataset']
];

const textbooks = [
  ['《认知无线电原理与应用》', '系统介绍频谱认知、动态频谱接入与频谱管理的基本理论与工程实践。', '', '第2版', 'textbook'],
  ['《阵列信号处理理论与方法》', '讲述阵列信号模型、DOA估计、波束成形及其在通信与雷达中的应用。', '', '第3版', 'textbook'],
  ['《天地一体化通信网络》', '围绕卫星通信、空间网络与地面网络融合，阐述体系架构与关键技术。', '', '第1版', 'textbook']
];

async function seed() {
  // 平台
  await db.run('DELETE FROM platforms');
  for (const [level, name, description, image, sort] of platforms) {
    await db.run(
      'INSERT INTO platforms (level,name,description,image_url,sort_order,is_active) VALUES (?,?,?,?,?,1)',
      [level, name, description, image, sort]
    );
  }

  // 专利
  await db.run('DELETE FROM patents');
  let order = 1;
  for (const [title, no, inventors, kind, status, date] of patents) {
    await db.run(
      'INSERT INTO patents (title,patent_no,inventors,kind,status,grant_date,sort_order,is_active) VALUES (?,?,?,?,?,?,?,1)',
      [title, no, inventors, kind, status, date, order++]
    );
  }

  // 论文
  await db.run('DELETE FROM papers');
  order = 1;
  for (const [title, authors, venue, year, level, type] of papers) {
    await db.run(
      'INSERT INTO papers (title,authors,venue,year,level,pub_type,sort_order,is_active) VALUES (?,?,?,?,?,?,?,1)',
      [title, authors, venue, year, level, type, order++]
    );
  }

  // 社媒动态
  await db.run('DELETE FROM social_posts');
  for (const [platform, title, url, image, date, sort] of socialPosts) {
    await db.run(
      'INSERT INTO social_posts (platform,title,url,image_url,publish_date,sort_order,is_active) VALUES (?,?,?,?,?,?,1)',
      [platform, title, url, image, date, sort]
    );
  }

  // 学生（在读 + 毕业去向）
  await db.run("DELETE FROM team_members WHERE member_type = 'student'");
  for (const [name, title, type, status, level, enroll, grad, area, bio, dest] of students) {
    await db.run(
      `INSERT INTO team_members
       (name,title,role,photo_url,email,research_area,bio,sort_order,is_active,member_type,member_status,student_level,enrollment_year,graduation_year,destination)
       VALUES (?,?,?,?,?,?,?,0,1,?,?,?,?,?,?)`,
      [name, title, 'member', '', '', area, bio, type, status, level, enroll, grad || null, '']
    );
  }
  for (const [name, title, type, status, level, enroll, grad, dest, area, note] of alumniMembers) {
    await db.run(
      `INSERT INTO team_members
       (name,title,role,photo_url,email,research_area,bio,sort_order,is_active,member_type,member_status,student_level,enrollment_year,graduation_year,destination)
       VALUES (?,?,?,?,?,?,?,0,1,?,?,?,?,?,?)`,
      [name, title, 'member', '', '', area, note, type, status, level, enroll, grad, dest]
    );
  }

  // 数据集与教材
  await db.run("DELETE FROM downloads WHERE category IN ('dataset','textbook')");
  for (const [title, description, url, size, category] of datasets.concat(textbooks)) {
    await db.run(
      'INSERT INTO downloads (title,description,file_url,file_size,category,is_active) VALUES (?,?,?,?,?,1)',
      [title, description, url, size, category]
    );
  }

  console.log('新导航演示内容已填充：平台/专利/论文/社媒/学生/数据集/教材');
}

seed().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
