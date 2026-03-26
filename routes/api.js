/**
 * REST API 라우트 (AJAX 요청 처리)
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireLogin } = require('../middleware/auth');

// ===== 사용자 정보 =====
router.get('/user/info', (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false, loggedIn: false });
  }
  res.json({ success: true, loggedIn: true, user: req.session.user });
});

// ===== 인기글 TOP =====
router.get('/posts/popular', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const boardType = req.query.board || '';

  let sql = `SELECT p.id, p.title, p.like_count, p.view_count, p.board_type, u.nickname
             FROM posts p JOIN users u ON p.user_id = u.id
             WHERE p.is_deleted = 0`;
  const params = [];

  if (boardType) {
    sql += ' AND p.board_type = ?';
    params.push(boardType);
  }

  sql += ' ORDER BY p.like_count DESC LIMIT ?';
  params.push(limit);

  const posts = db.query(sql, params);
  res.json({ success: true, data: posts });
});

// ===== 최신글 =====
router.get('/posts/latest', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);
  const boardType = req.query.board || '';

  let sql = `SELECT p.id, p.title, p.board_type, p.category, p.comment_count, p.created_at, u.nickname
             FROM posts p JOIN users u ON p.user_id = u.id
             WHERE p.is_deleted = 0`;
  const params = [];

  if (boardType) {
    sql += ' AND p.board_type = ?';
    params.push(boardType);
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  params.push(limit);

  const posts = db.query(sql, params);
  res.json({ success: true, data: posts });
});

// ===== 검색 =====
router.get('/search', (req, res) => {
  const { q, board, page } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ success: false, message: '검색어를 2자 이상 입력해주세요.' });
  }

  const pageNum = parseInt(page) || 1;
  const limit = 15;
  const offset = (pageNum - 1) * limit;
  const searchTerm = `%${q.trim()}%`;

  let whereClause = 'WHERE p.is_deleted = 0 AND (p.title LIKE ? OR p.content LIKE ?)';
  let params = [searchTerm, searchTerm];

  if (board) {
    whereClause += ' AND p.board_type = ?';
    params.push(board);
  }

  const countResult = db.queryOne(
    `SELECT COUNT(*) as total FROM posts p ${whereClause}`, params
  );

  const posts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: posts,
    total: countResult?.total || 0,
    page: pageNum,
    totalPages: Math.ceil((countResult?.total || 0) / limit)
  });
});

// ===== 공유 번호 저장 =====
router.post('/share-numbers', requireLogin, (req, res) => {
  try {
    const { numbers, description, method } = req.body;
    const userId = req.session.user.id;

    if (!numbers || !Array.isArray(numbers) || numbers.length !== 6) {
      return res.status(400).json({ success: false, message: '6개의 번호를 선택해주세요.' });
    }

    db.run(
      'INSERT INTO shared_numbers (user_id, numbers, description, method) VALUES (?, ?, ?, ?)',
      [userId, JSON.stringify(numbers), description || '', method || 'manual']
    );

    db.run('UPDATE users SET point = point + 15 WHERE id = ?', [userId]);

    res.json({ success: true, message: '번호가 공유되었습니다. +15P 적립!' });
  } catch (err) {
    console.error('Share numbers error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 대시보드 통계 =====
router.get('/dashboard/stats', (req, res) => {
  const totalUsers = db.queryOne('SELECT COUNT(*) as cnt FROM users')?.cnt || 0;
  const totalPosts = db.queryOne('SELECT COUNT(*) as cnt FROM posts WHERE is_deleted = 0')?.cnt || 0;
  const todayPosts = db.queryOne("SELECT COUNT(*) as cnt FROM posts WHERE date(created_at) = date('now') AND is_deleted = 0")?.cnt || 0;
  const latestDraw = db.queryOne('SELECT draw_no FROM lotto_results ORDER BY draw_no DESC LIMIT 1');

  res.json({
    success: true,
    data: {
      totalUsers,
      totalPosts,
      todayPosts,
      latestDraw: latestDraw?.draw_no || 0
    }
  });
});

module.exports = router;
