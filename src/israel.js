// ליגת העל, גביע ווינר וסופרקאפ – מתוך אתר מנהלת ליגת העל (basket.co.il)
// אין לאתר API, ולכן הנתונים נקראים מדפי ה-HTML שלו.
import { config } from './config.js';

const BASE = 'https://basket.co.il';
const TEAM_NAME = 'מכבי ת"א';

async function getHTML(url) {
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (fan-app)' }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw err;
}

const ENT = { '&quot;': '"', '&amp;': '&', '&#39;': "'", '&nbsp;': ' ', '&lt;': '<', '&gt;': '>' };
const decode = (s) => s.replace(/&(quot|amp|#39|nbsp|lt|gt);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n));
const text = (h) => decode(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const rowsOf = (tbl) => [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const cellsOf = (row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1]);
const num = (s) => {
  const n = parseFloat(String(s).replace('%', ''));
  return Number.isFinite(n) ? n : null;
};

// עונת 2026-27 נקראת באתר cYear=2027
export const ilYear = (seasonYear = config.seasonYear) => seasonYear + 1;

function section(html, h2) {
  const a = html.indexOf(`<h2>${h2}</h2>`);
  if (a < 0) return '';
  const b = html.indexOf('<h2>', a + 5);
  return html.slice(a, b < 0 ? undefined : b);
}

export function classify(stage) {
  if (/גביע המדינה/.test(stage)) return 'statecup';
  if (/גביע/.test(stage)) return 'cup';
  if (/סופרקאפ/.test(stage)) return 'supercup';
  if (/ליגת/.test(stage)) return 'league';
  return 'other';
}

// טבלת ליגת העל
export async function fetchTable(year = ilYear()) {
  const html = await getHTML(`${BASE}/table.asp?cYear=${year}`);
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const tbl = tables.find((t) => (t.match(/TeamId=/g) || []).length >= 10) || '';
  const teams = [];
  for (const r of rowsOf(tbl)) {
    const id = r.match(/TeamId=(\d+)/)?.[1];
    if (!id) continue;
    const c = cellsOf(r).map(text);
    const logo = r.match(/src="([^"]+)"/)?.[1];
    teams.push({
      position: Number(c[0]),
      teamId: id,
      name: c[1],
      points: num(c[2]),
      played: num(c[3]),
      won: num(c[4]),
      lost: num(c[5]),
      diff: c[6],
      pf: num(c[7]),
      pa: num(c[8]),
      crest: logo ? new URL(logo, BASE).href : null,
    });
  }
  return teams;
}

export async function findTeamId(year = ilYear()) {
  const html = await getHTML(`${BASE}/table.asp?cYear=${year}`);
  const m = [...html.matchAll(/TeamId=(\d+)"[^>]*>(?:\s|<[^>]+>)*([^<]+)/g)].find((x) => decode(x[2]).trim() === TEAM_NAME);
  return m?.[1] || null;
}

// דף הקבוצה: לוח משחקים בכל המפעלים, סגל וממוצעי שחקנים
export async function fetchTeam(teamId, year = ilYear()) {
  const html = await getHTML(`${BASE}/team.asp?TeamId=${teamId}&cYear=${year}`);

  // לוח משחקים
  const sched = section(html, 'לוח משחקים');
  const games = [];
  for (const r of rowsOf(sched)) {
    if (!/class="row/.test(r) && !/GameId=/.test(r)) continue;
    const raw = cellsOf(r);
    if (raw.length < 6) continue;
    const c = raw.map(text);
    const [d, m, y] = (c[0].match(/(\d{2})\/(\d{2})\/(\d{4})/) || []).slice(1);
    if (!d) continue;
    const time = (c[1].match(/\d{2}:\d{2}/) || [])[0] || null;
    const ids = [...r.matchAll(/TeamId=(\d+)/g)].map((x) => x[1]);
    const logos = [...r.matchAll(/<img[^>]+src="([^"]+)"/g)].map((x) => new URL(x[1], BASE).href);
    const gameId = r.match(/GameId=(\d+)/)?.[1];
    // התוצאה באתר מופיעה בפורמט "אורחת-מארחת"
    const sc = c[5].match(/(\d+)\s*-\s*(\d+)/);
    const ot = c[5].match(/\((\d)\)/)?.[1];
    // שעון ישראל: חורף UTC+2, קיץ UTC+3 (חישוב לפי Intl)
    const date = time ? israelToUTC(`${y}-${m}-${d}T${time}:00`) : israelToUTC(`${y}-${m}-${d}T20:00:00`);
    games.push({
      id: `il${gameId}`,
      gameId,
      date,
      timeTBD: !time,
      stage: c[2],
      comp: classify(c[2]),
      round: Number(c[2].match(/מחזור (\d+)/)?.[1]) || null,
      home: { teamId: ids[0], name: c[3], crest: logos[0] || null, score: sc ? Number(sc[2]) : null },
      away: { teamId: ids[1], name: c[4], crest: logos[1] || null, score: sc ? Number(sc[1]) : null },
      overtimes: ot ? Number(ot) : 0,
      status: sc ? 'result' : 'scheduled',
      url: `${BASE}/game-zone.asp?GameId=${gameId}`,
    });
  }

  // סגל (שם בעברית, מספר, תפקיד)
  const rosterSec = section(html, 'סגל הקבוצה');
  const roster = [...rosterSec.matchAll(/PlayerId=(\d+)[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const block = m[2];
    const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
    return {
      playerId: m[1],
      name: text(block.match(/role_name[^>]*>([\s\S]*?)<\/div>/)?.[1] || '').replace(/"/g, ''),
      dorsal: text(block.match(/role_num[^>]*>([\s\S]*?)<\/div>/)?.[1] || ''),
      photo: img ? new URL(img, BASE).href : null,
    };
  }).filter((p) => p.name);

  // ממוצעי שחקנים בליגה
  const statsSec = section(html, 'סטטיסטיקה');
  const tables = [...statsSec.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const playersTbl = tables.find((t) => /שחקנים - סטטיסטיקה ממוצעת/.test(t)) || '';
  const players = [];
  for (const r of rowsOf(playersTbl)) {
    const pid = r.match(/PlayerId=(\d+)/)?.[1];
    if (!pid) continue;
    const c = cellsOf(r).map(text);
    players.push({
      playerId: pid,
      dorsal: c[0],
      name: c[1],
      gp: num(c[2]),
      starts: num(c[3]),
      min: num(c[4]),
      pts: num(c[5]),
      fg2Pct: num(c[6]),
      threePct: num(c[7]),
      ftPct: num(c[8]),
      reb: num(c[11]),
      ast: num(c[16]),
      stl: num(c[14]),
      tov: num(c[15]),
      blk: num(c[17]),
      pir: num(c[19]),
    });
  }
  const teamTbl = tables.find((t) => /סטטיסטיקה קבוצתית - עונה סדירה/.test(t)) || '';
  const avgRow = rowsOf(teamTbl).map((r) => cellsOf(r).map(text)).find((c) => c[0] === 'ממוצע');
  const teamAvg = avgRow && {
    pts: num(avgRow[2]),
    fg2: avgRow[3],
    fg3: avgRow[4],
    ft: avgRow[5],
    reb: num(avgRow[8]),
    stl: num(avgRow[11]),
    tov: num(avgRow[12]),
    ast: num(avgRow[13]),
    pir: num(avgRow[16]),
  };

  return { games, roster, players, teamAvg };
}

// ממיר שעה מקומית בישראל ל-ISO ב-UTC (מתחשב בשעון קיץ)
export function israelToUTC(local) {
  const guess = new Date(`${local}Z`);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false });
  const ilHour = Number(fmt.format(guess));
  const offset = (ilHour - guess.getUTCHours() + 24) % 24; // 2 או 3
  return new Date(guess.getTime() - offset * 3600 * 1000).toISOString();
}

export const isOurs = (name) => name === TEAM_NAME;
