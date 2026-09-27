const initSQL = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.LAB_DB_PATH || path.join(__dirname, 'lab.db');
function persist(database) {
  const temp = DB_PATH + '.' + process.pid + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, Buffer.from(database.export())); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, DB_PATH);
}

let lockOwned=false;
const LOCK_PATH=DB_PATH+'.lock';
function releaseFileLock(){
 if(!lockOwned)return;
 try{if(JSON.parse(fs.readFileSync(LOCK_PATH,'utf8')).pid===process.pid)fs.unlinkSync(LOCK_PATH);}catch(_){}
 lockOwned=false;
}
function acquireFileLock(){
 if(lockOwned)return;
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=fs.openSync(LOCK_PATH,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);lockOwned=true;process.once('exit',releaseFileLock);return;}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   let owner;try{owner=JSON.parse(fs.readFileSync(LOCK_PATH,'utf8'));}catch(_){throw Error('数据库锁文件异常，请确认服务已停止后检查 '+LOCK_PATH);}
   if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('数据库锁无效');
   let alive=true;try{process.kill(owner.pid,0);}catch(err){if(err.code==='ESRCH')alive=false;}
   if(alive)throw Error('数据库已被另一个进程使用，请先停止旧服务');
   fs.unlinkSync(LOCK_PATH);
  }
 }
 throw Error('无法获取数据库锁');
}
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

    acquireFileLock();
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

    // 论文详情字段：以增量迁移方式加入，绝不覆盖现有论文数据。
    // 详情页 /paper/:id 依赖这些字段（摘要、图文正文、论文与代码链接）。
    const paperColumns = new Set();
    const paperColumnStatement = db.prepare('PRAGMA table_info(papers)');
    while (paperColumnStatement.step()) paperColumns.add(paperColumnStatement.getAsObject().name);
    paperColumnStatement.free();
    const paperProfileColumns = {
      abstract: "TEXT DEFAULT ''",
      content: "TEXT DEFAULT ''",
      cover_image: "TEXT DEFAULT ''",
      pdf_url: "TEXT DEFAULT ''",
      code_url: "TEXT DEFAULT ''",
      doi: "TEXT DEFAULT ''",
      direction: "TEXT DEFAULT ''"
    };
    for (const [column, definition] of Object.entries(paperProfileColumns)) {
      if (!paperColumns.has(column)) db.run(`ALTER TABLE papers ADD COLUMN ${column} ${definition}`);
    }

    // 专利与项目的详情字段：同样用增量迁移，绝不覆盖现有数据。
    // 详情页 /patent/:id、/project/:id 依赖这些字段。
    function ensureColumns(table, columns) {
      const existing = new Set();
      const statement = db.prepare(`PRAGMA table_info(${table})`);
      while (statement.step()) existing.add(statement.getAsObject().name);
      statement.free();
      for (const [column, definition] of Object.entries(columns)) {
        if (!existing.has(column)) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }

    ensureColumns('patents', {
      abstract: "TEXT DEFAULT ''",
      content: "TEXT DEFAULT ''",
      cover_image: "TEXT DEFAULT ''"
    });

    ensureColumns('projects', {
      content: "TEXT DEFAULT ''",
      cover_image: "TEXT DEFAULT ''"
    });

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
      recent_updates: "TEXT DEFAULT ''",
      // 行政职务（如「实验室主任」「实验室副主任」）。
      // 原来前台是靠排序推断谁当主任的（sort_order 最小的那个），后台无法指定；
      // 现在改成可填字段，前台优先显示它，没填才回落到默认称谓。
      leader_title: "TEXT DEFAULT ''"
    };
    for (const [column, definition] of Object.entries(profileColumns)) {
      if (!teamColumns.has(column)) db.run(`ALTER TABLE team_members ADD COLUMN ${column} ${definition}`);
    }
    db.run("UPDATE team_members SET member_type = 'teacher' WHERE member_type IS NULL OR member_type = ''");
    db.run("UPDATE team_members SET member_status = 'current' WHERE member_status IS NULL OR member_status = ''");
    db.run("UPDATE team_members SET resume = bio WHERE (resume IS NULL OR resume = '') AND bio IS NOT NULL");

    // Import legacy alumni once; deleting a profile must survive restarts.
    db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    const imported = db.exec("SELECT name FROM schema_migrations WHERE name='legacy-alumni-v1'").length;
    if (!imported) {
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
    db.run("INSERT INTO schema_migrations(name) VALUES ('legacy-alumni-v1')");
    }
    require('./access-migration')(db);
    persist(db);

    return db;
  })().catch(error=>{
    if(db){try{db.close();}catch(_){} db=null;}
    releaseFileLock();dbPromise=null;throw error;
  });

  return dbPromise;
}

// Query helpers share statement cleanup and execute against the current database.
async function query(sql, params, single) {
  await getDb();
  return withLock(() => {
    const statement = db.prepare(sql);
    try {
      statement.bind(params);
      if (single) return statement.step() ? statement.getAsObject() : null;
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  });
}
function get(sql, params = []) { return query(sql, params, true); }
function all(sql, params = []) { return query(sql, params, false); }

// 执行SQL（插入、更新、删除）
async function run(sql, params = []) {
  return transaction(tx=>{require('../services/write-conflict').guard(tx,sql);return tx.run(sql,params);});
}

// 获取最后插入的ID
async function lastInsertRowId() {
  await getDb();
  return withLock(() => {
    const database = db;
    const stmt = database.prepare('SELECT last_insert_rowid() as id');
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result ? result.id : null;
  });
}

// Synchronous work inside one queued transaction: no intermediate publication state.
async function transaction(work) {
  await getDb();
  return withLock(() => {
    const before = db.export();
    const query = (sql, params=[]) => {
      const s=db.prepare(sql); try { s.bind(params); const out=[]; while(s.step()) out.push(s.getAsObject()); return out; } finally { s.free(); }
    };
    const tx={ get:(sql,p)=>query(sql,p)[0] || null, all:query, run:(sql,p=[])=>{ db.run(sql,p); return {changes:db.getRowsModified(),lastID:query('SELECT last_insert_rowid() AS id')[0].id}; } };
    db.run('BEGIN');
    try { const result=work(tx); if(result && typeof result.then==='function') throw Error('Transaction callback must be synchronous'); db.run('COMMIT'); persist(db); return result; }
    catch(error) { try { db.run('ROLLBACK'); } catch(_) {} const Database=db.constructor; db.close(); db=new Database(before); throw error; }
  });
}
module.exports = {
  transaction,
  getDb,
  get,
  all,
  run,
  lastInsertRowId
};
