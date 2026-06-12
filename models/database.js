/**
 * 로또벅스88 - SQLite 데이터베이스 (sql.js)
 * 회원, 게시판, 당첨번호, 분석, 주문 테이블 관리
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'lottobucks.db');

let db = null;

/**
 * 데이터베이스 초기화
 */
async function initialize() {
  const SQL = await initSqlJs();

  // 기존 DB 파일이 있으면 로드
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

  // 주기적 저장 (30초마다)
  setInterval(save, 30000);

  return db;
}

/**
 * 테이블 생성
 */
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      phone TEXT,
      profile_image TEXT DEFAULT '/public/images/default-avatar.png',
      role TEXT DEFAULT 'member',
      point INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_type TEXT NOT NULL,
      category TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      lotto_numbers TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      like_count INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS lotto_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_no INTEGER UNIQUE NOT NULL,
      draw_date TEXT NOT NULL,
      num1 INTEGER NOT NULL,
      num2 INTEGER NOT NULL,
      num3 INTEGER NOT NULL,
      num4 INTEGER NOT NULL,
      num5 INTEGER NOT NULL,
      num6 INTEGER NOT NULL,
      bonus INTEGER NOT NULL,
      prize_1st BIGINT,
      winners_1st INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shared_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      numbers TEXT NOT NULL,
      description TEXT,
      method TEXT,
      like_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      numbers TEXT NOT NULL,
      method TEXT NOT NULL,
      filters TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 주문 테이블
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      product_type TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      shipping_fee INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_phone TEXT NOT NULL,
      buyer_email TEXT,
      depositor_name TEXT NOT NULL,
      postal_code TEXT,
      address TEXT,
      address_detail TEXT,
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      shipped_at DATETIME,
      cancelled_at DATETIME
    )
  `);
}

/**
 * 관리자 계정 보장 (재시동 시마다 체크)
 *  - lb88_master: 마스터 관리자
 *  - gohkc: 실장님 계정 (admin 권한)
 */
function ensureAdminAccounts() {
  // lb88_master (비밀번호 'LottoB88!Admin#2026' 해시)
  const masterExists = db.exec("SELECT id FROM users WHERE username = 'lb88_master'");
  if (masterExists.length === 0 || masterExists[0].values.length === 0) {
    const masterHash = '$2b$10$HMbS9MI6Vo2H3KUvAjr9C.YhVYvexP8v4U05Gp7eLraJ89vWdMCY6';
    db.run(`INSERT INTO users (username, email, password, nickname, role, point, level)
            VALUES ('lb88_master', 'master@lottobucks88.com', ?, '마스터관리자', 'admin', 99999, 99)`, [masterHash]);
    console.log('🔑 마스터 관리자 계정 생성 완료 (lb88_master)');
  }

  // gohkc (비밀번호 'kim301730!' 해시)
  const gohkcExists = db.exec("SELECT id, role FROM users WHERE username = 'gohkc'");
  if (gohkcExists.length === 0 || gohkcExists[0].values.length === 0) {
    // 없으면 새로 생성
    const gohkcHash = '$2b$10$1zpULknAxwEco4y8njvyXurlomJyW5xqrCjGlg/8uMzaT26V3XEg6';
    db.run(`INSERT INTO users (username, email, password, nickname, role, point, level)
            VALUES ('gohkc', 'gohkc@lottobucks88.com', ?, '실장', 'admin', 99999, 99)`, [gohkcHash]);
    console.log('🔑 실장 관리자 계정 생성 완료 (gohkc)');
  } else {
    // 이미 있으면 admin 권한으로 업데이트
    const currentRole = gohkcExists[0].values[0][1];
    if (currentRole !== 'admin') {
      db.run("UPDATE users SET role = 'admin' WHERE username = 'gohkc'");
      console.log('🔑 gohkc 계정을 admin 권한으로 승급 완료');
    }
  }
}

/**
 * 초기 데이터 시드
 */
function seedData() {
  // 이미 회원 데이터가 충분히 있는지 확인
  const userCount = db.exec("SELECT COUNT(*) as cnt FROM users")[0]?.values[0][0] || 0;
  if (userCount > 2) return; // 관리자 계정만 있으면 시드 진행

  const bcrypt = require('bcryptjs');

  // 관리자 계정 (기존 호환용)
  const adminHash = bcrypt.hashSync('admin1234!', 10);
  db.run(`INSERT INTO users (username, email, password, nickname, role, point, level)
          VALUES ('admin', 'admin@lottobucks88.com', ?, '관리자', 'admin', 99999, 99)`, [adminHash]);

  // 이철우PD 계정
  const pdHash = bcrypt.hashSync('pd1234!', 10);
  db.run(`INSERT INTO users (username, email, password, nickname, role, point, level)
          VALUES ('cwlee', 'cwlee@lottobucks88.com', ?, '이철우PD', 'admin', 50000, 50)`, [pdHash]);

  // 테스트 회원들
  const testHash = bcrypt.hashSync('test1234!', 10);
  const testUsers = [
    ['lucky7', 'lucky7@test.com', '럭키세븐', 3200, 15],
    ['lottoqueen', 'queen@test.com', '로또여왕', 8500, 32],
    ['numberking', 'king@test.com', '번호의왕', 5100, 22],
    ['analyzer99', 'anal@test.com', '분석전문가', 12000, 45],
    ['firstprize', 'first@test.com', '1등도전자', 2100, 10],
    ['mathguru', 'math@test.com', '수학천재', 7800, 28],
    ['happylotto', 'happy@test.com', '행복한로또', 1500, 7],
    ['dreamer88', 'dream@test.com', '꿈꾸는자', 4200, 18],
  ];

  testUsers.forEach(([username, email, nickname, point, level]) => {
    db.run(`INSERT INTO users (username, email, password, nickname, point, level)
            VALUES (?, ?, ?, ?, ?, ?)`, [username, email, testHash, nickname, point, level]);
  });

  // 샘플 게시글
  const samplePosts = [
    ['free', '잡담', '오늘 로또 사러 갑니다!', '매주 토요일이 가장 설레는 날이에요. 이번 주는 꼭 될 것 같은 느낌!', 3, 45, 12, 3],
    ['free', '정보', '로또 당첨금 세금 정리', '로또 당첨금 세금에 대해 정리해봤습니다.', 4, 230, 45, 15],
    ['free', '질문', '로또벅스88 기계 사용법 질문', '기계 구매했는데 초기 설정을 어떻게 하나요?', 5, 67, 8, 4],
    ['free', '후기', '로또벅스88 책 후기', '이 책 읽고 번호 선택하는 관점이 완전히 바뀌었어요. 강추합니다!', 6, 189, 34, 8],
    ['free', '유머', '로또 1등 되면 하고 싶은 일 TOP 10', '1. 퇴사\n2. 세계여행\n3. 부모님 집 사드리기\n4. 기부\n5. 건물주', 7, 520, 89, 22],
    ['free', '정보', '이번 주 고액 당첨 판매점 위치', '수도권 고액 당첨이 나온 판매점 위치를 정리해봤습니다.', 8, 156, 28, 6],
    ['free', '잡담', '연속번호 나올 확률?', '연속번호가 포함된 조합이 실제로 얼마나 당첨되는지 궁금합니다', 9, 92, 15, 5],
    ['review', '4등', '4등 당첨! 기계 번호 그대로 적중!', '로또벅스88 기계에서 추천받은 번호 그대로 넣었더니 4등 당첨됐습니다!! 5만원이지만 너무 기뻐요!', 3, 340, 67, 18],
    ['review', '5등', '5등 3번 연속 당첨 후기', '로또벅스88 분석 서비스 쓴 지 한 달째인데 5등이 3번이나 나왔어요!', 5, 210, 42, 11],
    ['review', '3등', '3등 당첨!! 150만원!!', '믿기 어렵겠지만 이철우PD 라이브에서 받은 번호로 3등 당첨됐습니다!!!', 6, 890, 156, 45],
    ['review', '4등', '첫 당첨 후기입니다', '로또를 10년 넘게 했는데 처음으로 4등에 당첨됐어요. 로또벅스88 덕분입니다.', 8, 178, 31, 9],
    ['share', null, '이번 주 추천번호 5게임', '패턴 분석 기반 추천번호입니다.', 4, 445, 78, 25],
    ['share', null, '연속번호 포함 3게임', '최근 연속번호 출현 빈도가 높아서 포함시켰습니다.', 6, 267, 45, 12],
    ['share', null, '고정수 3개 기반 추천', '7, 21, 33을 고정수로 놓고 나머지를 분석했습니다.', 9, 189, 32, 8],
  ];

  samplePosts.forEach(([board_type, category, title, content, user_id, views, likes, comments]) => {
    db.run(`INSERT INTO posts (board_type, category, title, content, user_id, view_count, like_count, comment_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [board_type, category, title, content, user_id, views, likes, comments]);
  });

  // 공지사항
  db.run(`INSERT INTO posts (board_type, category, title, content, user_id, view_count, is_pinned)
          VALUES ('free', '공지', '[공지] 로또벅스88 커뮤니티 이용규칙', '1. 서로 존중하는 커뮤니케이션\n2. 욕설/비방 금지\n3. 광고성 게시글 금지\n4. 허위 당첨 후기 금지', 1, 1520, 1)`);

  // 최근 로또 당첨번호
  const lottoResults = [
    [1226, '2026-05-30', 4, 6, 13, 17, 26, 28, 41, 2800000000, 10],
    [1225, '2026-05-23', 3, 11, 17, 28, 35, 42, 7, 2500000000, 12],
    [1224, '2026-05-16', 5, 14, 22, 31, 38, 44, 19, 1850000000, 8],
  ];

  lottoResults.forEach(([draw_no, draw_date, n1, n2, n3, n4, n5, n6, bonus, prize, winners]) => {
    db.run(`INSERT INTO lotto_results (draw_no, draw_da  console.log('📊 초기 데이터 시드 완료');
}

/**
 * DB를 파일에 저장 + fsync로 디스크 강제 동기화
 * Render Persistent Disk는 네트워크 attached 스토리지이므로
 * fsync를 명시적으로 호출해야 데이터가 영구 저장됨
 */
function save() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const fd = fs.openSync(DB_PATH, 'w');
    fs.writeSync(fd, buffer, 0, buffer.length);
    fs.fsyncSync(fd);   // 디스크 강제 동기화 - 컨테이너 재시작에도 안전!
    fs.closeSync(fd);
  } catch (err) {
    console.error('DB save error:', err);
  }
}

/**
 * 쿼리 실행 헬퍼
 */
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  return { lastId: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
}

function getDb() {
  return db;
}

module.exports = {
  initialize,
  query,
  queryOne,
  run,
  save,
  getDb
};
