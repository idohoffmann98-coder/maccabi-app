// המתזמן: רץ כל 15 שניות ומחליט מה לעשות לפי לוח המשחקים המאוחד (יורוליג + ליגת העל + גביעים).
//  • לפני משחק (3 שעות לפני): בדיקת פצועים (כולל עדכוני המועדון), מפגשי עבר ושחקנים חמים
//  • בתחילת משחק: פוש "המשחק מתחיל" (בכל המפעלים)
//  • במהלך משחק יורוליג: בדיקה קלה של התוצאה (כל 4 דק', ומהרבע הרביעי כל 30 שנ')
//    כדי לזהות סיום מותח – 5 דקות אחרונות והפרש קטן מ-10
//  • אחרי המשחק: עדכון מלא של כל הנתונים
import { config } from './config.js';
import { load, save } from './store.js';
import * as el from './euroleague.js';
import { buildPreview, findGame, fullRefresh, ilState, nextGame, previews, state, refreshClub, refreshIsrael, updateLineup } from './data.js';
import { sendPush } from './push.js';

const MIN = 60 * 1000;
const TEAM = config.teamCode;
const notified = () => load('notified', {});
const mark = (id, kind) => {
  const n = notified();
  n[id] = { ...(n[id] || {}), [kind]: new Date().toISOString() };
  save('notified', n);
};

let lastFull = 0;
let lastPoll = 0;
let liveQuarter = 0;
let lastLineup = 0;
const startersFound = new Set();
let busy = false;

const secsLeft = (t) => {
  if (!t) return null;
  const [m, s] = String(t).split(':').map(Number);
  return m * 60 + (s || 0);
};

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();

    // עדכון שגרתי פעם ב-12 שעות (לוח המשחקים, פציעות וכו')
    if (now - lastFull > 12 * 60 * MIN) {
      await fullRefresh('שגרתי');
      lastFull = now;
    }

    const g = nextGame();
    if (!g) return;
    const tip = new Date(g.date).getTime();
    const previewAt = tip - config.previewHoursBefore * 60 * MIN;

    // לפני משחק: תצוגה מקדימה + בדיקת פצועים
    const pv = previews()[g.id];
    if (!pv || (now >= previewAt && new Date(pv.builtAt).getTime() < previewAt)) {
      await buildPreview(g);
    }

    // הסגל למשחק והחמישייה הפותחת: מ-90 דקות לפני ועד 20 דקות אחרי הפתיחה, כל 5 דקות (עד שהחמישייה ידועה)
    if (g.comp === 'euroleague' && !startersFound.has(g.id) && now >= tip - 90 * MIN && now <= tip + 20 * MIN && now - lastLineup >= 5 * MIN) {
      lastLineup = now;
      if (await updateLineup(g)) startersFound.add(g.id);
    }

    if (g.timeTBD || now < tip - 2 * MIN) return;

    // פוש על תחילת משחק
    if (!notified()[g.id]?.start && now < tip + 30 * MIN) {
      const opp = g.isHome ? g.away : g.home;
      await sendPush('start', {
        title: `🏀 המשחק מתחיל! (${g.compHe})`,
        body: `מכבי תל אביב ${g.isHome ? 'נגד' : 'בחוץ מול'} ${opp.nameHe} – יאללה מכבי! 💛💙`,
        url: `/#/game/${g.id}`,
        tag: `start-${g.id}`,
      });
      mark(g.id, 'start');
    }

    const elapsed = now - tip;

    // ---- משחק שאינו יורוליג (ליגת העל, גביעים, הכנה): אין מקור תוצאה חיה,
    //      בודקים אם הסתיים מ-2 שעות אחרי הפתיחה ----
    if (g.comp !== 'euroleague') {
      if (elapsed < 120 * MIN || now - lastPoll < 10 * MIN) return;
      lastPoll = now;
      await (g.id.startsWith('il') ? refreshIsrael() : refreshClub());
      const updated = findGame(g.id);
      if (updated?.status === 'result') {
        console.log(`[scheduler] משחק ${g.id} הסתיים – מעדכן נתונים`);
        await fullRefresh('אחרי משחק');
        lastFull = now;
        const nxt = nextGame();
        if (nxt) await buildPreview(nxt);
      }
      return;
    }

    // ---- משחק יורוליג: בדיקה קלה של התוצאה (לא "זמן אמת" מלא) ----
    const lateGame = elapsed > 75 * MIN || liveQuarter >= 4;
    if (now - lastPoll < (lateGame ? 30 * 1000 : 4 * MIN)) return;
    lastPoll = now;

    const cur = await el.fetchGame(state().season, g.raw.code);
    liveQuarter = Number(cur.quarter) || 0;

    if (cur.status === 'result') {
      console.log(`[scheduler] משחק ${g.id} הסתיים ${cur.home.score}-${cur.away.score} – מעדכן נתונים`);
      await fullRefresh('אחרי משחק');
      lastFull = now;
      liveQuarter = 0;
      const nxt = nextGame();
      if (nxt) await buildPreview(nxt);
      return;
    }

    // סיום מותח: רבע 4 (או הארכה), 5 דקות אחרונות, הפרש קטן מ-10
    const left = secsLeft(cur.remainingTime);
    const diff = Math.abs(cur.home.score - cur.away.score);
    const q = liveQuarter;
    const clutch = q >= 5 || (q === 4 && left !== null && left <= 300);
    if (clutch && diff < 10 && !notified()[g.id]?.close && el.isLive(cur)) {
      const us = cur.home.code === TEAM ? cur.home.score : cur.away.score;
      const them = cur.home.code === TEAM ? cur.away.score : cur.home.score;
      const opp = g.isHome ? g.away : g.home;
      await sendPush('close', {
        title: '😱 סיום מותח!',
        body: `${q >= 5 ? 'הארכה' : `${cur.remainingTime} לסיום`} – מכבי ${us}, ${opp.nameHe} ${them}. כדאי להדליק את הטלוויזיה!`,
        url: `/#/game/${g.id}`,
        tag: `close-${g.id}`,
      });
      mark(g.id, 'close');
    }

    // ביטחון: אם המשחק "נתקע" יותר מ-4 שעות, עדכון מלא כל חצי שעה
    if (elapsed > 4 * 60 * MIN && now - lastFull > 30 * MIN) {
      await fullRefresh('משחק לא נסגר');
      lastFull = now;
    }
  } catch (e) {
    console.error('[scheduler] error', e.message);
  } finally {
    busy = false;
  }
}

export function startScheduler() {
  const s = state();
  if (s.updatedAt && ilState().updatedAt) lastFull = Math.min(new Date(s.updatedAt).getTime(), new Date(ilState().updatedAt).getTime());
  tick();
  setInterval(tick, 15 * 1000);
}
