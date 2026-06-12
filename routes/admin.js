/**
 * 관리자 전용 라우트 (주문 관리)
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

// 모든 admin 라우트에 관리자 권한 요구
router.use(requireAdmin);

// 관리자 홈 → 주문 리스트로 리다이렉트
router.get('/', (req, res) => {
  res.redirect('/admin/orders');
});

// 주문 리스트
router.get('/orders', (req, res) => {
  const status = req.query.status || 'all';
  const search = (req.query.search || '').trim();

  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    sql += ' AND (order_number LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ? OR depositor_name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY created_at DESC LIMIT 200';

  const orders = db.query(sql, params);

  // 상태별 카운트
  const counts = {
    all: db.queryOne('SELECT COUNT(*) as cnt FROM orders')?.cnt || 0,
    pending: db.queryOne("SELECT COUNT(*) as cnt FROM orders WHERE status = 'pending'")?.cnt || 0,
    confirmed: db.queryOne("SELECT COUNT(*) as cnt FROM orders WHERE status = 'confirmed'")?.cnt || 0,
    shipped: db.queryOne("SELECT COUNT(*) as cnt FROM orders WHERE status = 'shipped'")?.cnt || 0,
    completed: db.queryOne("SELECT COUNT(*) as cnt FROM orders WHERE status = 'completed'")?.cnt || 0,
    cancelled: db.queryOne("SELECT COUNT(*) as cnt FROM orders WHERE status = 'cancelled'")?.cnt || 0
  };

  res.render('admin/orders', {
    title: '주문 관리 - 로또벅스88 관리자',
    orders,
    counts,
    currentStatus: status,
    search
  });
});

// 주문 상세
router.get('/orders/:id', (req, res) => {
  const order = db.queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) {
    return res.status(404).render('error', {
      title: '주문 없음',
      message: '주문을 찾을 수 없습니다.',
      code: 404
    });
  }
  res.render('admin/order-detail', {
    title: `주문 상세 ${order.order_number} - 관리자`,
    order
  });
});

// 주문 상태 변경
router.post('/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: '잘못된 상태값입니다.' });
    }

    const order = db.queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }

    // 상태별 타임스탬프 업데이트
    let extraSet = '';
    if (status === 'confirmed' && !order.confirmed_at) {
      extraSet = ', confirmed_at = CURRENT_TIMESTAMP';
    } else if (status === 'shipped' && !order.shipped_at) {
      extraSet = ', shipped_at = CURRENT_TIMESTAMP';
    } else if (status === 'cancelled' && !order.cancelled_at) {
      extraSet = ', cancelled_at = CURRENT_TIMESTAMP';
    }

    db.run(`UPDATE orders SET status = ?${extraSet} WHERE id = ?`, [status, req.params.id]);
    res.json({ success: true, message: '상태가 변경되었습니다.', status });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 관리자 메모 업데이트
router.post('/orders/:id/memo', (req, res) => {
  try {
    const { admin_memo } = req.body;
    const order = db.queryOne('SELECT id FROM orders WHERE id = ?', [req.params.id]);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    db.run('UPDATE orders SET admin_memo = ? WHERE id = ?', [admin_memo || null, req.params.id]);
    res.json({ success: true, message: '메모가 저장되었습니다.' });
  } catch (err) {
    console.error('Memo update error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
