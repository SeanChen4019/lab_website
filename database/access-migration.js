// Additive, versioned migrations. Existing administrators keep full access.
module.exports = function migrate(db) {
  const rows = (sql, args=[]) => { const s=db.prepare(sql); try { s.bind(args); const out=[]; while(s.step()) out.push(s.getAsObject()); return out; } finally { s.free(); } };
  const column = (table,name,definition) => { if(!rows(`PRAGMA table_info(${table})`).some(c=>c.name===name)) db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`); };
  db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  if(rows("SELECT name FROM schema_migrations WHERE name='access-v1'").length) return;
  db.run('BEGIN');
  try {
    column('admins','status',"TEXT NOT NULL DEFAULT 'active'");
    column('admins','email',"TEXT NOT NULL DEFAULT ''");
    column('admins','application_note',"TEXT NOT NULL DEFAULT ''");
    column('admins','token_version','INTEGER NOT NULL DEFAULT 0');
    db.run("UPDATE admins SET role='superadmin'");
    for(const table of ['team_members','news','notices','papers','projects','patents','downloads']) column(table,'owner_id','INTEGER');
    db.run(`CREATE TABLE IF NOT EXISTS auth_sessions (jti TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, type TEXT NOT NULL,
      target_id INTEGER, payload TEXT NOT NULL, base_snapshot TEXT, status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1, review_note TEXT NOT NULL DEFAULT '', reviewer_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    db.run('CREATE INDEX IF NOT EXISTS submissions_owner ON submissions(owner_id,status)');
    db.run('CREATE INDEX IF NOT EXISTS sessions_admin ON auth_sessions(admin_id)');
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS admins_username_nocase ON admins(username COLLATE NOCASE)");
    db.run("INSERT INTO schema_migrations(name) VALUES ('access-v1')");
    db.run('COMMIT');
  } catch(e) { db.run('ROLLBACK'); throw e; }
};
