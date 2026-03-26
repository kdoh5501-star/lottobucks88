/**
 * 당첨번호 조회 라우트
 */
const express = require('express');
const router = express.Router();
const db = require('../models/database');

// ===== 당첨번호 조회 페이지 =====
router.get('/', (req, res) => {
  const latestResults = db.query(
    'SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT 10'
  );

  // 번호별 출현 빈도 (전체)
  const frequency = calculateFrequency(latestResults);

  res.render('lotto', {
    title: '당첨번호 조회 - 로또벅스88',
    results: latestResults,
    latestDraw: latestResults[0] || null,
    frequency
  });
});

// ===== 특정 회차 조회 API =====
router.get('/draw/:drawNo', (req, res) => {
  const { drawNo } = req.params;
  const result = db.queryOne('SELECT * FROM lotto_results WHERE draw_no = ?', [drawNo]);

  if (!result) {
    return res.status(404).json({ success: false, message: '해당 회차 정보가 없습니다.' });
  }

  res.json({ success: true, data: result });
});

// ===== 최근 N회차 조회 API =====
router.get('/recent/:count', (req, res) => {
  const count = Math.min(parseInt(req.params.count) || 10, 100);
  const results = db.query(
    'SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT ?', [count]
  );
  res.json({ success: true, data: results });
});

// ===== 번호 출현 빈도 API =====
router.get('/frequency', (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 10, 100);
  const results = db.query(
    'SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT ?', [count]
  );

  const frequency = calculateFrequency(results);
  res.json({ success: true, data: frequency, draws: count });
});

// ===== 번호별 통계 API =====
router.get('/stats', (req, res) => {
  const results = db.query('SELECT * FROM lotto_results ORDER BY draw_no DESC');

  const stats = {
    totalDraws: results.length,
    frequency: calculateFrequency(results),
    oddEvenRatio: calculateOddEvenRatio(results),
    sumRange: calculateSumRange(results),
    consecutiveStats: calculateConsecutiveStats(results),
    recentPatterns: analyzeRecentPatterns(results.slice(0, 10))
  };

  res.json({ success: true, data: stats });
});

// ===== 외부 API에서 당첨번호 가져오기 =====
router.post('/fetch-latest', async (req, res) => {
  try {
    // 동행복권 API 호출 (실제 구현 시 사용)
    // 현재는 DB에 있는 최신 데이터 반환
    const latest = db.queryOne('SELECT * FROM lotto_results ORDER BY draw_no DESC LIMIT 1');
    res.json({ success: true, data: latest, message: '최신 당첨번호 조회 완료' });
  } catch (err) {
    console.error('Fetch lotto error:', err);
    res.status(500).json({ success: false, message: '당첨번호 조회에 실패했습니다.' });
  }
});

// ===== 헬퍼 함수 =====

function calculateFrequency(results) {
  const freq = {};
  for (let i = 1; i <= 45; i++) freq[i] = 0;

  results.forEach(r => {
    [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].forEach(n => {
      freq[n] = (freq[n] || 0) + 1;
    });
  });

  return freq;
}

function calculateOddEvenRatio(results) {
  const ratios = {};
  results.forEach(r => {
    const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6];
    const oddCount = nums.filter(n => n % 2 === 1).length;
    const key = `${oddCount}:${6 - oddCount}`;
    ratios[key] = (ratios[key] || 0) + 1;
  });
  return ratios;
}

function calculateSumRange(results) {
  const sums = results.map(r => r.num1 + r.num2 + r.num3 + r.num4 + r.num5 + r.num6);
  return {
    min: Math.min(...sums),
    max: Math.max(...sums),
    avg: Math.round(sums.reduce((a, b) => a + b, 0) / sums.length),
    distribution: sums
  };
}

function calculateConsecutiveStats(results) {
  let withConsecutive = 0;
  results.forEach(r => {
    const nums = [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].sort((a, b) => a - b);
    for (let i = 0; i < nums.length - 1; i++) {
      if (nums[i + 1] - nums[i] === 1) { withConsecutive++; break; }
    }
  });
  return { withConsecutive, total: results.length, ratio: (withConsecutive / results.length * 100).toFixed(1) };
}

function analyzeRecentPatterns(results) {
  // 최근 10회차 분석
  const hotNumbers = {};
  const coldNumbers = {};

  for (let i = 1; i <= 45; i++) {
    hotNumbers[i] = 0;
    coldNumbers[i] = 0;
  }

  results.forEach(r => {
    [r.num1, r.num2, r.num3, r.num4, r.num5, r.num6].forEach(n => {
      hotNumbers[n]++;
    });
  });

  const sorted = Object.entries(hotNumbers).sort((a, b) => b[1] - a[1]);
  return {
    hot: sorted.slice(0, 10).map(([num, count]) => ({ num: parseInt(num), count })),
    cold: sorted.slice(-10).reverse().map(([num, count]) => ({ num: parseInt(num), count }))
  };
}

module.exports = router;
