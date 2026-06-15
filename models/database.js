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
}

function ensureAdminAccounts() {
  const masterExists = db.exec("SELECT id FROM users WHERE username = 'lb88_master'");
  if (masterExists.length === 0 || masterExists[0].values.length === 0) {
    const masterHash = '$2b$10$HMbS9MI6Vo2H3KUvAjr9C.YhVYvexP8v4U05Gp7eLraJ89vWdMCY6';
    db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('lb88_master', 'master@lottobucks88.com', ?, '마스터관리자', 'admin', 99999, 99)", [masterHash]);
    console.log('마스터 관리자 계정 생성 완료 (lb88_master)');
  }
  const gohkcExists = db.exec("SELECT id, role FROM users WHERE username = 'gohkc'");
  if (gohkcExists.length === 0 || gohkcExists[0].values.length === 0) {
    const gohkcHash = '$2b$10$1zpULknAxwEco4y8njvyXurlomJyW5xqrCjGlg/8uMzaT26V3XEg6';
    db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('gohkc', 'gohkc@lottobucks88.com', ?, '실장', 'admin', 99999, 99)", [gohkcHash]);
    console.log('실장 관리자 계정 생성 완료 (gohkc)');
  } else {
    const currentRole = gohkcExists[0].values[0][1];
    if (currentRole !== 'admin') {
      db.run("UPDATE users SET role = 'admin' WHERE username = 'gohkc'");
      console.log('gohkc 계정을 admin 권한으로 승급 완료');
    }
  }
}

function seedData() {
  const userCount = db.exec("SELECT COUNT(*) FROM users")[0].values[0][0];
  if (userCount > 2) return;

  const bcrypt = require('bcryptjs');
  const adminHash = bcrypt.hashSync('admin1234!', 10);
  db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('admin', 'admin@lottobucks88.com', ?, '관리자', 'admin', 99999, 99)", [adminHash]);

  const pdHash = bcrypt.hashSync('pd1234!', 10);
  db.run("INSERT INTO users (username, email, password, nickname, role, point, level) VALUES ('cwlee', 'cwlee@lottobucks88.com', ?, '이철우PD', 'admin', 50000, 50)", [pdHash]);

  const testHash = bcrypt.hashSync('test1234!', 10);
  const testUsers = [
    ['lucky7', 'lucky7@test.com', '럭키세븐', 3200, 15],
    ['lottoqueen', 'queen@test.com', '로또여왕', 8500, 32],
    ['numberking', 'king@test.com', '번호의왕', 5100, 22],
    ['analyzer99', 'anal@test.com', '분석전문가', 12000, 45],
    ['firstprize', 'first@test.com', '1등도전자', 2100, 10],
    ['mathguru', 'math@test.com', '수학천재', 7800, 28],
    ['happylotto', 'happy@test.com', '행복한로또', 1500, 7],
    ['dreamer88', 'dream@test.com', '꿈꾸는자', 4200, 18]
  ];
  testUsers.forEach(function(u) {
    db.run("INSERT INTO users (username, email, password, nickname, point, level) VALUES (?, ?, ?, ?, ?, ?)", [u[0], u[1], testHash, u[2], u[3], u[4]]);
  });

  const lottoResults = [
    [1226, '2026-05-30', 4, 6, 13, 17, 26, 28, 41, 2800000000, 10],
    [1225, '2026-05-23', 3, 11, 17, 28, 35, 42, 7, 2500000000, 12],
    [1224, '2026-05-16', 5, 14, 22, 31, 38, 44, 19, 1850000000, 8]
  ];
  lottoResults.forEach(function(r) {
    db.run("INSERT INTO lotto_results (draw_no, draw_date, num1, num2, num3, num4, num5, num6, bonus, prize_1st, winners_1st) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", r);
  });

  console.log('초기 데이터 시드 완료');
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
