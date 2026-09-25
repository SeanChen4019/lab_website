const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');

const JWT_SECRET = process.env.JWT_SECRET || 'nuaa-lab-jwt-secret-2026';

// ---- 简易登录限速器 ----
const loginAttempts = new Map(); // IP → { count, resetTime }
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && now < record.resetTime && record.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: '登录尝试过多，请15分钟后再试' });
  }

  if (!record || now >= record.resetTime) {
    loginAttempts.set(ip, { count: 0, resetTime: now + LOGIN_WINDOW_MS });
  }

  next();
}

// 定期清理过期记录
const loginCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now >= record.resetTime) loginAttempts.delete(ip);
  }
}, 300_000);
loginCleanupTimer.unref();

// ---- 输入长度校验 ----
const LIMITS = {
  title: 200,
  name: 100,
  summary: 500,
  bio: 2000,
  description: 2000,
  content: 50000,
  email: 200,
  research_area: 300,
  funding_source: 300,
  major: 200,
  destination: 500,
  position: 200,
  note: 1000,
  resume: 10000,
  recent_updates: 5000,
  username: 50,
  password: 128,
  patent_no: 100,
  inventors: 500,
  authors: 500,
  venue: 300,
  abstract: 5000,
  direction: 100,
  doi: 200
};

function validateLengths(fields) {
  return function (req, res, next) {
    for (const field of fields) {
      const limit = LIMITS[field];
      const value = req.body[field];
      if (limit && typeof value === 'string' && value.length > limit) {
        return res.status(400).json({ success: false, message: `${field} 超出长度限制（最多${limit}字）` });
      }
    }
    next();
  };
}

function requiredText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text) return { error: `请填写${label}` };
  if (maxLength && text.length > maxLength) return { error: `${label}最多${maxLength}字` };
  return { value: text };
}

function normalizeFlag(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return Number(value) === 1 || value === true || value === 'true' ? 1 : 0;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return text;
}

function normalizeYear(value) {
  if (value === undefined || value === null || value === '') return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

function normalizeUrl(value, options = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  try {
    const parsed = new URL(text);
    const schemes = options.allowMail ? ['http:', 'https:', 'mailto:'] : ['http:', 'https:'];
    return schemes.includes(parsed.protocol) ? parsed.toString() : null;
  } catch (error) {
    return null;
  }
}

// DOI 允许写成 "10.1109/TWC.2025.1234567" 或完整链接，统一存成裸 DOI。
function normalizeDoi(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  return text.length <= 200 ? text : null;
}

function cleanRichContent(content = '') {
  return sanitizeHtml(content, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'figure', 'img', 'figcaption', 'div', 'span'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      figure: ['class', 'style'],
      img: ['src', 'alt', 'style'],
      p: ['style'],
      div: ['style'],
      span: ['style']
    },
    allowedClasses: {
      figure: ['article-figure', 'align-left', 'align-center', 'align-right']
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify)$/],
        'width': [/^(33|50|75|100)%$/],
        'height': [/^auto$/]
      }
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false
  });
}

// JWT验证中间件 — 仅接受 Bearer token（不使用 session 回退，避免 CSRF）
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: '未授权，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token无效或已过期' });
  }
}

// ---- 文件上传（复用 server.js 中的 multer 配置） ----
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedExts = /^(jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const allowedMimes = /^(image\/(jpeg|png|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument[^;]*|vnd\.ms-[^;]*|vnd\.rar|zip|x-rar-compressed|octet-stream))$/;
    const extOk = allowedExts.test(ext);
    const mimeOk = allowedMimes.test(file.mimetype);

    if (!extOk || !mimeOk) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

// ============ 认证相关 ============

// 登录（限速）
router.post('/auth/login', rateLimitLogin, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }

    if (username.length > 50 || password.length > 128) {
      return res.status(400).json({ success: false, message: '输入长度超出限制' });
    }

    // 记录失败尝试
    const ip = req.ip || req.connection.remoteAddress;
    const record = loginAttempts.get(ip);

    const admin = await db.get(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );

    if (!admin) {
      if (record) record.count++;
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const isValidPassword = bcrypt.compareSync(password, admin.password);
    if (!isValidPassword) {
      if (record) record.count++;
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 登录成功，清除失败记录
    loginAttempts.delete(ip);

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    req.session.token = token;

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 登出
router.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: '已退出登录' });
});

// 获取当前用户信息
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const admin = await db.get(
      'SELECT id, username, name, role FROM admins WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, user: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/auth/password', authMiddleware, validateLengths(['password']), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: '新密码至少需要8位' });
    }
    if (String(currentPassword).length > 128 || String(newPassword).length > 128) {
      return res.status(400).json({ success: false, message: '密码长度不能超过128位' });
    }
    // 密码复杂度：至少包含字母和数字
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ success: false, message: '新密码需要包含字母和数字' });
    }
    const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.user.id]);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password)) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }
    await db.run('UPDATE admins SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.user.id]);
    res.json({ success: true, message: '密码已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '密码更新失败' });
  }
});

// ============ 轮播图管理 ============

router.get('/banners', authMiddleware, async (req, res) => {
  try {
    const banners = await db.all('SELECT * FROM banners ORDER BY sort_order ASC');
    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/banners', authMiddleware, validateLengths(['title']), async (req, res) => {
  try {
    const { title, image_url, link_url, sort_order, is_active = 1 } = req.body;
    const result = await db.run(
      'INSERT INTO banners (title, image_url, link_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
      [title, image_url, link_url || '', sort_order || 0, is_active]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/banners/:id', authMiddleware, validateLengths(['title']), async (req, res) => {
  try {
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    await db.run(
      'UPDATE banners SET title = ?, image_url = ?, link_url = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [title, image_url, link_url || '', sort_order || 0, is_active, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/banners/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM banners WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 通知公告管理 ============

router.get('/notices', authMiddleware, async (req, res) => {
  try {
    const notices = await db.all('SELECT * FROM notices ORDER BY is_top DESC, publish_date DESC');
    res.json({ success: true, notices });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/notices', authMiddleware, validateLengths(['title', 'content']), async (req, res) => {
  try {
    const { title, content, link_url, is_top, is_active = 1, publish_date } = req.body;
    const checkedTitle = requiredText(title, '通知标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedLink = normalizeUrl(link_url, { allowMail: true });
    if (checkedLink === null) return res.status(400).json({ success: false, message: '相关链接必须是 http(s)、mailto 或站内地址' });
    const result = await db.run(
      'INSERT INTO notices (title, content, link_url, is_top, is_active, publish_date) VALUES (?, ?, ?, ?, ?, ?)',
      [checkedTitle.value, cleanRichContent(content), checkedLink, normalizeFlag(is_top), normalizeFlag(is_active, 1), checkedDate]
    );
    const id = result.lastID;
    res.status(201).json({ success: true, message: '发布成功', id, url: '/notice/' + id });
  } catch (error) {
    console.error('通知发布失败:', error);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/notices/:id', authMiddleware, validateLengths(['title', 'content']), async (req, res) => {
  try {
    const { title, content, link_url, is_top, is_active, publish_date } = req.body;
    const checkedTitle = requiredText(title, '通知标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedLink = normalizeUrl(link_url, { allowMail: true });
    if (checkedLink === null) return res.status(400).json({ success: false, message: '相关链接必须是 http(s)、mailto 或站内地址' });
    await db.run(
      'UPDATE notices SET title = ?, content = ?, link_url = ?, is_top = ?, is_active = ?, publish_date = ? WHERE id = ?',
      [checkedTitle.value, cleanRichContent(content), checkedLink, normalizeFlag(is_top), normalizeFlag(is_active, 1), checkedDate, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/notices/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM notices WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 新闻管理 ============

router.get('/news', authMiddleware, async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM news';
    const params = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY is_top DESC, publish_date DESC';
    const news = await db.all(sql, params);
    res.json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/news', authMiddleware, validateLengths(['title', 'summary', 'content']), async (req, res) => {
  try {
    const { category, title, summary, content, image_url, is_top, is_active = 1, publish_date } = req.body;
    const checkedTitle = requiredText(title, '文章标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const allowedCategories = ['team', 'research', 'teaching', 'exchange', 'education'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ success: false, message: '请选择正确的新闻栏目' });
    }
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '封面图片地址不正确' });
    const result = await db.run(
      'INSERT INTO news (category, title, summary, content, image_url, is_top, is_active, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [category, checkedTitle.value, String(summary || '').trim(), cleanRichContent(content), checkedImage, normalizeFlag(is_top), normalizeFlag(is_active, 1), checkedDate]
    );
    const id = result.lastID;
    res.status(201).json({ success: true, message: '发布成功', id, url: '/news/' + id });
  } catch (error) {
    console.error('新闻发布失败:', error);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/news/:id', authMiddleware, validateLengths(['title', 'summary', 'content']), async (req, res) => {
  try {
    const { category, title, summary, content, image_url, is_top, is_active, publish_date } = req.body;
    const checkedTitle = requiredText(title, '文章标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const allowedCategories = ['team', 'research', 'teaching', 'exchange', 'education'];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ success: false, message: '请选择正确的新闻栏目' });
    }
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '封面图片地址不正确' });
    await db.run(
      'UPDATE news SET category = ?, title = ?, summary = ?, content = ?, image_url = ?, is_top = ?, is_active = ?, publish_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [category, checkedTitle.value, String(summary || '').trim(), cleanRichContent(content), checkedImage, normalizeFlag(is_top), normalizeFlag(is_active, 1), checkedDate, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/news/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM news WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 团队成员管理 ============

router.get('/team', authMiddleware, async (req, res) => {
  try {
    const members = await db.all(`
      SELECT * FROM team_members
      ORDER BY CASE member_type WHEN 'teacher' THEN 0 ELSE 1 END,
               CASE role WHEN 'leader' THEN 0 ELSE 1 END,
               CASE member_status WHEN 'current' THEN 0 ELSE 1 END,
               sort_order ASC, id ASC
    `);
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/team', authMiddleware, validateLengths(['name', 'title', 'bio', 'email', 'research_area', 'destination', 'resume', 'recent_updates']), async (req, res) => {
  try {
    const {
      name, title, role = 'member', photo_url, email, research_area, bio,
      member_type = 'teacher', member_status = 'current', student_level = '',
      enrollment_year, graduation_year, destination, resume, recent_updates,
      sort_order, is_active = 1
    } = req.body;
    const checkedName = requiredText(name, '姓名', LIMITS.name);
    if (checkedName.error) return res.status(400).json({ success: false, message: checkedName.error });
    if (!['teacher', 'student'].includes(member_type)) return res.status(400).json({ success: false, message: '请选择教师或学生' });
    if (!['leader', 'member'].includes(role)) return res.status(400).json({ success: false, message: '团队角色不正确' });
    if (!['current', 'alumni'].includes(member_status)) return res.status(400).json({ success: false, message: '成员状态不正确' });
    if (student_level && !['undergraduate', 'master', 'doctor'].includes(student_level)) return res.status(400).json({ success: false, message: '培养层次不正确' });
    const checkedEnrollmentYear = normalizeYear(enrollment_year);
    const checkedGraduationYear = normalizeYear(graduation_year);
    if (checkedEnrollmentYear === undefined || checkedGraduationYear === undefined) return res.status(400).json({ success: false, message: '年份应在1900至2100之间' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    const checkedPhoto = normalizeUrl(photo_url);
    if (checkedPhoto === null) return res.status(400).json({ success: false, message: '照片地址不正确' });
    const result = await db.run(
      `INSERT INTO team_members
       (name, title, role, photo_url, email, research_area, bio, member_type, member_status,
        student_level, enrollment_year, graduation_year, destination, resume, recent_updates, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        checkedName.value, String(title || '').trim(), member_type === 'student' ? 'member' : role,
        checkedPhoto, String(email || '').trim(), String(research_area || '').trim(), String(bio || '').trim(),
        member_type, member_type === 'teacher' ? 'current' : member_status,
        member_type === 'student' ? student_level : '', member_type === 'student' ? checkedEnrollmentYear : null,
        member_type === 'student' ? checkedGraduationYear : null, member_type === 'student' ? String(destination || '').trim() : '',
        String(resume || '').trim(), String(recent_updates || '').trim(), Number(sort_order) || 0, normalizeFlag(is_active, 1)
      ]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/team/' + result.lastID });
  } catch (error) {
    console.error('团队成员添加失败:', error);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/team/:id', authMiddleware, validateLengths(['name', 'title', 'bio', 'email', 'research_area', 'destination', 'resume', 'recent_updates']), async (req, res) => {
  try {
    const {
      name, title, role = 'member', photo_url, email, research_area, bio,
      member_type = 'teacher', member_status = 'current', student_level = '',
      enrollment_year, graduation_year, destination, resume, recent_updates,
      sort_order, is_active
    } = req.body;
    const checkedName = requiredText(name, '姓名', LIMITS.name);
    if (checkedName.error) return res.status(400).json({ success: false, message: checkedName.error });
    if (!['teacher', 'student'].includes(member_type)) return res.status(400).json({ success: false, message: '请选择教师或学生' });
    if (!['leader', 'member'].includes(role)) return res.status(400).json({ success: false, message: '团队角色不正确' });
    if (!['current', 'alumni'].includes(member_status)) return res.status(400).json({ success: false, message: '成员状态不正确' });
    if (student_level && !['undergraduate', 'master', 'doctor'].includes(student_level)) return res.status(400).json({ success: false, message: '培养层次不正确' });
    const checkedEnrollmentYear = normalizeYear(enrollment_year);
    const checkedGraduationYear = normalizeYear(graduation_year);
    if (checkedEnrollmentYear === undefined || checkedGraduationYear === undefined) return res.status(400).json({ success: false, message: '年份应在1900至2100之间' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    const checkedPhoto = normalizeUrl(photo_url);
    if (checkedPhoto === null) return res.status(400).json({ success: false, message: '照片地址不正确' });
    await db.run(
      `UPDATE team_members SET
       name = ?, title = ?, role = ?, photo_url = ?, email = ?, research_area = ?, bio = ?,
       member_type = ?, member_status = ?, student_level = ?, enrollment_year = ?, graduation_year = ?,
       destination = ?, resume = ?, recent_updates = ?, sort_order = ?, is_active = ? WHERE id = ?`,
      [
        checkedName.value, String(title || '').trim(), member_type === 'student' ? 'member' : role,
        checkedPhoto, String(email || '').trim(), String(research_area || '').trim(), String(bio || '').trim(),
        member_type, member_type === 'teacher' ? 'current' : member_status,
        member_type === 'student' ? student_level : '', member_type === 'student' ? checkedEnrollmentYear : null,
        member_type === 'student' ? checkedGraduationYear : null, member_type === 'student' ? String(destination || '').trim() : '',
        String(resume || '').trim(), String(recent_updates || '').trim(), Number(sort_order) || 0,
        normalizeFlag(is_active, 1), req.params.id
      ]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/team/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM team_members WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 历届毕业生管理 ============

router.get('/alumni', authMiddleware, async (req, res) => {
  try {
    const alumni = await db.all(`
      SELECT * FROM alumni
      ORDER BY graduation_year DESC, degree_level ASC, sort_order ASC, id DESC
    `);
    res.json({ success: true, alumni });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取历届毕业生失败' });
  }
});

router.post('/alumni', authMiddleware, validateLengths(['name', 'major', 'destination', 'position', 'note']), async (req, res) => {
  try {
    const {
      name, degree_level, graduation_year, major, destination_type,
      destination, position, photo_url, note, sort_order, is_active = 1
    } = req.body;
    if (!['undergraduate', 'master', 'doctor'].includes(degree_level)) {
      return res.status(400).json({ success: false, message: '请选择正确的培养层次' });
    }
    const result = await db.run(
      `INSERT INTO alumni
       (name, degree_level, graduation_year, major, destination_type, destination, position, photo_url, note, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, degree_level, graduation_year || null, major || '',
        destination_type || 'employment', destination || '', position || '',
        photo_url || '', note || '', sort_order || 0, is_active
      ]
    );
    res.status(201).json({ success: true, message: '毕业生信息添加成功', id: result.lastID, url: '/alumni' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加毕业生信息失败' });
  }
});

router.put('/alumni/:id', authMiddleware, validateLengths(['name', 'major', 'destination', 'position', 'note']), async (req, res) => {
  try {
    const {
      name, degree_level, graduation_year, major, destination_type,
      destination, position, photo_url, note, sort_order, is_active
    } = req.body;
    if (!['undergraduate', 'master', 'doctor'].includes(degree_level)) {
      return res.status(400).json({ success: false, message: '请选择正确的培养层次' });
    }
    await db.run(
      `UPDATE alumni SET
       name = ?, degree_level = ?, graduation_year = ?, major = ?,
       destination_type = ?, destination = ?, position = ?, photo_url = ?,
       note = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        name, degree_level, graduation_year || null, major || '',
        destination_type || 'employment', destination || '', position || '',
        photo_url || '', note || '', sort_order || 0, is_active, req.params.id
      ]
    );
    res.json({ success: true, message: '毕业生信息更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新毕业生信息失败' });
  }
});

router.delete('/alumni/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM alumni WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '毕业生信息已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除毕业生信息失败' });
  }
});

// ============ 研究方向管理 ============

router.get('/research-areas', authMiddleware, async (req, res) => {
  try {
    const areas = await db.all('SELECT * FROM research_areas ORDER BY sort_order ASC');
    // researchAreas 是规范名（其余 11 个列表接口都用资源名复数）；
    // areas 是历史名，保留是因为 public/js/admin-visual.js 没走 assetUrl 缓存失效，
    // 已缓存旧脚本的浏览器还在用它。两者指向同一个数组。
    res.json({ success: true, areas, researchAreas: areas });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/research-areas', authMiddleware, validateLengths(['title', 'description']), async (req, res) => {
  try {
    const { title, description, icon, sort_order, is_active = 1 } = req.body;
    const result = await db.run(
      'INSERT INTO research_areas (title, description, icon, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
      [title, description, icon || '', sort_order || 0, is_active]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/research' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/research-areas/:id', authMiddleware, validateLengths(['title', 'description']), async (req, res) => {
  try {
    const { title, description, icon, sort_order, is_active } = req.body;
    await db.run(
      'UPDATE research_areas SET title = ?, description = ?, icon = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [title, description, icon, sort_order, is_active, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/research-areas/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM research_areas WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 项目管理 ============

router.get('/projects', authMiddleware, async (req, res) => {
  try {
    const projects = await db.all('SELECT * FROM projects ORDER BY start_date DESC');
    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/projects', authMiddleware, validateLengths(['title', 'description', 'funding_source']), async (req, res) => {
  try {
    const { title, description, funding_source, start_date, end_date, status, is_active = 1, content, cover_image } = req.body;
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    const result = await db.run(
      'INSERT INTO projects (title, description, funding_source, start_date, end_date, status, is_active, content, cover_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description, funding_source || '', start_date, end_date, status || '进行中', is_active,
       cleanRichContent(content), checkedCover]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/achievements#projects' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/projects/:id', authMiddleware, validateLengths(['title', 'description', 'funding_source']), async (req, res) => {
  try {
    const { title, description, funding_source, start_date, end_date, status, is_active, content, cover_image } = req.body;
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    await db.run(
      'UPDATE projects SET title = ?, description = ?, funding_source = ?, start_date = ?, end_date = ?, status = ?, is_active = ?, content = ?, cover_image = ? WHERE id = ?',
      [title, description, funding_source, start_date, end_date, status, is_active,
       cleanRichContent(content), checkedCover, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/projects/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 下载管理 ============

router.get('/downloads', authMiddleware, async (req, res) => {
  try {
    const downloads = await db.all('SELECT * FROM downloads ORDER BY category, created_at DESC');
    res.json({ success: true, downloads });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/downloads', authMiddleware, validateLengths(['title', 'description']), async (req, res) => {
  try {
    const { title, description, file_url, file_size, category, is_active = 1 } = req.body;
    const checkedTitle = requiredText(title, '资源名称', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedFile = normalizeUrl(file_url);
    if (!checkedFile) return res.status(400).json({ success: false, message: '请上传文件或填写正确的文件地址' });
    const result = await db.run(
      'INSERT INTO downloads (title, description, file_url, file_size, category, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [checkedTitle.value, description || '', checkedFile, file_size || '', category || '其他', normalizeFlag(is_active, 1)]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/downloads' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/downloads/:id', authMiddleware, validateLengths(['title', 'description']), async (req, res) => {
  try {
    const { title, description, file_url, file_size, category, is_active } = req.body;
    const checkedTitle = requiredText(title, '资源名称', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedFile = normalizeUrl(file_url);
    if (!checkedFile) return res.status(400).json({ success: false, message: '请上传文件或填写正确的文件地址' });
    await db.run(
      'UPDATE downloads SET title = ?, description = ?, file_url = ?, file_size = ?, category = ?, is_active = ? WHERE id = ?',
      [checkedTitle.value, description || '', checkedFile, file_size || '', category || '其他', normalizeFlag(is_active, 1), req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/downloads/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM downloads WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 平台管理 ============

router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    const platforms = await db.all('SELECT * FROM platforms ORDER BY sort_order ASC, id ASC');
    res.json({ success: true, platforms });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/platforms', authMiddleware, validateLengths(['name', 'description']), async (req, res) => {
  try {
    const { level, name, description, image_url, sort_order, is_active = 1 } = req.body;
    const checkedName = requiredText(name, '平台名称', LIMITS.title);
    if (checkedName.error) return res.status(400).json({ success: false, message: checkedName.error });
    if (!['national', 'provincial'].includes(level)) return res.status(400).json({ success: false, message: '请选择平台级别' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '平台图片地址不正确' });
    const result = await db.run(
      'INSERT INTO platforms (level, name, description, image_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [level, checkedName.value, description || '', checkedImage, Number(sort_order) || 0, normalizeFlag(is_active, 1)]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/platforms' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/platforms/:id', authMiddleware, validateLengths(['name', 'description']), async (req, res) => {
  try {
    const { level, name, description, image_url, sort_order, is_active } = req.body;
    const checkedName = requiredText(name, '平台名称', LIMITS.title);
    if (checkedName.error) return res.status(400).json({ success: false, message: checkedName.error });
    if (!['national', 'provincial'].includes(level)) return res.status(400).json({ success: false, message: '请选择平台级别' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '平台图片地址不正确' });
    await db.run(
      'UPDATE platforms SET level = ?, name = ?, description = ?, image_url = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [level, checkedName.value, description || '', checkedImage, Number(sort_order) || 0, normalizeFlag(is_active, 1), req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/platforms/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM platforms WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 专利管理 ============

router.get('/patents', authMiddleware, async (req, res) => {
  try {
    const patents = await db.all('SELECT * FROM patents ORDER BY grant_date DESC, sort_order ASC, id ASC');
    res.json({ success: true, patents });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/patents', authMiddleware, validateLengths(['title', 'patent_no', 'inventors', 'abstract']), async (req, res) => {
  try {
    const { title, patent_no, inventors, kind, status, grant_date, sort_order, is_active = 1, abstract, content, cover_image } = req.body;
    const checkedTitle = requiredText(title, '专利名称', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(grant_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '授权日期格式不正确' });
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    const result = await db.run(
      `INSERT INTO patents
        (title, patent_no, inventors, kind, status, grant_date, sort_order, is_active, abstract, content, cover_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkedTitle.value, patent_no || '', inventors || '', kind || '发明专利', status || '已授权', checkedDate,
       Number(sort_order) || 0, normalizeFlag(is_active, 1),
       String(abstract || '').trim(), cleanRichContent(content), checkedCover]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/achievements#patents' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/patents/:id', authMiddleware, validateLengths(['title', 'patent_no', 'inventors', 'abstract']), async (req, res) => {
  try {
    const { title, patent_no, inventors, kind, status, grant_date, sort_order, is_active, abstract, content, cover_image } = req.body;
    const checkedTitle = requiredText(title, '专利名称', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(grant_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '授权日期格式不正确' });
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    await db.run(
      `UPDATE patents SET
        title = ?, patent_no = ?, inventors = ?, kind = ?, status = ?, grant_date = ?,
        sort_order = ?, is_active = ?, abstract = ?, content = ?, cover_image = ?
       WHERE id = ?`,
      [checkedTitle.value, patent_no || '', inventors || '', kind || '发明专利', status || '已授权', checkedDate,
       Number(sort_order) || 0, normalizeFlag(is_active, 1),
       String(abstract || '').trim(), cleanRichContent(content), checkedCover, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/patents/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM patents WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 论文管理 ============

router.get('/papers', authMiddleware, async (req, res) => {
  try {
    const papers = await db.all('SELECT * FROM papers ORDER BY year DESC, sort_order ASC, id ASC');
    res.json({ success: true, papers });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/papers', authMiddleware, validateLengths(['title', 'authors', 'venue', 'abstract', 'direction', 'doi']), async (req, res) => {
  try {
    const {
      title, authors, venue, year, level, pub_type, link, sort_order, is_active = 1,
      abstract, content, cover_image, pdf_url, code_url, doi, direction
    } = req.body;
    const checkedTitle = requiredText(title, '论文标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    if (!['journal', 'conference'].includes(pub_type)) return res.status(400).json({ success: false, message: '请选择论文类型' });
    const checkedYear = normalizeYear(year);
    if (checkedYear === undefined || checkedYear === null) return res.status(400).json({ success: false, message: '发表年份应在1900至2100之间' });
    const checkedLink = normalizeUrl(link);
    if (checkedLink === null) return res.status(400).json({ success: false, message: '论文链接地址不正确' });
    const checkedPdf = normalizeUrl(pdf_url);
    if (checkedPdf === null) return res.status(400).json({ success: false, message: '论文 PDF 链接地址不正确' });
    const checkedCode = normalizeUrl(code_url);
    if (checkedCode === null) return res.status(400).json({ success: false, message: '代码链接地址不正确' });
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    const checkedDoi = normalizeDoi(doi);
    if (checkedDoi === null) return res.status(400).json({ success: false, message: 'DOI 最多200字' });
    const result = await db.run(
      `INSERT INTO papers
        (title, authors, venue, year, level, pub_type, link, sort_order, is_active,
         abstract, content, cover_image, pdf_url, code_url, doi, direction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkedTitle.value, authors || '', venue || '', checkedYear, level || '', pub_type, checkedLink,
       Number(sort_order) || 0, normalizeFlag(is_active, 1),
       String(abstract || '').trim(), cleanRichContent(content), checkedCover, checkedPdf, checkedCode,
       checkedDoi, String(direction || '').trim()]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/achievements#papers' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/papers/:id', authMiddleware, validateLengths(['title', 'authors', 'venue', 'abstract', 'direction', 'doi']), async (req, res) => {
  try {
    const {
      title, authors, venue, year, level, pub_type, link, sort_order, is_active,
      abstract, content, cover_image, pdf_url, code_url, doi, direction
    } = req.body;
    const checkedTitle = requiredText(title, '论文标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    if (!['journal', 'conference'].includes(pub_type)) return res.status(400).json({ success: false, message: '请选择论文类型' });
    const checkedYear = normalizeYear(year);
    if (checkedYear === undefined || checkedYear === null) return res.status(400).json({ success: false, message: '发表年份应在1900至2100之间' });
    const checkedLink = normalizeUrl(link);
    if (checkedLink === null) return res.status(400).json({ success: false, message: '论文链接地址不正确' });
    const checkedPdf = normalizeUrl(pdf_url);
    if (checkedPdf === null) return res.status(400).json({ success: false, message: '论文 PDF 链接地址不正确' });
    const checkedCode = normalizeUrl(code_url);
    if (checkedCode === null) return res.status(400).json({ success: false, message: '代码链接地址不正确' });
    const checkedCover = normalizeUrl(cover_image);
    if (checkedCover === null) return res.status(400).json({ success: false, message: '封面图地址不正确' });
    const checkedDoi = normalizeDoi(doi);
    if (checkedDoi === null) return res.status(400).json({ success: false, message: 'DOI 最多200字' });
    await db.run(
      `UPDATE papers SET
        title = ?, authors = ?, venue = ?, year = ?, level = ?, pub_type = ?, link = ?,
        sort_order = ?, is_active = ?, abstract = ?, content = ?, cover_image = ?,
        pdf_url = ?, code_url = ?, doi = ?, direction = ?
       WHERE id = ?`,
      [checkedTitle.value, authors || '', venue || '', checkedYear, level || '', pub_type, checkedLink,
       Number(sort_order) || 0, normalizeFlag(is_active, 1),
       String(abstract || '').trim(), cleanRichContent(content), checkedCover, checkedPdf, checkedCode,
       checkedDoi, String(direction || '').trim(), req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/papers/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM papers WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 媒体报道管理 ============

router.get('/social-posts', authMiddleware, async (req, res) => {
  try {
    const posts = await db.all('SELECT * FROM social_posts ORDER BY sort_order ASC, publish_date DESC, id ASC');
    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

router.post('/social-posts', authMiddleware, validateLengths(['title', 'platform']), async (req, res) => {
  try {
    const { platform, title, url, image_url, publish_date, sort_order, is_active = 1 } = req.body;
    const checkedPlatform = requiredText(platform, '媒体名称', 50);
    if (checkedPlatform.error) return res.status(400).json({ success: false, message: checkedPlatform.error });
    const checkedTitle = requiredText(title, '报道标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedUrl = normalizeUrl(url);
    if (checkedUrl === null) return res.status(400).json({ success: false, message: '报道链接必须是 http(s) 或站内地址' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '配图地址不正确' });
    const result = await db.run(
      'INSERT INTO social_posts (platform, title, url, image_url, publish_date, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [checkedPlatform.value, checkedTitle.value, checkedUrl, checkedImage, checkedDate, Number(sort_order) || 0, normalizeFlag(is_active, 1)]
    );
    res.status(201).json({ success: true, message: '添加成功', id: result.lastID, url: '/' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

router.put('/social-posts/:id', authMiddleware, validateLengths(['title', 'platform']), async (req, res) => {
  try {
    const { platform, title, url, image_url, publish_date, sort_order, is_active } = req.body;
    const checkedPlatform = requiredText(platform, '媒体名称', 50);
    if (checkedPlatform.error) return res.status(400).json({ success: false, message: checkedPlatform.error });
    const checkedTitle = requiredText(title, '报道标题', LIMITS.title);
    if (checkedTitle.error) return res.status(400).json({ success: false, message: checkedTitle.error });
    const checkedDate = normalizeDate(publish_date);
    if (!checkedDate) return res.status(400).json({ success: false, message: '发布日期格式不正确' });
    const checkedUrl = normalizeUrl(url);
    if (checkedUrl === null) return res.status(400).json({ success: false, message: '报道链接必须是 http(s) 或站内地址' });
    const checkedImage = normalizeUrl(image_url);
    if (checkedImage === null) return res.status(400).json({ success: false, message: '配图地址不正确' });
    await db.run(
      'UPDATE social_posts SET platform = ?, title = ?, url = ?, image_url = ?, publish_date = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [checkedPlatform.value, checkedTitle.value, checkedUrl, checkedImage, checkedDate, Number(sort_order) || 0, normalizeFlag(is_active, 1), req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

router.delete('/social-posts/:id', authMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM social_posts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// ============ 可视化页面文案 ============

router.get('/page-content/:key', authMiddleware, async (req, res) => {
  try {
    const key = String(req.params.key || '');
    if (!/^[a-z0-9-]{2,80}$/.test(key)) {
      return res.status(400).json({ success: false, message: '页面文案标识不合法' });
    }
    const row = await db.get('SELECT value FROM settings WHERE key = ?', ['page_content_' + key]);
    res.json({ success: true, content: row ? row.value : '' });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取页面文案失败' });
  }
});

router.put('/page-content/:key', authMiddleware, async (req, res) => {
  try {
    const key = String(req.params.key || '');
    const content = String(req.body.content || '');
    if (!/^[a-z0-9-]{2,80}$/.test(key)) {
      return res.status(400).json({ success: false, message: '页面文案标识不合法' });
    }
    if (content.length > 50000) {
      return res.status(400).json({ success: false, message: '页面文案内容过长' });
    }
    await db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['page_content_' + key, cleanRichContent(content)]
    );
    res.json({ success: true, message: '页面文案已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新页面文案失败' });
  }
});

// ============ 设置管理 ============

router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await db.all("SELECT * FROM settings WHERE key NOT LIKE 'page_content_%'");
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

// 允许的 settings key 白名单
const ALLOWED_SETTINGS_KEYS = [
  'site_name', 'site_subtitle', 'site_keywords', 'site_description',
  'contact_email', 'contact_phone', 'contact_address',
  'icp_number', 'footer_text'
];

router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_SETTINGS_KEYS.includes(key)) continue; // 忽略未授权的 key
      if (typeof value !== 'string' || value.length > 1000) continue;
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value]
      );
    }
    res.json({ success: true, message: '设置已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

// ============ 文件上传 ============

router.post('/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择文件' });
    }

    const fileUrl = '/uploads/' + req.file.filename;
    res.json({
      success: true,
      message: '上传成功',
      url: fileUrl,
      filename: req.file.originalname,
      size: req.file.size
    });
  });
});

// ============ 统计数据 ============

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [notices, news, members, projects, downloads, platforms, patents, papers, socialPosts] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM notices'),
      db.get('SELECT COUNT(*) as count FROM news'),
      db.get('SELECT COUNT(*) as count FROM team_members'),
      db.get('SELECT COUNT(*) as count FROM projects'),
      db.get('SELECT COUNT(*) as count FROM downloads'),
      db.get('SELECT COUNT(*) as count FROM platforms'),
      db.get('SELECT COUNT(*) as count FROM patents'),
      db.get('SELECT COUNT(*) as count FROM papers'),
      db.get('SELECT COUNT(*) as count FROM social_posts')
    ]);

    res.json({
      success: true,
      stats: {
        notices: notices.count,
        news: news.count,
        members: members.count,
        projects: projects.count,
        downloads: downloads.count,
        platforms: platforms.count,
        patents: patents.count,
        papers: papers.count,
        socialPosts: socialPosts.count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

module.exports = router;
