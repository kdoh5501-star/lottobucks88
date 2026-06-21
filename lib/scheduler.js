/**
 * 매주 토요일 추첨 10분 뒤 자동 업데이트 스케줄러
 * - 추첨: 매주 토요일 20:35 KST
 * - 업데이트: 매주 토요일 20:45 KST (10분 뒤)
 * - DB: latest_draw 테이블에 1행 (REPLACE 방식)
 */
const cron = require('node-cron');
const fetcher = require('./lottoFetcher');
const matcher = require('./patternMatcher');
const db = require('../models/database');

const KST_CRON = '45 20 * * 6'; // 매주 토요일 20:45 (Asia/Seoul 기준)

async function updateLatestDraw() {
  console.log('[Scheduler] 최신 회차 업데이트 시작', new Date().toISOString());

  const draw = await fetcher.fetchLatestDraw();
  if (!draw) {
    console.error('[Scheduler] 회차 데이터 가져오기 실패');
    return null;
  }

  console.log(`[Scheduler] ${draw.drwNo}회 (${draw.drawDate}) 가져옴:`, draw.numbers, '+ 보너스', draw.bonus);

  const matches = matcher.calculateMatches(draw.numbers, draw.bonus);
  if (!matches) {
    console.error('[Scheduler] 패턴 매칭 실패');
    return null;
  }

  console.log(`[Scheduler] 매칭 결과:`, matches);

  // DB 저장 (REPLACE: 같은 drw_no 있으면 덮어쓰기)
  try {
    db.run('DELETE FROM latest_draw WHERE drw_no = ?', [draw.drwNo]);
    db.run(
      `INSERT INTO latest_draw
       (drw_no, draw_date, numbers, bonus, tiers_json, pattern_matches_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        draw.drwNo,
        draw.drawDate,
        draw.numbers.join(','),
        draw.bonus,
        JSON.stringify(draw.tiers || {}),
        JSON.stringify(matches)
      ]
    );
    console.log(`[Scheduler] ${draw.drwNo}회 DB 저장 완료`);
  } catch (err) {
    console.error('[Scheduler] DB 저장 실패:', err);
  }

  return { draw: draw, matches: matches };
}

function start() {
  // Cron 등록 (Asia/Seoul timezone)
  cron.schedule(KST_CRON, () => {
    updateLatestDraw().catch(err => console.error('[Scheduler] 실패:', err));
  }, { timezone: 'Asia/Seoul' });

  console.log(`✅ 스케줄러 등록 완료: 매주 토요일 20:45 KST (${KST_CRON})`);

  // 서버 시작 시 1회 즉시 실행 (현재 회차 정보가 비어있을 수 있어서)
  setTimeout(() => {
    updateLatestDraw().catch(err => console.error('[Scheduler] 초기 실행 실패:', err));
  }, 5000);
}

module.exports = {
  start: start,
  updateLatestDraw: updateLatestDraw
};
