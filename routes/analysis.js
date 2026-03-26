/**
 * 번호 분석/생성 엔진 라우트
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');

// ===== 분석 페이지 =====
router.get('/', (req, res) => {
  const results = db.query('SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT 20');
  const frequency = calculateFullFrequency();

  res.render('analysis', {
    title: '번호 분석 - 로또벅스88',
    results,
    frequency
  });
});

// ===== 번호 생성 API =====
router.post('/generate', (req, res) => {
  try {
    const { method, filters, count } = req.body;
    const gameCount = Math.min(parseInt(count) || 5, 10);
    const games = [];

    for (let i = 0; i < gameCount; i++) {
      let numbers;
      switch (method) {
        case 'frequency':
          numbers = generateByFrequency(filters);
          break;
        case 'pattern':
          numbers = generateByPattern(filters);
          break;
        case 'random':
          numbers = generateRandom(filters);
          break;
        case 'smart':
          numbers = generateSmart(filters);
          break;
        default:
          numbers = generateSmart(filters);
      }
      games.push(numbers);
    }

    // 분석 이력 저장
    if (req.session.user) {
      db.run(
        'INSERT INTO analysis_history (user_id, numbers, method, filters) VALUES (?, ?, ?, ?)',
        [req.session.user.id, JSON.stringify(games), method, JSON.stringify(filters)]
      );
    }

    res.json({ success: true, games, method });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ success: false, message: '번호 생성에 실패했습니다.' });
  }
});

// ===== 번호 검증 API =====
router.post('/verify', (req, res) => {
  try {
    const { numbers, drawNo } = req.body;

    if (!numbers || numbers.length !== 6) {
      return res.status(400).json({ success: false, message: '6개의 번호를 입력해주세요.' });
    }

    const result = db.queryOne('SELECT * FROM lotto_results WHERE draw_no = ?', [drawNo]);
    if (!result) {
      return res.status(404).json({ success: false, message: '해당 회차 정보가 없습니다.' });
    }

    const winningNumbers = [result.num1, result.num2, result.num3, result.num4, result.num5, result.num6];
    const bonus = result.bonus;
    const userNumbers = numbers.map(Number);

    const matched = userNumbers.filter(n => winningNumbers.includes(n));
    const bonusMatched = userNumbers.includes(bonus);

    let rank = '낙첨';
    if (matched.length === 6) rank = '1등';
    else if (matched.length === 5 && bonusMatched) rank = '2등';
    else if (matched.length === 5) rank = '3등';
    else if (matched.length === 4) rank = '4등';
    else if (matched.length === 3) rank = '5등';

    res.json({
      success: true,
      result: {
        rank,
        matched: matched.length,
        matchedNumbers: matched,
        bonusMatched,
        drawNo,
        winningNumbers,
        bonus
      }
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: '번호 검증에 실패했습니다.' });
  }
});

// ===== 분석 이력 =====
router.get('/history', (req, res) => {
  if (!req.session.user) {
    return res.json({ success: true, data: [] });
  }

  const history = db.query(
    'SELECT * FROM analysis_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [req.session.user.id]
  );

  res.json({ success: true, data: history });
});

// ===== 생성 알고리즘 =====

/**
 * 출현 빈도 기반 생성
 */
function generateByFrequency(filters = {}) {
  const freq = calculateFullFrequency();
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  // 상위 출현 번호 중 랜덤 선택
  const hotPool = sorted.slice(0, 20).map(([n]) => parseInt(n));
  const coldPool = sorted.slice(-15).map(([n]) => parseInt(n));

  // 핫넘버 4개 + 콜드넘버 2개 조합
  const numbers = new Set();
  while (numbers.size < 4) {
    numbers.add(hotPool[Math.floor(Math.random() * hotPool.length)]);
  }
  while (numbers.size < 6) {
    const cold = coldPool[Math.floor(Math.random() * coldPool.length)];
    if (!numbers.has(cold)) numbers.add(cold);
  }

  return applyFilters([...numbers].sort((a, b) => a - b), filters);
}

/**
 * 패턴 분석 기반 생성
 */
function generateByPattern(filters = {}) {
  const results = db.query('SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT 10');

  // 최근 패턴 분석
  const recentNumbers = new Set();
  results.forEach(r => {
    [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].forEach(n => recentNumbers.add(n));
  });

  // 최근 출현 번호와 미출현 번호 조합
  const appeared = [...recentNumbers];
  const notAppeared = [];
  for (let i = 1; i <= 45; i++) {
    if (!recentNumbers.has(i)) notAppeared.push(i);
  }

  const numbers = new Set();
  // 출현 번호 3~4개
  const fromAppeared = 3 + Math.floor(Math.random() * 2);
  while (numbers.size < fromAppeared) {
    numbers.add(appeared[Math.floor(Math.random() * appeared.length)]);
  }
  // 미출현 번호로 나머지 채우기
  while (numbers.size < 6) {
    const n = notAppeared[Math.floor(Math.random() * notAppeared.length)];
    if (!numbers.has(n)) numbers.add(n);
  }

  return applyFilters([...numbers].sort((a, b) => a - b), filters);
}

/**
 * 랜덤 생성
 */
function generateRandom(filters = {}) {
  const numbers = new Set();
  while (numbers.size < 6) {
    numbers.add(Math.floor(Math.random() * 45) + 1);
  }
  return applyFilters([...numbers].sort((a, b) => a - b), filters);
}

/**
 * 스마트 생성 (복합 알고리즘)
 */
function generateSmart(filters = {}) {
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const numbers = new Set();

    // 1. 번호대별 균등 분배 (1-9, 10-19, 20-29, 30-39, 40-45)
    const ranges = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]];
    const rangePicks = [1, 1, 1, 1, 1]; // 최소 각 대에서 1개
    const remaining = 1; // 나머지 1개는 랜덤 대에서

    // 각 대에서 1개씩
    ranges.forEach((range, i) => {
      if (rangePicks[i] > 0) {
        const n = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
        numbers.add(n);
      }
    });

    // 나머지
    while (numbers.size < 6) {
      numbers.add(Math.floor(Math.random() * 45) + 1);
    }

    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    // 합계 범위 체크 (100~175가 가장 빈출)
    if (sum >= 100 && sum <= 175) {
      // 홀짝 비율 체크 (3:3 또는 4:2가 가장 빈출)
      const oddCount = sorted.filter(n => n % 2 === 1).length;
      if (oddCount >= 2 && oddCount <= 4) {
        return applyFilters(sorted, filters);
      }
    }
  }

  // 실패 시 랜덤 반환
  return generateRandom(filters);
}

/**
 * 필터 적용
 */
function applyFilters(numbers, filters = {}) {
  if (!filters || Object.keys(filters).length === 0) return numbers;

  let result = [...numbers];

  // 제외 번호
  if (filters.exclude && filters.exclude.length > 0) {
    result = result.filter(n => !filters.exclude.includes(n));
    while (result.length < 6) {
      const newNum = Math.floor(Math.random() * 45) + 1;
      if (!result.includes(newNum) && !filters.exclude.includes(newNum)) {
        result.push(newNum);
      }
    }
  }

  // 포함 번호
  if (filters.include && filters.include.length > 0) {
    const included = filters.include.filter(n => n >= 1 && n <= 45);
    result = [...new Set([...included, ...result])].slice(0, 6);
  }

  return result.sort((a, b) => a - b);
}

/**
 * 전체 출현 빈도 계산
 */
function calculateFullFrequency() {
  const results = db.query('SELECT * FROM lotto_results ORDER BY draw_no DESC');
  const freq = {};
  for (let i = 1; i <= 45; i++) freq[i] = 0;

  results.forEach(r => {
    [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].forEach(n => {
      freq[n]++;
    });
  });

  return freq;
}

module.exports = router;
