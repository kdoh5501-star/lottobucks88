/**
 * 로또벅스88 - SQLite 데이터베이스 (sql.js)
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'lottobucks.db');

let db = null;

async function initialize() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  createTables();
  ensureAdminAccounts();
  migrateVideos();
  seedLatestDraw();
  seedData();
  save();
  setInterval(save, 30000);
  return db;
}

function createTables() {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nickname TEXT NOT NULL, phone TEXT, profile_image TEXT DEFAULT '/public/images/default-avatar.png', role TEXT DEFAULT 'member', point INTEGER DEFAULT 0, level INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME, is_active INTEGER DEFAULT 1)");
  db.run("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, board_type TEXT NOT NULL, category TEXT, title TEXT NOT NULL, content TEXT NOT NULL, user_id INTEGER NOT NULL, view_count INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, comment_count INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, lotto_numbers TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))");
  db.run("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, like_count INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id), FOREIGN KEY (user_id) REFERENCES users(id))");
  db.run("CREATE TABLE IF NOT EXISTS post_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(post_id, user_id))");
  db.run("CREATE TABLE IF NOT EXISTS lotto_results (id INTEGER PRIMARY KEY AUTOINCREMENT, draw_no INTEGER UNIQUE NOT NULL, draw_date TEXT NOT NULL, num1 INTEGER NOT NULL, num2 INTEGER NOT NULL, num3 INTEGER NOT NULL, num4 INTEGER NOT NULL, num5 INTEGER NOT NULL, num6 INTEGER NOT NULL, bonus INTEGER NOT NULL, prize_1st BIGINT, winners_1st INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  db.run("CREATE TABLE IF NOT EXISTS shared_numbers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, numbers TEXT NOT NULL, description TEXT, method TEXT, like_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))");
  db.run("CREATE TABLE IF NOT EXISTS analysis_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, numbers TEXT NOT NULL, method TEXT NOT NULL, filters TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  db.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL, product_type TEXT NOT NULL, product_name TEXT NOT NULL, product_price INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, shipping_fee INTEGER NOT NULL DEFAULT 0, total_amount INTEGER NOT NULL, buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_email TEXT, depositor_name TEXT NOT NULL, postal_code TEXT, address TEXT, address_detail TEXT, memo TEXT, status TEXT NOT NULL DEFAULT 'pending', admin_memo TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, confirmed_at DATETIME, shipped_at DATETIME, cancelled_at DATETIME)");
  db.run("CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, title TEXT NOT NULL, youtube_id TEXT NOT NULL, description TEXT, is_pinned INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  db.run("CREATE TABLE IF NOT EXISTS latest_draw (id INTEGER PRIMARY KEY AUTOINCREMENT, drw_no INTEGER UNIQUE NOT NULL, draw_date TEXT NOT NULL, numbers TEXT NOT NULL, bonus INTEGER NOT NULL, tiers_json TEXT, pattern_matches_json TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
}

function ensureAdminAccounts() {
  const masterExists = db.exec("SELECT id FROM users WHERE username = 'lb88_master'");
  if (masterExists.length === 0 || masterExists[0].values.length === 0) {
    const masterHash = '$2b$10$HMbS9MI6Vo2H3KUvAjr9C.YhVYvexP8v4U05Gp7eLraJ89vWdMCY6';
    db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('lb88_master', 'master@lottobucks88.com', ?, '마스터관리자', 'admin', 99999, 99)", [masterHash]);
  }
  const gohkcExists = db.exec("SELECT id, role FROM users WHERE username = 'gohkc'");
  if (gohkcExists.length === 0 || gohkcExists[0].values.length === 0) {
    const gohkcHash = '$2b$10$1zpULknAxwEco4y8njvyXurlomJyW5xqrCjGlg/8uMzaT26V3XEg6';
    db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('gohkc', 'gohkc@lottobucks88.com', ?, '실장', 'admin', 99999, 99)", [gohkcHash]);
  } else {
    const currentRole = gohkcExists[0].values[0][1];
    if (currentRole !== 'admin') {
      db.run("UPDATE users SET role = 'admin' WHERE username = 'gohkc'");
    }
  }
}

function migrateVideos() {
  try {
    db.run("UPDATE videos SET title = REPLACE(title, 'LB-88 Pro', '로또분석조합기') WHERE title LIKE '%LB-88%'");
    db.run("UPDATE videos SET title = REPLACE(title, 'LB-88', '로또분석조합기') WHERE title LIKE '%LB-88%'");
    db.run("UPDATE videos SET description = REPLACE(description, 'LB-88 Pro', '로또분석조합기') WHERE description LIKE '%LB-88%'");
    db.run("UPDATE videos SET description = REPLACE(description, 'LB-88', '로또분석조합기') WHERE description LIKE '%LB-88%'");
    db.run("UPDATE videos SET title = REPLACE(title, '로또분석조합기 분석기', '로또분석조합기') WHERE title LIKE '%조합기 분석기%'");
    db.run("UPDATE videos SET description = REPLACE(description, '로또분석조합기 분석기', '로또분석조합기') WHERE description LIKE '%조합기 분석기%'");
  } catch (err) {
    console.error('migrateVideos error:', err);
  }
}

function seedLatestDraw() {
  try {
    const exists = db.exec("SELECT id FROM latest_draw WHERE drw_no = 1229");
    if (exists.length === 0 || exists[0].values.length === 0) {
      const tiers = JSON.stringify({
        rank1: { totalPrize: 28158072000, winners: 8, perWinner: 3519759000 },
        rank2: { totalPrize: 4693012008, winners: 89, perWinner: 52730472 },
        rank3: { totalPrize: 4693013325, winners: 2925, perWinner: 1604449 },
        rank4: { totalPrize: 7614500000, winners: 152290, perWinner: 50000 },
        rank5: { totalPrize: 12919170000, winners: 2583834, perWinner: 5000 }
      });
      const matches = JSON.stringify({ rank1: 0, rank2: 0, rank3: 15, rank4: 482, rank5: 5273, total: 5770 });
      db.run(
        "INSERT INTO latest_draw (drw_no, draw_date, numbers, bonus, tiers_json, pattern_matches_json) VALUES (?, ?, ?, ?, ?, ?)",
        [1229, '2026-06-20', '12,13,29,34,37,42', 16, tiers, matches]
      );
    }
  } catch (err) {
    console.error('seedLatestDraw error:', err);
  }
}

function seedData() {
  const userCount = db.exec("SELECT COUNT(*) FROM users")[0].values[0][0];
  if (userCount > 2) return;
  const bcrypt = require('bcryptjs');
  const adminHash = bcrypt.hashSync('admin1234!', 10);
  db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('admin', 'admin@lottobucks88.com', ?, '관리자', 'admin', 99999, 99)", [adminHash]);
}

function save() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const fd = fs.openSync(DB_PATH, 'w');
    fs.writeSync(fd, buffer, 0, buffer.length);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (err) {
    console.error('DB save error:', err);
  }
}

function query(sql, params) {
  params = params || [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params) {
  const results = query(sql, params);
  return results[0] || null;
}

function run(sql, params) {
  params = params || [];
  db.run(sql, params);
  save();
  return { lastId: db.exec("SELECT last_insert_rowid()")[0].values[0][0] };
}

function getDb() {
  return db;
}

module.exports = {
  initialize: initialize,
  query: query,
  queryOne: queryOne,
  run: run,
  save: save,
  getDb: getDb
};
