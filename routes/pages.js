/**
 * 페이지 라우트 (정적 페이지 렌더링)
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 메인 페이지
router.get('/', (req, res) => {
  const latestDraw = db.queryOne('SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT 1');
  const popularPosts = db.query(
    `SELECT p.id, p.title, p.board_type, p.like_count, p.comment_count, u.nickname
     FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.is_deleted = 0 ORDER BY p.like_count DESC LIMIT 5`
  );
  const latestPosts = db.query(
    `SELECT p.id, p.title, p.board_type, p.category, p.comment_count, p.created_at, u.nickname
     FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 10`
  );
  const reviewPosts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.board_type = 'review' AND p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 3`
  );

  res.render('index', {
    title: '로또벅스88 - 대한민국 No.1 로또 분석 플랫폼',
    latestDraw,
    popularPosts,
    latestPosts,
    reviewPosts
  });
});

// 회사소개
router.get('/about', (req, res) => {
  res.render('about', { title: '회사소개 - 로또벅스88' });
});

// 제품 목록
router.get('/products', (req, res) => {
  res.render('products', { title: '제품소개 - 로또벅스88' });
});

// 제품 상세
router.get('/product/:type', (req, res) => {
  const { type } = req.params;
  const validTypes = ['book', 'machine', 'app'];
  if (!validTypes.includes(type)) {
    return res.status(404).render('error', { title: '404', message: '제품을 찾을 수 없습니다.', code: 404 });
  }
  const titles = { book: '로또 1등 패턴의 정석', machine: 'LB-88 Pro 분석기', app: '로또벅스88 앱' };
  res.render(`product-${type}`, { title: `${titles[type]} - 로또벅스88` });
});

// 커뮤니티 메인
router.get('/community', (req, res) => {
  const freePosts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.board_type = 'free' AND p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 5`
  );
  const reviewPosts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.board_type = 'review' AND p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 5`
  );
  const sharePosts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.board_type = 'share' AND p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 5`
  );

  res.render('community', {
    title: '커뮤니티 - 로또벅스88',
    freePosts,
    reviewPosts,
    sharePosts
  });
});

// 라이브 방송
router.get('/live', (req, res) => {
  res.render('live', { title: '라이브 방송 - 로또벅스88' });
});

// 고객센터
router.get('/support', (req, res) => {
  res.render('support', { title: '고객센터 - 로또벅스88' });
});

// 로그인 페이지
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: '로그인 - 로또벅스88', redirect: req.query.redirect || '/' });
});

// 회원가입 페이지
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: '회원가입 - 로또벅스88' });
});

// 이용약관
router.get('/terms', (req, res) => {
  res.render('terms', { title: '이용약관 - 로또벅스88' });
});

module.exports = router;
