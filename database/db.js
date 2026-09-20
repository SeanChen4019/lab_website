const initSQL = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'lab.db');

let dbPromise = null;
let db = null;

// 互斥锁 — 保护 sql.js 的并发操作（export/prepare 不能并发）
let lockQueue = Promise.resolve();
function withLock(fn) {
  const task = lockQueue.then(() => fn());
  lockQueue = task.catch(() => {});
  return task;
}

async function getDb() {
  if (db) return db;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const SQL = await initSQL();

    let fileBuffer;
    if (fs.existsSync(DB_PATH)) {
      fileBuffer = fs.readFileSync(DB_PATH);
    } else {
      // 数据库文件不存在时，创建空数据库
      const emptyDb = new SQL.Database();
      fileBuffer = emptyDb.export();
      emptyDb.close();
    }

    db = new SQL.Database(fileBuffer);

    // 轻量生产迁移：新增表使用 IF NOT EXISTS，部署更新时不会覆盖现有数据
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

    db.run(`
      CREATE TABLE IF NOT EXISTS platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL DEFAULT 'national',
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS patents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        patent_no TEXT,
        inventors TEXT,
        kind TEXT DEFAULT '发明专利',
        status TEXT DEFAULT '已授权',
        grant_date DATE,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS papers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        authors TEXT,
        venue TEXT,
        year INTEGER,
        level TEXT,
        pub_type TEXT DEFAULT 'journal',
        link TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'wechat',
        title TEXT NOT NULL,
        url TEXT,
        image_url TEXT,
        publish_date DATE,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 团队个人主页字段：以增量迁移方式加入，绝不覆盖现有成员资料。
    const teamColumns = new Set();
    const teamColumnStatement = db.prepare('PRAGMA table_info(team_members)');
    while (teamColumnStatement.step()) teamColumns.add(teamColumnStatement.getAsObject().name);
    teamColumnStatement.free();
    const profileColumns = {
      member_type: "TEXT DEFAULT 'teacher'",
      member_status: "TEXT DEFAULT 'current'",
      student_level: "TEXT DEFAULT ''",
      enrollment_year: 'INTEGER',
      graduation_year: 'INTEGER',
      destination: "TEXT DEFAULT ''",
      resume: "TEXT DEFAULT ''",
      recent_updates: "TEXT DEFAULT ''"
    };
    for (const [column, definition] of Object.entries(profileColumns)) {
      if (!teamColumns.has(column)) db.run(`ALTER TABLE team_members ADD COLUMN ${column} ${definition}`);
    }
    db.run("UPDATE team_members SET member_type = 'teacher' WHERE member_type IS NULL OR member_type = ''");
    db.run("UPDATE team_members SET member_status = 'current' WHERE member_status IS NULL OR member_status = ''");
    db.run("UPDATE team_members SET resume = bio WHERE (resume IS NULL OR resume = '') AND bio IS NOT NULL");

    // 旧毕业生资料无损并入学生个人主页；旧表继续保留作归档。
    db.run(`
      INSERT INTO team_members
        (name, title, role, photo_url, email, research_area, bio, sort_order, is_active,
         member_type, member_status, student_level, graduation_year, destination, resume, recent_updates)
      SELECT
        a.name,
        CASE a.degree_level
          WHEN 'undergraduate' THEN '本科毕业生'
          WHEN 'doctor' THEN '博士毕业生'
          ELSE '硕士毕业生'
        END,
        'member', COALESCE(a.photo_url, ''), '', COALESCE(a.major, ''), COALESCE(a.note, ''),
        COALESCE(a.sort_order, 0), a.is_active, 'student', 'alumni', a.degree_level,
        a.graduation_year,
        TRIM(COALESCE(a.destination, '') || CASE WHEN COALESCE(a.position, '') = '' THEN '' ELSE ' · ' || a.position END),
        COALESCE(a.note, ''), ''
      FROM alumni a
      WHERE NOT EXISTS (
        SELECT 1 FROM team_members t WHERE t.name = a.name AND t.member_type = 'student'
      )
    `);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    return db;
  })();

  return dbPromise;
}

// 查询单条记录
async function get(sql, params = []) {
  const database = await getDb();
  return withLock(() => {
    const stmt = database.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  });
}

// 查询多条记录
async function all(sql, params = []) {
  const database = await getDb();
  return withLock(() => {
    const stmt = database.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  });
}

// 执行SQL（插入、更新、删除）
async function run(sql, params = []) {
  const database = await getDb();
  return withLock(() => {
    database.run(sql, params);
    const changes = database.getRowsModified();
    const idStatement = database.prepare('SELECT last_insert_rowid() AS id');
    let lastID = null;
    if (idStatement.step()) lastID = idStatement.getAsObject().id;
    idStatement.free();

    // 每次写入后立即落盘，避免接口已返回成功但数据尚未保存。
    fs.writeFileSync(DB_PATH, Buffer.from(database.export()));
    return { changes, lastID };
  });
}

// 获取最后插入的ID
async function lastInsertRowId() {
  const database = await getDb();
  return withLock(() => {
    const stmt = database.prepare('SELECT last_insert_rowid() as id');
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result ? result.id : null;
  });
}

module.exports = {
  getDb,
  get,
  all,
  run,
  lastInsertRowId
};
