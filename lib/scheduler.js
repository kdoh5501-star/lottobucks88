/**
 * 매주 토요일 추첨 10분 뒤 자동 업데이트 스케줄러 (v2)
 * - 추첨: 매주 토요일 20:35 KST
 * - 업데이트: 매주 토요일 20:45 KST (10분 뒤)
 * - 업데이트 대상:
 *   1) lotto_results 테이블 (메인 hero + /lotto 페이지의 최근 당첨번호)
 *   2) latest_draw 테이블 (등급별 분석 + 패턴 매칭 결과)
 */
const cron = require('node-cron');
const fetcher = require('./lottoFetcher');
const matcher = require('./patternMatcher');
const db = require('../models/database');

const KST_CRON = '45 20 * * 6'; // 매주 토요일 20:45 KST

async function updateLatestDraw() {
  console.log('[Scheduler v2] 최신 회차 업데이트 시작', new Date().toISOString());

  const draw = await fetcher.fetchLatestDraw();
  if (!draw) {
    console.error('[Scheduler v2] 회차 데이터 가져오기 실패');
    return null;
  }

  console.log(`[Scheduler v2] ${draw.drwNo}회 (${draw.drawDate}) 가져옴:`, draw.numbers, '+ 보너스', draw.bonus);

  // 1) lotto_results 테이블 업데이트 (메인 hero용)
  try {
    const exists = db.queryOne('SELECT id FROM lotto_results WHERE draw_no = ?', [draw.drwNo]);
    if (!exists) {
      const prize1st = draw.tiers && draw.tiers.rank1 ? draw.tiers.rank1.perWinner : 0;
      const winners1st = draw.tiers && draw.tiers.rank1 ? draw.tiers.rank1.winners : 0;
      db.run(
        `INSERT INTO lotto_results (draw_no, draw_date, num1, num2, num3, num4, num5, num6, bonus, prize_1st, winners_1st)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draw.drwNo, draw.drawDate,
          draw.numbers[0], draw.numbers[1], draw.numbers[2],
          draw.numbers[3], draw.numbers[4], draw.numbers[5],
          draw.bonus, prize1st, winners1st
        ]
      );
      console.log(`[Scheduler v2] lotto_results에 ${draw.drwNo}회 신규 추가`);
    } else {
      console.log(`[Scheduler v2] lotto_results에 ${draw.drwNo}회 이미 존재`);
    }
  } catch (err) {
    console.error('[Scheduler v2] lotto_results 저장 실패:', err);
  }

  // 2) 패턴 매칭 계산
  const matches = matcher.calculateMatches(draw.numbers, draw.bonus);
  if (!matches) {
    console.error('[Scheduler v2] 패턴 매칭 실패');
    return { draw: draw, matches: null };
  }
  console.log(`[Scheduler v2] 패턴 매칭 결과:`, matches);

  // 3) latest_draw 테이블 업데이트 (등급별 분석용)
  try {
    db.run('DELETE FROM latest_draw WHERE drw_no = ?', [draw.drwNo]);
    db.run(
      `INSERT INTO latest_draw (drw_no, draw_date, numbers, bonus, tiers_json, pattern_matches_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        draw.drwNo, draw.drawDate,
        draw.numbers.join(','), draw.bonus,
        JSON.stringify(draw.tiers || {}), JSON.stringify(matches)
      ]
    );
    console.log(`[Scheduler v2] latest_draw에 ${draw.drwNo}회 저장 완료`);
  } catch (err) {
    console.error('[Scheduler v2] latest_draw 저장 실패:', err);
  }

  return { draw: draw, matches: matches };
}

function start() {
  cron.schedule(KST_CRON, () => {
    updateLatestDraw().catch(err => console.error('[Scheduler v2] 실패:', err));
  }, { timezone: 'Asia/Seoul' });

  console.log(`✅ Scheduler v2 등록 완료: 매주 토요일 20:45 KST (${KST_CRON})`);

  // 서버 시작 시 1회 즉시 실행
  setTimeout(() => {
    updateLatestDraw().catch(err => console.error('[Scheduler v2] 초기 실행 실패:', err));
  }, 5000);
}

module.exports = {
  start: start,
  updateLatestDraw: updateLatestDraw
};
