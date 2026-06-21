/**
 * 동행복권 결과 스크래핑
 * - 홈페이지에서 최신 회차 정보 + 등수별 통계 추출
 */
const https = require('https');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9'
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

/**
 * 최신 회차의 당첨번호, 보너스, 등수별 통계 스크래핑
 * @returns {object|null} { drwNo, drawDate, numbers, bonus, tiers }
 */
async function fetchLatestDraw() {
  try {
    // 1) 추첨결과 페이지 (최신 회차 자동)
    const html = await fetchUrl('https://www.dhlottery.co.kr/lt645/result');

    // 회차 번호
    const drwNoMatch = html.match(/<strong[^>]*id="lottoDrwNo"[^>]*>(\d+)<\/strong>/) ||
                       html.match(/(\d+)회<\/h4>/) ||
                       html.match(/<h4>제\s*<strong[^>]*>(\d+)<\/strong>\s*회/);
    if (!drwNoMatch) {
      console.error('회차 번호 파싱 실패');
      return null;
    }
    const drwNo = parseInt(drwNoMatch[1]);

    // 추첨일
    const dateMatch = html.match(/\((\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/) ||
                      html.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    const drawDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : '';

    // 당첨번호 6개 + 보너스
    const ballMatches = html.match(/<span[^>]*ball_645[^>]*>(\d+)<\/span>/g) || [];
    const balls = ballMatches.map(m => parseInt(m.match(/>(\d+)</)[1]));
    if (balls.length < 7) {
      console.error('당첨번호 7개 파싱 실패. 받은:', balls);
      return null;
    }
    const numbers = balls.slice(0, 6).sort((a, b) => a - b);
    const bonus = balls[6];

    // 등수별 통계 (1등~5등)
    // 표 형식: 당첨금 / 게임 수 / 1게임당 / 비고
    const tierRegex = /(\d+)등[\s\S]{0,300}?<td[^>]*>([0-9,]+)\s*원<\/td>[\s\S]{0,80}?<td[^>]*>([0-9,]+)\s*<\/td>[\s\S]{0,80}?<td[^>]*>([0-9,]+)\s*원/g;
    const tiers = {};
    let m;
    while ((m = tierRegex.exec(html)) !== null) {
      const rank = parseInt(m[1]);
      if (rank >= 1 && rank <= 5) {
        tiers[`rank${rank}`] = {
          totalPrize: parseInt(m[2].replace(/,/g, '')),
          winners: parseInt(m[3].replace(/,/g, '')),
          perWinner: parseInt(m[4].replace(/,/g, ''))
        };
      }
    }

    return {
      drwNo: drwNo,
      drawDate: drawDate,
      numbers: numbers,
      bonus: bonus,
      tiers: tiers
    };
  } catch (err) {
    console.error('동행복권 스크래핑 실패:', err.message);
    return null;
  }
}

module.exports = {
  fetchLatestDraw: fetchLatestDraw
};
