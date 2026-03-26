/**
 * 인증 미들웨어
 */

// 로그인 필요
function requireLogin(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// 관리자 권한 필요
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
    }
    return res.status(403).render('error', {
      title: '접근 권한 없음',
      message: '관리자만 접근할 수 있습니다.',
      code: 403
    });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
