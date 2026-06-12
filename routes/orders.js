/**
 * 주문 라우트 (구매 흐름)
 *  - GET  /order/start/:type      : 주문 폼 페이지
 *  - POST /order                  : 주문 생성
 *  - GET  /order/complete/:no     : 입금 안내 페이지
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 상품 정의
const PRODUCTS = {
  book: {
    type: 'book',
    name: '로또 1등 패턴의 정석',
    price: 20000,
    shipping_fee: 0,
    description: '20여년간의 데이터 분석 노하우를 집대성한 로또 분석 가이드북',
    image: '/images/book-cover.png',
    shippable: true
  },
  machine: {
    type: 'machine',
    name: '로또분석조합기',
    price: 50000,
    shipping_fee: 0,
    description: '20년 통계 분석 기반 로또 번호 분석 디바이스',
    image: '/images/machine-lb88.jpg',
    shippable: true
  },
  app: {
    type: 'app',
    name: '로또벅스88 앱 (연 구독)',
    price: 50000,
    shipping_fee: 0,
    description: '언제 어디서나 스마트한 번호 분석을 손안에서',
    image: '/images/app-mockup-v4.png',
    shippable: false
  }
};

// 주문번호 생성 (예: ORD20260612-12345)
function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(10000 + Math.random() * 89999);
  return `ORD${y}${m}${d}-${rand}`;
}

// 주문 시작 페이지 (폼)
router.get('/start/:type', (req, res) => {
  const product = PRODUCTS[req.params.type];
  if (!product) {
    return res.status(404).render('error', {
      title: '상품 없음',
      message: '존재하지 않는 상품입니다.',
      code: 404
    });
  }
  res.render('order-start', {
    title: `주문하기 - ${product.name} - 로또벅스88`,
    product,
    user: req.session.user || null
  });
});

// 주문 생성
router.post('/', (req, res) => {
  try {
    const {
      product_type, quantity, buyer_name, buyer_phone, buyer_email,
      depositor_name, postal_code, address, address_detail, memo
    } = req.body;

    const product = PRODUCTS[product_type];
    if (!product) {
      return res.status(400).json({ success: false, message: '잘못된 상품입니다.' });
    }

    const qty = Math.max(1, Math.min(10, parseInt(quantity) || 1));

    if (!buyer_name || !buyer_phone || !depositor_name) {
      return res.status(400).json({ success: false, message: '필수 정보를 모두 입력해주세요.' });
    }

    if (product.shippable && !address) {
      return res.status(400).json({ success: false, message: '배송지 주소를 입력해주세요.' });
    }

    const subtotal = product.price * qty;
    const shipping_fee = product.shipping_fee;
    const total_amount = subtotal + shipping_fee;
    const order_number = generateOrderNumber();

    db.run(
      `INSERT INTO orders (
        order_number, product_type, product_name, product_price, quantity,
        shipping_fee, total_amount,
        buyer_name, buyer_phone, buyer_email, depositor_name,
        postal_code, address, address_detail, memo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        order_number, product.type, product.name, product.price, qty,
        shipping_fee, total_amount,
        buyer_name.trim(), buyer_phone.trim(), (buyer_email || '').trim(), depositor_name.trim(),
        (postal_code || '').trim(), (address || '').trim(), (address_detail || '').trim(), (memo || '').trim()
      ]
    );

    res.json({
      success: true,
      message: '주문이 접수되었습니다.',
      redirect: `/order/complete/${order_number}`,
      order_number
    });
  } catch (err) {
    console.error('Order create error:', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 주문 완료 (입금 안내) 페이지
router.get('/complete/:order_number', (req, res) => {
  const order = db.queryOne('SELECT * FROM orders WHERE order_number = ?', [req.params.order_number]);
  if (!order) {
    return res.status(404).render('error', {
      title: '주문 없음',
      message: '주문을 찾을 수 없습니다.',
      code: 404
    });
  }
  // 계좌 정보
  const bank = {
    name: 'IBK기업은행',
    account: '112-244266-04-015',
    holder: '주식회사 벅스미디어'
  };
  res.render('order-complete', {
    title: `주문 완료 ${order.order_number} - 로또벅스88`,
    order,
    bank
  });
});

module.exports = router;
