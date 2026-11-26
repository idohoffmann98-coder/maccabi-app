// מצב פלייאוף: בונה מהמשחקים סדרות ועץ פלייאוף לשתי הליגות.
// מוצג רק כשהליגה הגיעה לשלב הפלייאוף (יש משחקי פלייאוף עם קבוצות ידועות).
import { config, seasonCode } from './config.js';
import * as el from './euroleague.js';
import * as il from './israel.js';
import { load, save } from './store.js';
import { teamHe } from './hebrew.js';

const TEAM = config.teamCode;
export const playoffsState = () => load('playoffs', { euroleague: null, league: null, updatedAt: null });

// מקבץ משחקים לסדרות לפי זוג הקבוצות
function toSeries(games, key = (t) => t.code) {
  const map = new Map();
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const [a, b] = [g.home, g.away].sort((x, y) => String(key(x)).localeCompare(String(key(y))));
    const k = `${key(a)}|${key(b)}`;
    if (!map.has(k)) map.set(k, { teams: [{ ...a, wins: 0 }, { ...b, wins: 0 }], games: [] });
    const s = map.get(k);
    s.games.push(g);
    if (g.status === 'result' && g.home.score !== g.away.score) {
      const winner = g.home.score > g.away.score ? g.home : g.away;
      s.teams.find((t) => key(t) === key(winner)).wins++;
    }
  }
  return [...map.values()].map((s) => {
    const [t1, t2] = s.teams;
    const lead = t1.wins === t2.wins ? null : t1.wins > t2.wins ? t1 : t2;
    return {
      teams: s.teams.map(({ score, ...t }) => t),
      games: s.games.map((g) => ({ id: g.id, date: g.date, status: g.status, home: key(g.home), away: key(g.away), homeScore: g.home.score, awayScore: g.away.score, url: g.url || null })),
      leader: lead ? key(lead) : null,
      ours: s.teams.some((t) => t.ours),
    };
  });
}

// הסדרה הוכרעה: הקבוצה המובילה הגיעה למספר הניצחונות הדרוש, או הופיעה כבר בשלב הבא
function markDecided(rounds, key = (t) => t.code) {
  rounds.forEach((r, i) => {
    const next = rounds[i + 1];
    const nextTeams = new Set((next?.series || []).flatMap((s) => s.teams.map(key)));
    for (const s of r.series) {
      const maxWins = Math.max(...s.teams.map((t) => t.wins));
      const pending = s.games.some((g) => g.status !== 'result');
      s.decided = !!s.leader && ((r.single && !pending) || (r.needed && maxWins >= r.needed) || nextTeams.has(s.leader));
      s.winner = s.decided ? s.leader : null;
    }
  });
  return rounds;
}

// ---------- יורוליג ----------
const elTeam = (t) => ({ code: t.code, name: teamHe(t.code, t.name), crest: t.crest, score: t.score, ours: t.code === TEAM });
async function euroleaguePlayoffs(season) {
  const [pi, po, ff] = await Promise.all(['PI', 'PO', 'FF'].map((p) => el.fetchPhaseGames(season, p).catch(() => [])));
  const known = (g) => g.home.code && g.away.code;
  if (![...pi, ...po, ...ff].some(known)) return null;
  const map = (g) => ({ id: `el${g.code}`, date: g.date, status: g.status, group: g.group, home: elTeam(g.home), away: elTeam(g.away) });
  const rounds = [];
  if (pi.length) {
    rounds.push({
      key: 'pi',
      name: 'פליי-אין',
      single: true,
      series: [...pi].sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ ...toSeries([map(g)])[0], label: g.group.replace(/^Group\s*/i, 'משחק ') })),
    });
  }
  if (po.length) {
    const groups = [...new Set(po.map((g) => g.group))].sort();
    rounds.push({
      key: 'po',
      name: 'פלייאוף (הטוב מ-5)',
      needed: 3,
      series: groups.flatMap((gr) => toSeries(po.filter((g) => g.group === gr).map(map)).map((s) => ({ ...s, label: gr.replace(/^Group\s*PLAYOFF\s*/i, 'סדרה ') }))),
    });
  }
  if (ff.length) {
    const label = (gr) => (/CHAMPIONSHIP/i.test(gr) ? 'גמר' : /THIRD/i.test(gr) ? 'מקום 3' : 'חצי גמר');
    rounds.push({
      key: 'ff',
      name: 'פיינל פור',
      single: true,
      series: [...ff].sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ ...toSeries([map(g)])[0], label: label(g.group) })),
    });
  }
  return markDecided(rounds);
}

// ---------- ליגת העל ----------
async function leaguePlayoffs(year) {
  const raw = await il.fetchPlayoffs(year);
  if (!raw.some((r) => r.games.some((g) => g.home.teamId && g.away.teamId))) return null;
  const team = (t) => ({ code: t.teamId, name: il.isOurs(t.name) ? 'מכבי תל אביב' : t.name, crest: t.crest, score: t.score, ours: il.isOurs(t.name) });
  const order = (n) => (/פליי-אין/.test(n) ? 0 : /רבע/.test(n) ? 1 : /חצי/.test(n) ? 2 : /פיינל פור/.test(n) ? 2 : 3);
  const rounds = raw
    .sort((a, b) => order(a.name) - order(b.name))
    .map((r) => {
      const games = r.games.map((g) => ({ id: `il${g.gameId}`, date: g.date, status: g.status, url: g.url, home: team(g.home), away: team(g.away) }));
      const single = /פליי-אין|פיינל פור/.test(r.name);
      const series = toSeries(games);
      return { key: `il-${order(r.name)}`, name: r.name.replace(/^ליגת Winner סל\s*-\s*/, ''), single, series };
    });
  // אורך הסדרות משתנה בין עונות, ולכן: סדרה מוכרעת כשהמנצחת מופיעה בשלב הבא; בגמר – כשמישהי הגיעה ל-3 ניצחונות (הטוב מ-5)
  const last = rounds[rounds.length - 1];
  if (last && !last.single) last.needed = Math.max(...last.series.map((s) => s.games.length)) > 5 ? 4 : 3;
  return markDecided(rounds);
}

export async function refreshPlayoffs() {
  const year = config.seasonYear;
  const [elR, ilR] = await Promise.allSettled([euroleaguePlayoffs(seasonCode(year)), leaguePlayoffs(il.ilYear(year))]);
  if (elR.status === 'rejected') console.warn('[playoffs] יורוליג נכשל', elR.reason?.message);
  if (ilR.status === 'rejected') console.warn('[playoffs] ליגת העל נכשל', ilR.reason?.message);
  const prev = playoffsState();
  const next = {
    euroleague: elR.status === 'fulfilled' ? elR.value : prev.euroleague,
    league: ilR.status === 'fulfilled' ? ilR.value : prev.league,
    season: seasonCode(year),
    updatedAt: new Date().toISOString(),
  };
  save('playoffs', next);
  return next;
}
