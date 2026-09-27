/**
 * 结构化栏目内容（研究目标 / 发展历程）
 *
 * 为什么不用「页面文案」那套富文本：
 * 这两块前台是**固定版式**——研究目标是 4 个卡片组成的网格（.goals-grid/.goal-item），
 * 发展历程是一条时间轴（.history-track/.history-event）。
 * 而页面文案保存时会过 cleanRichContent() 清洗，
 * 白名单里 class 只允许出现在 <figure> 上 —— 版式类和图标类（fa-*）都会被剥掉，
 * 用富文本编辑器根本排不出这个版式。
 *
 * 所以改成「填条目」：后台只填文字，版式由模板保证。
 * 数据存 settings 表的 page_items_<key>，值是 JSON 数组。
 */

const DEFAULTS = {
  'about-goals': [
    { icon: 'fa-satellite', title: '一个核心', desc: '以认知与决策信息理论为核心，研究智能信息获取、学习与决策' },
    { icon: 'fa-brain', title: '天地一体化网络', desc: '研究卫星、航空平台、临近空间和地面网络的多层协同' },
    { icon: 'fa-shield-alt', title: '电磁频谱空间', desc: '研究频谱感知、共享、动态授权、优化利用与安全管控' },
    { icon: 'fa-cogs', title: '四个特色', desc: '服务航空、航天、民航、国防，推动理论研究与重大需求结合' }
  ],
  'about-history': [
    { year: '2016', title: '实验室成立', desc: '电磁频谱认知智能通信实验室正式成立' },
    { year: '2022', title: '入选百强创新团队', desc: '团队入选南京航空航天大学首批百强创新团队' },
    { year: '2026', title: '面向低空与天地一体化持续创新', desc: '围绕低空智能通信、电磁频谱管控和空天信息技术持续开展科研与合作' }
  ]
};

const META = {
  'about-goals': {
    label: '研究目标',
    page: '/about（实验室概况）',
    layout: '卡片网格',
    fields: [
      { key: 'icon', label: '图标', hint: 'FontAwesome 图标名，如 fa-satellite / fa-brain / fa-shield-alt / fa-cogs' },
      { key: 'title', label: '标题', required: true, max: 60 },
      { key: 'desc', label: '说明', type: 'textarea', required: true, max: 300 }
    ]
  },
  'about-history': {
    label: '发展历程',
    page: '/about（实验室概况）',
    layout: '时间轴',
    fields: [
      { key: 'year', label: '年份', required: true, max: 20 },
      { key: 'title', label: '事件标题', required: true, max: 60 },
      { key: 'desc', label: '事件说明', type: 'textarea', required: true, max: 300 }
    ]
  }
};

const KEYS = Object.keys(DEFAULTS);

function isKey(key) { return Object.hasOwn(DEFAULTS, key); }

function defaults(key) { return JSON.parse(JSON.stringify(DEFAULTS[key] || [])); }

function meta(key) { return META[key] || null; }

/** 图标名只允许 fa- 开头的字母数字短横线，防止塞进奇怪的 class */
function safeIcon(value) {
  const icon = String(value || '').trim();
  return /^fa-[a-z0-9-]{1,40}$/.test(icon) ? icon : 'fa-circle';
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/**
 * 把前端传来的数组规整成可信的数据：
 * - 只保留已知字段
 * - 丢掉全空的条目
 * - 截断超长文本
 * - 空数组视为「恢复默认」（返回 null 让调用方删掉设置）
 */
function normalize(key, raw) {
  if (!isKey(key)) throw Object.assign(new Error('栏目不存在'), { status: 404 });
  if (!Array.isArray(raw)) throw Object.assign(new Error('数据格式不正确'), { status: 400 });
  if (raw.length > 30) throw Object.assign(new Error('条目最多 30 条'), { status: 400 });

  const spec = META[key].fields;
  const items = raw.map(entry => {
    const source = (entry && typeof entry === 'object') ? entry : {};
    const out = {};
    spec.forEach(field => {
      const max = field.max || 300;
      out[field.key] = field.key === 'icon' ? safeIcon(source[field.key]) : text(source[field.key], max);
    });
    return out;
  }).filter(item => spec.some(field => field.key !== 'icon' && item[field.key]));

  return items.length ? items : null;
}

/** 从 settings 里解析已保存的条目；没存过或解析失败就返回默认 */
function read(stored) {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch (error) {
    return null;
  }
}

module.exports = { KEYS, isKey, defaults, meta, normalize, read, safeIcon };
