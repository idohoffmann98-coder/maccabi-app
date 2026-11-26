// חישובים: ממוצעי שחקנים, שחקנים חמים, נעדרים, מפגשי עבר
import { playerHe, teamHe } from './hebrew.js';

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (m, a) => (a ? Math.round((m / a) * 1000) / 10 : null);

// מחזיר את שורת השחקנים של קבוצה מסוימת מתוך box score
export function teamSide(box, teamCode) {
  if (!box) return null;
  if (box.home.code === teamCode) return box.home;
  if (box.away.code === teamCode) return box.away;
  return null;
}

// game log לכל שחקן בקבוצה (לפי סדר כרונולוגי)
export function playerLogs(games, boxscores, teamCode) {
  const logs = new Map();
  const finished = games.filter((g) => g.status === 'result').sort((a, b) => a.date.localeCompare(b.date));
  for (const g of finished) {
    const side = teamSide(boxscores[g.code], teamCode);
    if (!side) continue;
    const opp = g.home.code === teamCode ? g.away : g.home;
    for (const p of side.players) {
      if (!p.sec) continue; // לא שיחק
      if (!logs.has(p.code)) logs.set(p.code, { code: p.code, name: p.name, headshot: p.headshot, dorsal: p.dorsal, games: [] });
      const entry = logs.get(p.code);
      entry.headshot = p.headshot || entry.headshot;
      entry.games.push({ gameCode: g.code, date: g.date, round: g.round, opp: opp.code, oppName: teamHe(opp.code, opp.name), ...p });
    }
  }
  return logs;
}

export function seasonAverages(log) {
  const gs = log.games;
  const n = gs.length;
  const sum = (k) => gs.reduce((s, g) => s + (g[k] || 0), 0);
  return {
    gp: n,
    min: r1(sum('sec') / 60 / n),
    pts: r1(sum('pts') / n),
    reb: r1(sum('reb') / n),
    ast: r1(sum('ast') / n),
    stl: r1(sum('stl') / n),
    blk: r1(sum('blk') / n),
    tov: r1(sum('tov') / n),
    pir: r1(sum('pir') / n),
    fgPct: pct(sum('fgm2') + sum('fgm3'), sum('fga2') + sum('fga3')),
    threePct: pct(sum('fgm3'), sum('fga3')),
    threeMade: sum('fgm3'),
    ftPct: pct(sum('ftm'), sum('fta')),
    best: gs.reduce((b, g) => (!b || g.pts > b.pts ? g : b), null),
    doubleDoubles: gs.filter((g) => [g.pts, g.reb, g.ast].filter((v) => v >= 10).length >= 2).length,
  };
}

export function playersTable(games, boxscores, roster, teamCode) {
  const logs = playerLogs(games, boxscores, teamCode);
  const rosterCodes = new Set(roster.map((p) => p.code));
  const out = [];
  for (const log of logs.values()) {
    const avg = seasonAverages(log);
    const r = roster.find((p) => p.code === log.code);
    out.push({
      code: log.code,
      name: playerHe(log.name),
      nameEn: log.name,
      dorsal: r?.dorsal ?? log.dorsal,
      position: r?.position || null,
      headshot: r?.headshot || log.headshot,
      onRoster: rosterCodes.has(log.code),
      ...avg,
      best: avg.best && { pts: avg.best.pts, opp: avg.best.oppName, round: avg.best.round },
    });
  }
  // שחקני סגל שעוד לא שיחקו
  for (const r of roster) {
    if (!logs.has(r.code)) out.push({ code: r.code, name: playerHe(r.name), nameEn: r.name, dorsal: r.dorsal, position: r.position, headshot: r.headshot, onRoster: true, gp: 0 });
  }
  return out.sort((a, b) => (b.pts || 0) - (a.pts || 0));
}

// "שחקנים חמים": ממוצע מדד (PIR) ב-3 המשחקים האחרונים לעומת ממוצע העונה. עד 3 שחקנים; אם אין – רשימה ריקה
export function hotPlayers(games, boxscores, teamCode, { last = 3, limit = 3 } = {}) {
  const logs = playerLogs(games, boxscores, teamCode);
  // רק שחקנים ששיחקו לפחות באחד משני המשחקים האחרונים של הקבוצה (בלי פצועים / שחקנים שלא משחקים)
  const recentTeamGames = new Set(
    games.filter((g) => g.status === 'result' && boxscores[g.code]).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2).map((g) => g.code),
  );
  const res = [];
  for (const log of logs.values()) {
    const gs = log.games;
    if (gs.length < last + 2) continue;
    if (!gs.some((g) => recentTeamGames.has(g.gameCode))) continue;
    const recent = gs.slice(-last);
    const avg = (arr, k) => arr.reduce((s, g) => s + g[k], 0) / arr.length;
    const seasonPir = avg(gs, 'pir');
    const recentPir = avg(recent, 'pir');
    const seasonPts = avg(gs, 'pts');
    const recentPts = avg(recent, 'pts');
    const delta = recentPir - seasonPir;
    // 🔥 חם: כושר חריג (מדד 8+ ועלייה של 20% ולפחות 3 נקודות מדד)
    // 📈 בעלייה: שיפור ברור אבל מתון יותר (מדד 6+ ועלייה של 10% ולפחות 1.5)
    const hot = recentPir >= 8 && delta >= Math.max(3, seasonPir * 0.2);
    const rising = !hot && recentPir >= 6 && delta >= Math.max(1.5, seasonPir * 0.1);
    if (hot || rising) {
      res.push({
        level: hot ? 'hot' : 'rising',
        code: log.code,
        name: playerHe(log.name),
        headshot: log.headshot,
        seasonPir: r1(seasonPir),
        recentPir: r1(recentPir),
        seasonPts: r1(seasonPts),
        recentPts: r1(recentPts),
        delta: r1(delta),
        lastGames: recent.map((g) => ({ pts: g.pts, pir: g.pir, opp: g.oppName })),
      });
    }
  }
  return res.sort((a, b) => (a.level === b.level ? b.delta - a.delta : a.level === 'hot' ? -1 : 1)).slice(0, limit);
}

// נעדרים: שחקני סגל שלא שיחקו במשחקים האחרונים (+ מידע ידני על פציעה)
export function absences(games, boxscores, roster, teamCode, manualInjuries = []) {
  const finished = games.filter((g) => g.status === 'result' && boxscores[g.code]).sort((a, b) => b.date.localeCompare(a.date));
  const out = [];
  for (const p of roster) {
    let missed = 0;
    for (const g of finished) {
      const side = teamSide(boxscores[g.code], teamCode);
      const row = side?.players.find((x) => x.code === p.code);
      if (row && row.sec > 0) break;
      missed++;
    }
    const manual = manualInjuries.find((i) => i.playerCode === p.code && i.active !== false);
    const playedEver = finished.some((g) => teamSide(boxscores[g.code], teamCode)?.players.some((x) => x.code === p.code && x.sec > 0));
    if (manual || (missed >= 1 && finished.length && playedEver)) {
      out.push({
        code: p.code,
        name: playerHe(p.name),
        headshot: p.headshot,
        missedGames: missed,
        injury: manual?.injury || null,
        expectedReturn: manual?.expectedReturn || null,
        note: manual?.note || null,
        link: manual?.link || null,
        updatedAt: manual?.updatedAt || null,
        source: manual ? manual.source || 'manual' : 'auto',
      });
    }
  }
  return out.sort((a, b) => (a.source === 'auto') - (b.source === 'auto') || b.missedGames - a.missedGames);
}

export function teamSummary(games, teamCode) {
  const fin = games.filter((g) => g.status === 'result').sort((a, b) => a.date.localeCompare(b.date));
  const res = fin.map((g) => {
    const home = g.home.code === teamCode;
    const us = home ? g.home.score : g.away.score;
    const them = home ? g.away.score : g.home.score;
    return { home, us, them, win: us > them };
  });
  const n = res.length || 1;
  let streak = 0;
  for (let i = res.length - 1; i >= 0; i--) {
    if (res[i].win === res[res.length - 1].win) streak++;
    else break;
  }
  return {
    played: res.length,
    won: res.filter((x) => x.win).length,
    lost: res.filter((x) => !x.win).length,
    homeWon: res.filter((x) => x.home && x.win).length,
    homeLost: res.filter((x) => x.home && !x.win).length,
    awayWon: res.filter((x) => !x.home && x.win).length,
    awayLost: res.filter((x) => !x.home && !x.win).length,
    ptsFor: r1(res.reduce((s, x) => s + x.us, 0) / n),
    ptsAgainst: r1(res.reduce((s, x) => s + x.them, 0) / n),
    streak: res.length ? { type: res[res.length - 1].win ? 'W' : 'L', count: streak } : null,
    form: res.slice(-5).map((x) => (x.win ? 'W' : 'L')),
    highest: res.reduce((m, x) => Math.max(m, x.us), 0),
    biggestWin: res.filter((x) => x.win).reduce((m, x) => Math.max(m, x.us - x.them), 0),
  };
}

// סיכום box score לקבוצה (ממוצעים קבוצתיים)
export function teamAverages(games, boxscores, teamCode) {
  const fin = games.filter((g) => g.status === 'result' && boxscores[g.code]);
  const tot = { reb: 0, ast: 0, stl: 0, tov: 0, fgm3: 0, fga3: 0, fgm: 0, fga: 0, ftm: 0, fta: 0 };
  for (const g of fin) {
    for (const p of teamSide(boxscores[g.code], teamCode)?.players || []) {
      tot.reb += p.reb; tot.ast += p.ast; tot.stl += p.stl; tot.tov += p.tov;
      tot.fgm3 += p.fgm3; tot.fga3 += p.fga3; tot.fgm += p.fgm2 + p.fgm3; tot.fga += p.fga2 + p.fga3;
      tot.ftm += p.ftm; tot.fta += p.fta;
    }
  }
  const n = fin.length || 1;
  return {
    reb: r1(tot.reb / n), ast: r1(tot.ast / n), stl: r1(tot.stl / n), tov: r1(tot.tov / n),
    fgPct: pct(tot.fgm, tot.fga), threePct: pct(tot.fgm3, tot.fga3), ftPct: pct(tot.ftm, tot.fta),
    threesPerGame: r1(tot.fgm3 / n),
  };
}

export function topPerformer(box, teamCode) {
  if (!box) return null;
  const pick = (players) => players.filter((p) => p.sec > 0).sort((a, b) => b.pir - a.pir || b.pts - a.pts)[0];
  const all = [...box.home.players.map((p) => ({ ...p, team: box.home.code })), ...box.away.players.map((p) => ({ ...p, team: box.away.code }))];
  const best = pick(all);
  const ours = pick(teamSide(box, teamCode)?.players || []);
  const fmt = (p) => p && { code: p.code, name: playerHe(p.name), team: p.team, teamName: teamHe(p.team), headshot: p.headshot, pts: p.pts, reb: p.reb, ast: p.ast, pir: p.pir };
  return { overall: fmt(best), ours: fmt(ours && { ...ours, team: teamCode }) };
}
