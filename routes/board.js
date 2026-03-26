/**
 * 게시판/커뮤니티 라우트 (CRUD, 댓글, 좋아요)
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireLogin } = require('../middleware/auth');

// ===== 게시판 목록 =====
router.get('/:boardType', (req, res) => {
  const { boardType } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (page - 1) * limit;
  const category = req.query.category || '';
  const search = req.query.search || '';
  const sort = req.query.sort || 'latest';

  // 유효한 게시판 타입 확인
  const validBoards = ['free', 'review', 'share'];
  if (!validBoards.includes(boardType)) {
    return res.status(404).render('error', { title: '404', message: '존재하지 않는 게시판입니다.', code: 404 });
  }

  let whereClause = 'WHERE p.board_type = ? AND p.is_deleted = 0';
  let params = [boardType];

  if (category) {
    whereClause += ' AND p.category = ?';
    params.push(category);
  }
  if (search) {
    whereClause += ' AND (p.title LIKE ? OR p.content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // 정렬
  let orderClause = 'ORDER BY p.is_pinned DESC, ';
  switch (sort) {
    case 'popular': orderClause += 'p.like_count DESC, p.created_at DESC'; break;
    case 'views': orderClause += 'p.view_count DESC, p.created_at DESC'; break;
    case 'comments': orderClause += 'p.comment_count DESC, p.created_at DESC'; break;
    default: orderClause += 'p.created_at DESC';
  }

  // 전체 게시글 수
  const countResult = db.queryOne(
    `SELECT COUNT(*) as total FROM posts p ${whereClause}`, params
  );
  const total = countResult?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // 게시글 목록
  const posts = db.query(
    `SELECT p.*, u.nickname, u.level, u.profile_image
     FROM posts p JOIN users u ON p.user_id = u.id
     ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 인기글 TOP5
  const popularPosts = db.query(
    `SELECT p.*, u.nickname FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.board_type = ? AND p.is_deleted = 0
     ORDER BY p.like_count DESC LIMIT 5`,
    [boardType]
  );

  const boardNames = { free: '자유게시판', review: '당첨후기', share: '번호공유' };
  const templateMap = { free: 'board-free', review: 'board-review', share: 'board-share' };

  res.render(templateMap[boardType] || 'board-list', {
    title: `${boardNames[boardType]} - 로또벅스88`,
    boardType,
    boardName: boardNames[boardType],
    posts,
    popularPosts,
    page,
    totalPages,
    total,
    category,
    search,
    sort
  });
});

// ===== 글쓰기 페이지 =====
router.get('/:boardType/write', requireLogin, (req, res) => {
  const { boardType } = req.params;
  const boardNames = { free: '자유게시판', review: '당첨후기', share: '번호공유' };

  res.render('board-write', {
    title: `글쓰기 - ${boardNames[boardType]} - 로또벅스88`,
    boardType,
    boardName: boardNames[boardType],
    post: null // 새 글
  });
});

// ===== 글쓰기 처리 =====
router.post('/:boardType/write', requireLogin, (req, res) => {
  try {
    const { boardType } = req.params;
    const { title, content, category, lotto_numbers } = req.body;
    const userId = req.session.user.id;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
    }

    const result = db.run(
      `INSERT INTO posts (board_type, category, title, content, user_id, lotto_numbers)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [boardType, category || null, title, content, userId, lotto_numbers || null]
    );

    // 포인트 적립
    db.run('UPDATE users SET point = point + 10 WHERE id = ?', [userId]);
    if (req.session.user) req.session.user.point += 10;

    res.json({ success: true, message: '게시글이 등록되었습니다.', postId: result.lastId });
  } catch (err) {
    console.error('Write post error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 게시글 상세 =====
router.get('/:boardType/:id', (req, res) => {
  const { boardType, id } = req.params;

  const post = db.queryOne(
    `SELECT p.*, u.nickname, u.level, u.profile_image, u.point as user_point
     FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.id = ? AND p.is_deleted = 0`,
    [id]
  );

  if (!post) {
    return res.status(404).render('error', { title: '404', message: '게시글을 찾을 수 없습니다.', code: 404 });
  }

  // 조회수 증가
  db.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [id]);
  post.view_count++;

  // 댓글 목록
  const comments = db.query(
    `SELECT c.*, u.nickname, u.level, u.profile_image
     FROM comments c JOIN users u ON c.user_id = u.id
     WHERE c.post_id = ? AND c.is_deleted = 0
     ORDER BY c.created_at ASC`,
    [id]
  );

  // 좋아요 여부 확인
  let isLiked = false;
  if (req.session.user) {
    const like = db.queryOne(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [id, req.session.user.id]
    );
    isLiked = !!like;
  }

  // 이전/다음 글
  const prevPost = db.queryOne(
    'SELECT id, title FROM posts WHERE board_type = ? AND id < ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1',
    [boardType, id]
  );
  const nextPost = db.queryOne(
    'SELECT id, title FROM posts WHERE board_type = ? AND id > ? AND is_deleted = 0 ORDER BY id ASC LIMIT 1',
    [boardType, id]
  );

  // 작성자 다른 글
  const authorPosts = db.query(
    'SELECT id, title, created_at FROM posts WHERE user_id = ? AND id != ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 5',
    [post.user_id, id]
  );

  const boardNames = { free: '자유게시판', review: '당첨후기', share: '번호공유' };

  res.render('board-view', {
    title: `${post.title} - ${boardNames[boardType]} - 로또벅스88`,
    boardType,
    boardName: boardNames[boardType],
    post,
    comments,
    isLiked,
    prevPost,
    nextPost,
    authorPosts
  });
});

// ===== 글 수정 =====
router.post('/:boardType/:id/edit', requireLogin, (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;
    const userId = req.session.user.id;

    const post = db.queryOne('SELECT user_id FROM posts WHERE id = ?', [id]);
    if (!post || (post.user_id !== userId && req.session.user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: '수정 권한이 없습니다.' });
    }

    db.run('UPDATE posts SET title = ?, content = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, content, category || null, id]);

    res.json({ success: true, message: '게시글이 수정되었습니다.' });
  } catch (err) {
    console.error('Edit post error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 글 삭제 =====
router.post('/:boardType/:id/delete', requireLogin, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const post = db.queryOne('SELECT user_id FROM posts WHERE id = ?', [id]);
    if (!post || (post.user_id !== userId && req.session.user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    db.run('UPDATE posts SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ success: true, message: '게시글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 좋아요 토글 =====
router.post('/:boardType/:id/like', requireLogin, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const existing = db.queryOne(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [id, userId]
    );

    if (existing) {
      db.run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [id, userId]);
      db.run('UPDATE posts SET like_count = like_count - 1 WHERE id = ?', [id]);
      res.json({ success: true, liked: false });
    } else {
      db.run('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [id, userId]);
      db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [id]);
      res.json({ success: true, liked: true });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 댓글 작성 =====
router.post('/:boardType/:id/comment', requireLogin, (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.session.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: '댓글 내용을 입력해주세요.' });
    }

    const result = db.run(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [id, userId, content.trim()]
    );

    // 댓글 수 업데이트
    db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [id]);

    // 포인트 적립
    db.run('UPDATE users SET point = point + 5 WHERE id = ?', [userId]);

    const comment = db.queryOne(
      `SELECT c.*, u.nickname, u.level, u.profile_image
       FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
      [result.lastId]
    );

    res.json({ success: true, comment });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 댓글 삭제 =====
router.post('/comment/:commentId/delete', requireLogin, (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.session.user.id;

    const comment = db.queryOne('SELECT * FROM comments WHERE id = ?', [commentId]);
    if (!comment || (comment.user_id !== userId && req.session.user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    db.run('UPDATE comments SET is_deleted = 1 WHERE id = ?', [commentId]);
    db.run('UPDATE posts SET comment_count = comment_count - 1 WHERE id = ?', [comment.post_id]);

    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
