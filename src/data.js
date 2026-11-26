// משיכת נתונים מכל המקורות, שמירה במטמון, ובניית "תצוגה מקדימה" לפני משחק
//  • יורוליג – ה-API הרשמי של היורוליג
//  • ליגת העל, גביע ווינר וסופרקאפ – אתר מנהלת ליגת העל
//  • פציעות – עדכוני המועדון באתר הרשמי של מכבי + עדכונים ידניים מעמוד הניהול
import { autoSeasonYear, config, seasonCode, setActiveSeasonYear } from './config.js';
import { load, save } from './store.js';
import * as el from './euroleague.js';
import * as il from './israel.js';
import { fetchInjuryNews } from './injuries.js';
import { clubGames, refreshClubGames } from './clubsite.js';
import { warmImages } from './images.js';
import { refreshPlayoffs } from './playoffs.js';
import { hasHebrew, playerHe, registerHebrew, teamHe } from './hebrew.js';
import { absences, hotPlayers, topPerformer } from './stats.js';

const TEAM = config.teamCode;

export const state = () =>
  load('state', { season: seasonCode(), games: [], roster: [], coach: '', standings: [], updatedAt: null });
export const ilState = () => load('il', { teamId: null, games: [], roster: [], players: [], teamAvg: null, table: [], updatedAt: null });
export const boxscores = () => load('boxscores', {}); // key: `${season}_${code}`
export const previews = () => load('previews', {});
export const injuries = () => load('injuries', []); // ידני
export const injuryNews = () => load('injuryNews', []); // אוטומטי מהאתר של מכבי

const bkey = (season, code) => `${season}_${code}`;

export const COMP_HE = { euroleague: 'יורוליג', league: 'ליגת העל', cup: 'גביע ווינר', statecup: 'גביע המדינה', supercup: 'סופרקאפ', other: 'משחק הכנה' };

async function ensureBoxscores(season, games) {
  const box = boxscores();
  let added = 0;
  for (const g of games) {
    if (g.status !== 'result') continue;
    const k = bkey(season, g.code);
    if (box[k]) continue;
    try {
      box[k] = await el.fetchBoxscore(season, g.code, g);
      added++;
    } catch (e) {
      console.warn('[data] boxscore failed', k, e.message);
    }
  }
  if (added) save('boxscores', box);
  return added;
}

export function boxByCode(season) {
  const box = boxscores();
  const out = {};
  const prefix = `${season}_`;
  for (const [k, v] of Object.entries(box)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  return out;
}

// ---------- רענון ----------
export async function refreshEuroleague() {
  const season = seasonCode();
  const games = (await el.fetchTeamGames(season, TEAM)).sort((a, b) => a.date.localeCompare(b.date));
  const { players: roster, coach } = await el.fetchRoster(season, TEAM);
  await ensureBoxscores(season, games);
  // הטבלה לפי המחזור האחרון של העונה הסדירה (בפלייאוף הטבלה כבר סופית)
  const lastRound = Math.max(0, ...games.filter((g) => g.status === 'result' && (g.phase || 'RS') === 'RS').map((g) => g.round || 0));
  let standings = state().standings;
  if (lastRound) {
    try {
      standings = await el.fetchStandings(season, lastRound);
    } catch (e) {
      console.warn('[data] standings failed', e.message);
    }
  }
  save('state', { season, games, roster, coach, standings, standingsRound: lastRound, updatedAt: new Date().toISOString() });
}

export async function refreshIsrael() {
  const prev = ilState();
  const year = il.ilYear();
  const teamId = (prev.year === year && prev.teamId) || (await il.findTeamId(year));
  if (!teamId) {
    // העונה החדשה בליגת העל עוד לא נפתחה באתר המנהלת – לא משאירים משחקים של העונה הקודמת
    if (prev.year !== year) save('il', { year, teamId: null, games: [], roster: [], players: [], teamAvg: null, table: [], updatedAt: new Date().toISOString() });
    console.log(`[data] ליגת העל: עונת ${year - 1}-${String(year).slice(2)} עוד לא פורסמה`);
    return;
  }
  const team = await il.fetchTeam(teamId, year);
  let table = prev.table;
  try {
    table = await il.fetchTable(year);
  } catch (e) {
    console.warn('[data] il table failed', e.message);
  }
  save('il', { year, teamId, ...team, table, updatedAt: new Date().toISOString() });
}

// רשימת שחקנים אחידה: קוד יורוליג + כל השמות בעברית (מהמילון שלנו ומאתר המנהלת, מותאם לפי מספר חולצה)
export function unifiedRoster() {
  const s = state();
  const ilr = ilState().roster || [];
  return s.roster.map((p) => {
    const ilp = ilr.find((x) => Number(x.dorsal) === Number(p.dorsal));
    const names = [playerHe(p.name)];
    if (ilp && ilp.name !== names[0]) names.push(ilp.name);
    return { code: p.code, names, nameHe: names[0], headshot: p.headshot, ilPhoto: ilp?.photo || null };
  });
}

export async function refreshInjuries() {
  try {
    const news = await fetchInjuryNews(unifiedRoster());
    save('injuryNews', news);
  } catch (e) {
    console.warn('[data] injury news failed', e.message);
  }
}

// פציעות פעילות: ידניות + מהאתר של מכבי (פציעה מהאתר מתבטלת אם השחקן שיחק אחרי מועד הדיווח)
export function activeInjuries() {
  const s = state();
  const box = boxByCode(s.season);
  const lastPlayed = (code) => {
    let d = null;
    for (const g of s.games) {
      if (g.status !== 'result') continue;
      const side = box[g.code] && (box[g.code].home.code === TEAM ? box[g.code].home : box[g.code].away);
      if (side?.players.some((p) => p.code === code && p.sec > 0) && (!d || g.date > d)) d = g.date;
    }
    return d;
  };
  const manual = injuries().filter((i) => i.active !== false).map((i) => ({ ...i, source: 'manual' }));
  const auto = injuryNews()
    .filter((n) => !n.returned)
    .filter((n) => !manual.some((m) => m.playerCode === n.playerCode))
    .filter((n) => {
      const lp = lastPlayed(n.playerCode);
      return !lp || lp < n.date;
    })
    .map((n) => ({
      playerCode: n.playerCode,
      playerName: n.playerName,
      injury: n.injury,
      expectedReturn: n.duration,
      note: `לפי עדכון המועדון מ-${new Date(n.date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
      link: /^https:\/\/maccabi\.co\.il\//.test(n.link || '') ? n.link : null,
      updatedAt: n.date,
      source: 'club',
    }));
  return [...manual, ...auto];
}

// בוחר את העונה הפעילה: מאוגוסט מנסים את העונה החדשה, ואם עוד אין לה משחקים ביורוליג – העונה הקודמת
async function resolveSeason() {
  if (process.env.SEASON_YEAR) return Number(process.env.SEASON_YEAR);
  const y = autoSeasonYear();
  try {
    const games = await el.fetchTeamGames(seasonCode(y), TEAM);
    if (games.length) return y;
  } catch {}
  return y - 1;
}

export async function refreshClub() {
  const y = config.seasonYear;
  await refreshClubGames(`${y}-08-01`, `${y + 1}-07-31`);
}

// שחקנים שאין להם שם בעברית במילון מקבלים את השם מאתר המנהלת (התאמה לפי מספר חולצה)
function syncHebrewNames() {
  const ilr = ilState().roster || [];
  for (const p of state().roster) {
    if (hasHebrew(p.name)) continue;
    const ilp = ilr.find((x) => Number(x.dorsal) === Number(p.dorsal));
    if (ilp?.name) registerHebrew(p.name, ilp.name.replace(/^גבריאל /, ''));
  }
}

export async function fullRefresh(reason = 'manual') {
  const year = await resolveSeason();
  const prevSeason = state().updatedAt ? state().season : null;
  setActiveSeasonYear(year);
  console.log(`[data] עדכון מלא (${reason}) – עונת ${year}-${String(year + 1).slice(2)}`);
  const results = await Promise.allSettled([refreshEuroleague(), refreshIsrael(), refreshClub(), refreshPlayoffs()]);
  results.forEach((r, i) => r.status === 'rejected' && console.warn(`[data] ${['יורוליג', 'ליגת העל', 'אתר מכבי', 'פלייאוף'][i]} נכשל:`, r.reason?.message));
  if (prevSeason && prevSeason !== seasonCode(year)) {
    console.log(`[data] מעבר עונה: ${prevSeason} → ${seasonCode(year)}`);
    save('previews', {});
    save('notified', {});
  }
  syncHebrewNames();
  await refreshInjuries();
  warmImages(imageList()).catch(() => {});
  return state();
}

// כל התמונות שהאפליקציה מציגה: שחקני מכבי (יורוליג וליגת העל) וסמלי הקבוצות
function imageList() {
  const items = [];
  for (const p of state().roster) if (p.headshot) items.push({ src: p.headshot, w: 96, kind: 'img' }, { src: p.headshot, w: 192, kind: 'img' });
  for (const p of ilState().roster || []) if (p.photo) items.push({ src: p.photo, w: 96, kind: 'img' });
  const crests = new Set();
  for (const g of allGames()) for (const t of [g.home, g.away]) if (t.crest) crests.add(t.crest);
  for (const t of state().standings) if (t.crest) crests.add(t.crest);
  for (const c of crests) items.push({ src: c, w: 96, kind: 'logo' }, { src: c, w: 48, kind: 'logo' });
  return items;
}

// בעליית השרת: עונה פעילה לפי הנתונים השמורים (עד שהעדכון הראשון רץ)
export function restoreSeason() {
  const s = state().season;
  if (s && !process.env.SEASON_YEAR) setActiveSeasonYear(Number(s.slice(1)));
  syncHebrewNames();
}

// ---------- לוח משחקים מאוחד ----------
export function elToUnified(g) {
  return {
    id: `el${g.code}`,
    comp: 'euroleague',
    compHe: COMP_HE.euroleague,
    stage: { PI: 'פליי-אין', PO: 'פלייאוף', FF: 'פיינל פור' }[g.phase] || g.roundName?.replace('Round', 'מחזור') || '',
    date: g.date,
    status: g.status,
    venue: g.venue,
    isHome: g.home.code === TEAM,
    home: { code: g.home.code, nameHe: teamHe(g.home.code, g.home.name), score: g.home.score, crest: g.home.crest },
    away: { code: g.away.code, nameHe: teamHe(g.away.code, g.away.name), score: g.away.score, crest: g.away.crest },
    raw: g,
  };
}

const ilName = (n) => (il.isOurs(n) ? 'מכבי תל אביב' : n);
export function ilToUnified(g) {
  const ours = il.isOurs(g.home.name);
  return {
    id: g.id,
    comp: g.comp,
    compHe: COMP_HE[g.comp],
    stage: g.comp === 'league' ? (g.round ? `מחזור ${g.round}` : g.stage.replace(/^ליגת Winner סל,?\s*-?\s*/, '')) : g.stage,
    date: g.date,
    timeTBD: g.timeTBD,
    status: g.status,
    venue: '',
    isHome: ours,
    overtimes: g.overtimes,
    url: g.url,
    home: { code: ours ? TEAM : `il${g.home.teamId}`, nameHe: ilName(g.home.name), score: g.home.score ?? 0, crest: g.home.crest },
    away: { code: !ours ? TEAM : `il${g.away.teamId}`, nameHe: ilName(g.away.name), score: g.away.score ?? 0, crest: g.away.crest },
    raw: g,
  };
}

const isMaccabiName = (n) => /מכבי\s*(Rapyd\s*)?תל[- ]אביב|מכבי ת"א/.test(n || '');
export function clubToUnified(g) {
  const home = isMaccabiName(g.home.name);
  const tbd = !g.time || g.time === '00:00';
  const side = (t, ours) => ({ code: ours ? TEAM : `mc${t.short}`, nameHe: ours ? 'מכבי תל אביב' : t.short || t.name, score: t.score, crest: t.logo });
  return {
    id: g.id,
    comp: g.comp,
    compHe: g.comp === 'other' ? (g.competition || COMP_HE.other).replace('משחקי הכנה', 'משחק הכנה') : COMP_HE[g.comp],
    stage: g.phase || '',
    date: il.israelToUTC(`${g.date}T${tbd ? '20:00' : g.time}:00`),
    timeTBD: tbd,
    status: g.status === 'result' ? 'result' : 'scheduled',
    venue: g.venue,
    isHome: home,
    url: g.url,
    home: side(g.home, home),
    away: side(g.away, !home),
    raw: g,
  };
}

const ilDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
export function allGames() {
  const list = [...state().games.map(elToUnified), ...(ilState().games || []).map(ilToUnified)];
  // מאתר מכבי מוסיפים רק משחקים שלא קיימים כבר (גביע המדינה, משחקי הכנה וכו')
  const days = new Set(list.map((g) => ilDay(g.date)));
  for (const g of clubGames()) if (!days.has(g.date)) list.push(clubToUnified(g));
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export const findGame = (id) => allGames().find((g) => g.id === id);
export const nextGame = () => allGames().find((g) => g.status !== 'result') || null;
export const lastGame = () => [...allGames()].reverse().find((g) => g.status === 'result') || null;

// ---------- מפגשי עבר ----------
async function h2hEuroleague(oppCode, beforeDate) {
  const meetings = [];
  for (let i = 0; i <= config.h2hSeasonsBack; i++) {
    const season = seasonCode(config.seasonYear - i);
    let games;
    try {
      games = i === 0 ? state().games : await el.fetchTeamGames(season, TEAM);
    } catch {
      continue;
    }
    for (const g of games) {
      if (g.status !== 'result' || g.date >= beforeDate) continue;
      if (g.home.code !== oppCode && g.away.code !== oppCode) continue;
      const home = g.home.code === TEAM;
      const us = home ? g.home.score : g.away.score;
      const them = home ? g.away.score : g.home.score;
      meetings.push({ season, code: g.code, date: g.date, comp: 'euroleague', compHe: COMP_HE.euroleague, home, us, them, win: us > them });
    }
  }
  meetings.sort((a, b) => b.date.localeCompare(a.date));
  let lastMeetingTop = null;
  if (meetings[0]) {
    const m = meetings[0];
    const k = bkey(m.season, m.code);
    let box = boxscores()[k];
    if (!box) {
      try {
        const g = await el.fetchGame(m.season, m.code);
        box = await el.fetchBoxscore(m.season, m.code, g);
        const all = boxscores();
        all[k] = box;
        save('boxscores', all);
      } catch (e) {
        console.warn('[data] h2h boxscore failed', e.message);
      }
    }
    lastMeetingTop = topPerformer(box, TEAM);
  }
  return { meetings, lastMeetingTop };
}

// במפעלים הישראליים מזהי הקבוצות משתנים בכל עונה, ולכן מתאימים לפי שם הקבוצה
const normName = (n) => n.replace(/["'״׳\s-]/g, '');
async function h2hIsrael(oppName, beforeDate) {
  const meetings = [];
  const cur = il.ilYear();
  for (let i = 0; i <= config.h2hSeasonsBack; i++) {
    const year = cur - i;
    let games;
    try {
      if (i === 0) games = ilState().games;
      else {
        const id = await il.findTeamId(year);
        games = id ? (await il.fetchTeam(id, year)).games : [];
      }
    } catch {
      continue;
    }
    for (const g of games) {
      if (g.status !== 'result' || g.date >= beforeDate) continue;
      const home = il.isOurs(g.home.name);
      const opp = home ? g.away : g.home;
      if (normName(opp.name) !== normName(oppName)) continue;
      const us = home ? g.home.score : g.away.score;
      const them = home ? g.away.score : g.home.score;
      meetings.push({ date: g.date, comp: g.comp, compHe: COMP_HE[g.comp], stage: g.stage, home, us, them, win: us > them, url: g.url });
    }
  }
  meetings.sort((a, b) => b.date.localeCompare(a.date));
  return { meetings, lastMeetingTop: null };
}

// ---------- תצוגה מקדימה ----------
export async function buildPreview(game) {
  const s = state();
  const season = s.season;
  const isEL = game.comp === 'euroleague';
  const opp = game.isHome ? game.away : game.home;
  console.log(`[data] בונה תצוגה מקדימה למשחק ${game.id} מול ${opp.nameHe}`);

  // בדיקת פצועים לפני המשחק: עדכוני המועדון + סגל עדכני
  await refreshInjuries();
  let roster = s.roster;
  try {
    roster = (await el.fetchRoster(season, TEAM)).players;
  } catch {}
  const box = boxByCode(season);
  const inj = activeInjuries();

  let oppGames = [];
  let oppRoster = [];
  if (isEL) {
    try {
      oppRoster = (await el.fetchRoster(season, opp.code)).players;
      oppGames = await el.fetchTeamGames(season, opp.code);
      await ensureBoxscores(season, oppGames);
    } catch (e) {
      console.warn('[data] opponent data failed', e.message);
    }
  }
  const box2 = boxByCode(season);

  const h2hRaw = isEL ? await h2hEuroleague(opp.code, game.date) : await h2hIsrael(opp.nameHe, game.date);
  const h2h = {
    meetings: h2hRaw.meetings.slice(0, 6),
    record: { won: h2hRaw.meetings.filter((m) => m.win).length, lost: h2hRaw.meetings.filter((m) => !m.win).length },
    lastMeetingTop: h2hRaw.lastMeetingTop,
    lastMeeting: h2hRaw.meetings[0] || null,
  };

  const ilTable = ilState().table || [];
  const standingOf = (code, name) => {
    if (isEL) {
      const t = s.standings.find((x) => x.code === code);
      return t && { position: t.position, won: t.won, lost: t.lost, table: 'יורוליג' };
    }
    const t = ilTable.find((x) => (code === TEAM ? il.isOurs(x.name) : normName(x.name) === normName(name)));
    return t && { position: t.position, won: t.won, lost: t.lost, table: 'ליגת העל' };
  };

  const preview = {
    gameId: game.id,
    comp: game.comp,
    builtAt: new Date().toISOString(),
    opp: { code: opp.code, name: opp.nameHe, crest: opp.crest },
    absences: {
      ours: absences(s.games, box, roster, TEAM, inj),
      theirs: isEL ? absences(oppGames, box2, oppRoster, opp.code, []) : null,
    },
    hot: {
      ours: hotPlayers(s.games, box, TEAM),
      theirs: isEL ? hotPlayers(oppGames, box2, opp.code) : null,
      basis: 'יורוליג',
    },
    h2h,
    oppStanding: standingOf(opp.code, opp.nameHe),
    ourStanding: standingOf(TEAM),
  };
  const all = previews();
  all[game.id] = preview;
  save('previews', all);
  return preview;
}

// ---------- פציעות ידניות (מעמוד הניהול) ----------
export function setInjury({ playerCode, playerName, injury, expectedReturn, note }) {
  const list = injuries().filter((i) => i.playerCode !== playerCode);
  list.push({ playerCode, playerName, injury, expectedReturn, note, active: true, updatedAt: new Date().toISOString() });
  save('injuries', list);
}

export function clearInjury(playerCode) {
  save('injuries', injuries().filter((i) => i.playerCode !== playerCode));
}

// ---------- הסגל למשחק והחמישייה הפותחת (יורוליג) ----------
// ה-API מחזיר את רשימת השחקנים של משחק רק סמוך לפתיחה. השרת בודק את זה שוב ושוב לפני המשחק,
// וכשהרשימה מופיעה – שומר אותה בתצוגה המקדימה (ומי שבסגל כבר לא מוצג כנעדר).
export async function updateLineup(game) {
  if (game.comp !== 'euroleague' || game.status === 'result') return false;
  let box;
  try {
    box = await el.fetchBoxscore(state().season, game.raw.code, game.raw);
  } catch {
    return false;
  }
  const side = (s) => (s?.players || []).map((p) => ({ code: p.code, name: playerHe(p.name), dorsal: p.dorsal, starter: p.starter, headshot: p.headshot }));
  const home = side(box.home);
  const away = side(box.away);
  if (!home.length && !away.length) return false;
  const ours = game.isHome ? home : away;
  const theirs = game.isHome ? away : home;
  const all = previews();
  const pv = all[game.id] || (await buildPreview(game));
  const prevCount = (pv.lineup?.ours?.length || 0) + (pv.lineup?.theirs?.length || 0);
  const prevStarters = pv.lineup?.ours?.filter((p) => p.starter).length || 0;
  pv.lineup = { ours, theirs, startersKnown: ours.some((p) => p.starter), fetchedAt: new Date().toISOString() };
  all[game.id] = pv;
  save('previews', all);
  if (prevCount !== ours.length + theirs.length || prevStarters !== ours.filter((p) => p.starter).length) {
    console.log(`[data] סגל למשחק ${game.id}: ${ours.length} שחקני מכבי${pv.lineup.startersKnown ? ' (כולל חמישייה פותחת)' : ''}`);
  }
  return pv.lineup.startersKnown;
}
