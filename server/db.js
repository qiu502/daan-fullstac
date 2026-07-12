'use strict';
/**
 * 答岸 · 数据库模块
 *
 * 驱动说明：优先 better-sqlite3；因当前环境无 C++ 工具链、原生编译失败，
 * 已按既定回退方案改用 Node 22 内置 node:sqlite（DatabaseSync，同步 API）。
 * 启动需带 --experimental-sqlite（见 package.json 的 start/seed/dev 脚本）。
 *
 * 对外暴露的接口与 better-sqlite3 保持一致：
 *   db.prepare(sql) → Statement{ run() , get() , all() }
 *   db.exec(sql)    → 执行多条（DDL）
 * 其中 run() 返回 { lastInsertRowid, changes }（与 better-sqlite3 同形）。
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'daan.db');

// 确保数据库所在目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nick       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  pwd_hash   TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS papers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  year        INTEGER,
  type        TEXT,
  volume      TEXT,
  rate        REAL    DEFAULT 0,
  downloads   INTEGER DEFAULT 0,
  questions   TEXT    NOT NULL,
  uploader_id INTEGER,
  source      TEXT    DEFAULT 'official',
  status      TEXT    DEFAULT 'approved',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  paper_id   INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, paper_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
CREATE INDEX IF NOT EXISTS idx_papers_subject ON papers(subject);
CREATE INDEX IF NOT EXISTS idx_papers_uploader ON papers(uploader_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
`;

db.exec(DDL);

/* ---------- 注册验证码增量（T1） ----------
 * 1) 给 users 表加可空 phone 列（幂等探测，避免重复 ALTER 报错）
 * 2) 新建 verification_codes 表（验证码存储）
 * 3) 两个部分唯一索引：
 *    - idx_vc_active：每个 (contact, purpose) 同时仅一条未用码（天然实现"重发即令旧码失效"）
 *    - idx_users_phone：仅对非空 phone 约束唯一
 */
const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!cols.includes('phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT;');
}

db.exec(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact    TEXT    NOT NULL,
  channel    TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  purpose    TEXT    NOT NULL DEFAULT 'register',
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_active
  ON verification_codes(contact, purpose) WHERE used = 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone
  ON users(phone) WHERE phone IS NOT NULL;
`);

/** 统一错误响应体工具 */
function err(code, message, status) {
  const e = new Error(message || code);
  e.code = code;
  e.status = status || 400;
  return e;
}

module.exports = { db, err, DB_PATH };
