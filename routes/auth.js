/**
 * 회원 인증 라우트 (가입, 로그인, 로그아웃, 마이페이지)
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const { requireLogin } = require('../middleware/auth');

// ===== 회원가입 =====
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, passwordConfirm, nickname, phone } = req.body;

    // 유효성 검사
    if (!username || !email || !password || !nickname) {
      return res.status(400).json({ success: false, message: '필수 항목을 모두 입력해주세요.' });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
    }

    // 아이디 중복 확인
    const existingUser = db.queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 아이디입니다.' });
    }

    // 이메일 중복 확인
    const existingEmail = db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
    }

    // 비밀번호 해싱
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 회원 등록
    const result = db.run(
      `INSERT INTO users (username, email, password, nickname, phone) VALUES (?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, nickname, phone || null]
    );

    res.json({ success: true, message: '회원가입이 완료되었습니다!', userId: result.lastId });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 로그인 =====
router.post('/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
    }

    // 사용자 조회
    const user = db.queryOne('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    if (!user) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 비밀번호 확인
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 마지막 로그인 시간 업데이트
    db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    // 세션에 사용자 정보 저장
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      point: user.point,
      level: user.level,
      profile_image: user.profile_image
    };

    // 자동 로그인 (30일)
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    }

    const redirect = req.body.redirect || '/';
    res.json({ success: true, message: '로그인 성공!', redirect, user: req.session.user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 로그아웃 =====
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// ===== 아이디 중복 확인 =====
router.get('/check-username/:username', (req, res) => {
  const user = db.queryOne('SELECT id FROM users WHERE username = ?', [req.params.username]);
  res.json({ available: !user });
});

// ===== 이메일 중복 확인 =====
router.get('/check-email/:email', (req, res) => {
  const user = db.queryOne('SELECT id FROM users WHERE email = ?', [req.params.email]);
  res.json({ available: !user });
});

// ===== 마이페이지 =====
router.get('/mypage', requireLogin, (req, res) => {
  const user = db.queryOne('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  const myPosts = db.query(
    'SELECT * FROM posts WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 10',
    [req.session.user.id]
  );
  const myComments = db.query(
    `SELECT c.*, p.title as post_title FROM comments c
     JOIN posts p ON c.post_id = p.id
     WHERE c.user_id = ? AND c.is_deleted = 0
     ORDER BY c.created_at DESC LIMIT 10`,
    [req.session.user.id]
  );

  res.render('mypage', {
    title: '마이페이지 - 로또벅스88',
    user,
    myPosts,
    myComments
  });
});

// ===== 프로필 수정 =====
router.post('/update-profile', requireLogin, (req, res) => {
  try {
    const { nickname, phone, email } = req.body;
    const userId = req.session.user.id;

    if (!nickname) {
      return res.status(400).json({ success: false, message: '닉네임을 입력해주세요.' });
    }

    db.run('UPDATE users SET nickname = ?, phone = ?, email = ? WHERE id = ?',
      [nickname, phone || null, email, userId]);

    // 세션 업데이트
    req.session.user.nickname = nickname;
    req.session.user.email = email;

    res.json({ success: true, message: '프로필이 수정되었습니다.' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ===== 비밀번호 변경 =====
router.post('/change-password', requireLogin, (req, res) => {
  try {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;
    const userId = req.session.user.id;

    const user = db.queryOne('SELECT password FROM users WHERE id = ?', [userId]);

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ success: false, message: '현재 비밀번호가 올바르지 않습니다.' });
    }

    if (newPassword !== newPasswordConfirm) {
      return res.status(400).json({ success: false, message: '새 비밀번호가 일치하지 않습니다.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
