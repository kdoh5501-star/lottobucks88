/**
 * 로또벅스88 - 메인 서버 애플리케이션
 * Node.js + Express + SQLite (sql.js)
 */

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const cors = require('cors');

// 환경변수
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 미들웨어 설정 =====
app.use(helmet({
  contentSecurityPolicy: false, // 개발 중 비활성화
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'lottobucks88-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24시간
    httpOnly: true,
    secure: false // 개발환경
  }
}));

// EJS 템플릿 엔진
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 서빙
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'))); // CSS 서빙

// 전역 변수 (모든 뷰에서 사용)
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isLoggedIn = !!req.session.user;
  res.locals.currentPath = req.path;
  next();
});

// ===== 데이터베이스 초기화 =====
const db = require('./models/database');

// ===== 라우트 =====
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/board');
const lottoRoutes = require('./routes/lotto');
const analysisRoutes = require('./routes/analysis');
const apiRoutes = require('./routes/api');

app.use('/', pageRoutes);
app.use('/auth', authRoutes);
app.use('/board', boardRoutes);
app.use('/lotto', lottoRoutes);
app.use('/analysis', analysisRoutes);
app.use('/api', apiRoutes);

// ===== 에러 핸들링 =====
// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: '페이지를 찾을 수 없습니다',
    message: '요청하신 페이지가 존재하지 않습니다.',
    code: 404
  });
});

// 500
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).render('error', {
    title: '서버 오류',
    message: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    code: 500
  });
});

// ===== 서버 시작 =====
async function startServer() {
  try {
    await db.initialize();
    console.log('✅ 데이터베이스 초기화 완료');

    app.listen(PORT, () => {
      console.log(`🚀 로또벅스88 서버 실행 중: http://localhost:${PORT}`);
      console.log(`📁 환경: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ 서버 시작 실패:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
