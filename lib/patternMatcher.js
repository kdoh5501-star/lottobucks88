/**
 * 173,010개 패턴 데이터 로딩 & 매칭 엔진
 * - patterns.dat: 173,010 × 6 bytes binary file
 * - In-memory load on server startup
 */
const fs = require('fs');
const path = require('path');

const PATTERN_FILE = path.join(__dirname, 'patterns.dat');
const PATTERN_COUNT_EXPECTED = 173010;

let patternBuffer = null; // Buffer of 173,010 × 6 = 1,038,060 bytes
let patternCount = 0;

function loadPatterns() {
  try {
    if (!fs.existsSync(PATTERN_FILE)) {
      console.error('패턴 파일이 없습니다:', PATTERN_FILE);
      return false;
    }
    patternBuffer = fs.readFileSync(PATTERN_FILE);
    patternCount = Math.floor(patternBuffer.length / 6);
    console.log(`✅ 패턴 ${patternCount.toLocaleString()}개 로딩 완료`);
    return true;
  } catch (err) {
    console.error('패턴 로딩 실패:', err);
    return false;
  }
}

/**
 * 당첨번호와 패턴 매칭 계산
 * @param {number[]} winning - 6개 당첨번호
 * @param {number} bonus - 보너스 번호
 * @returns {object} { rank1, rank2, rank3, rank4, rank5, total }
 */
function calculateMatches(winning, bonus) {
  if (!patternBuffer) {
    console.error('패턴이 로드되지 않았습니다');
    return null;
  }

  // Bitmap of winning numbers for fast lookup
  const winSet = new Set(winning);
  const counts = { rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0 };

  for (let i = 0; i < patternCount; i++) {
    const offset = i * 6;
    let hits = 0;
    let hasBonus = false;
    for (let j = 0; j < 6; j++) {
      const num = patternBuffer[offset + j];
      if (winSet.has(num)) hits++;
      if (num === bonus) hasBonus = true;
    }
    if (hits === 6) counts.rank1++;
    else if (hits === 5 && hasBonus) counts.rank2++;
    else if (hits === 5) counts.rank3++;
    else if (hits === 4) counts.rank4++;
    else if (hits === 3) counts.rank5++;
  }

  counts.total = counts.rank1 + counts.rank2 + counts.rank3 + counts.rank4 + counts.rank5;
  return counts;
}

function getPatternCount() {
  return patternCount;
}

module.exports = {
  loadPatterns: loadPatterns,
  calculateMatches: calculateMatches,
  getPatternCount: getPatternCount
};
