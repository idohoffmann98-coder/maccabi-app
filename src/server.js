import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import {
  activeInjuries, allGames, restoreSeason, boxByCode, buildPreview, clearInjury, findGame, fullRefresh, ilState, injuries,
  lastGame, nextGame, previews, setInjury, state, unifiedRoster,
} from './data.js';
import { dynamicFacts, STATIC_FACTS } from './facts.js';
import { playerHe, POSITION_HE, teamHe } from './hebrew.js';
import { addSubscription, getPrefs, publicKey, removeSubscription, sendPush } from './push.js';
import { startScheduler } from './scheduler.js';
import { dbConnected, initStore } from './store.js';
import { imageHandler } from './images.js';
import { adminGuard, cleanText, rateLimit, securityHeaders, validSubscription } from './security.js';
import { hotPlayers, playerLogs, playersTable, teamAverages, teamSummary, topPerformer } from './stats.js';

const TEAM = config.teamCode;
const app = express();
app.set('trust proxy', 1); // Render יושב מאחורי proxy – כדי לזהות את כתובת ה-IP האמיתית
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '8kb' }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 120 }));

const strip = (g) => g && (({ raw, ...rest }) => rest)(g);

function computed() {
  const s = state();
  const box = boxByCode(s.season);
  const inj = activeInjuries();
  const players = playersTable(s.games, box, s.roster, TEAM).map((p) => ({
    ...p,
    positionHe: POSITION_HE[p.position] || p.position,
    injury: inj.find((i) => i.playerCode === p.code) || null,
  }));
  const summary = teamSummary(s.games, TEAM);
  const teamAvg = teamAverages(s.games, box, TEAM);
  return { s, box, players, summary, teamAvg };
}

// סיכום מאזן לכל מפעל (כל המשחקים המאוחדים)
function recordByComp() {
  const out = {};
  for (const g of allGames()) {
    if (g.status !== 'result') continue;
    const us = g.isHome ? g.home.score : g.away.score;
    const them = g.isHome ? g.away.score : g.home.score;
    out[g.comp] ||= { compHe: g.compHe, won: 0, lost: 0 };
    out[g.comp][us > them ? 'won' : 'lost']++;
  }
  return out;
}

app.get('/api/home', (req, res) => {
  const { s, box, players, summary, teamAvg } = computed();
  const last = lastGame();
  const next = nextGame();
  const ilS = ilState();
  res.json({
    updatedAt: s.updatedAt,
    season: s.season,
    coach: playerHe(s.coach),
    summary,
    teamAvg,
    records: recordByComp(),
    standing: s.standings.find((t) => t.code === TEAM) || null,
    ilStanding: (ilS.table || []).find((t) => /מכבי ת"א/.test(t.name)) || null,
    lastGame: strip(last),
    lastGameTop: last?.comp === 'euroleague' ? topPerformer(box[last.raw.code], TEAM) : null,
    nextGame: strip(next),
    upcoming: allGames().filter((g) => g.status !== 'result').slice(1, 4).map(strip),
    injuries: activeInjuries(),
    hot: hotPlayers(s.games, box, TEAM),
    leaders: ['pts', 'reb', 'ast', 'pir'].map((k) => {
      const p = [...players].filter((x) => x.gp >= 3).sort((a, b) => (b[k] || 0) - (a[k] || 0))[0];
      return p && { stat: k, code: p.code, name: p.name, headshot: p.headshot, value: p[k] };
    }).filter(Boolean),
  });
});

app.get('/api/facts', (req, res) => {
  const { s, players, summary, teamAvg } = computed();
  const dyn = dynamicFacts({ players, summary, teamAvg, standings: s.standings, teamCode: TEAM, games: s.games });
  const ilS = ilState();
  const ilRow = (ilS.table || []).find((t) => /מכבי ת"א/.test(t.name));
  if (ilRow) dyn.push(`בליגת העל מכבי במקום ה-${ilRow.position} עם ${ilRow.won} ניצחונות ו-${ilRow.lost} הפסדים.`);
  const ilTop = [...(ilS.players || [])].filter((p) => p.gp >= 2).sort((a, b) => b.pts - a.pts)[0];
  if (ilTop) dyn.push(`הקלע המוביל של מכבי בליגת העל: ${ilTop.name} עם ${ilTop.pts} נקודות בממוצע.`);
  if (ilS.teamAvg?.pts) dyn.push(`בליגת העל מכבי קולעת ${ilS.teamAvg.pts} נקודות בממוצע למשחק.`);
  res.json([...dyn.map((text) => ({ text, kind: 'season' })), ...STATIC_FACTS.map((text) => ({ text, kind: 'history' }))]);
});

app.get('/api/games', (req, res) => res.json(allGames().map(strip)));

app.get('/api/games/:id', async (req, res) => {
  const g = findGame(req.params.id);
  if (!g) return res.status(404).json({ error: 'לא נמצא' });
  let box = null;
  let top = null;
  if (g.comp === 'euroleague' && g.status === 'result') {
    const b = boxByCode(state().season)[g.raw.code];
    const fmtSide = (side) => side && {
      ...side,
      nameHe: teamHe(side.code),
      players: side.players.filter((p) => p.sec > 0).map((p) => ({ ...p, nameHe: playerHe(p.name) })).sort((a, b) => b.starter - a.starter || b.min - a.min),
    };
    if (b) {
      box = { home: fmtSide(b.home), away: fmtSide(b.away) };
      top = topPerformer(b, TEAM);
    }
  }
  let preview = previews()[g.id] || null;
  if (!preview && g.status !== 'result') {
    try { preview = await buildPreview(g); } catch (e) { console.warn(e.message); }
  }
  res.json({ game: strip(g), box, top, preview });
});

// ממוצעים משולבים (יורוליג + ליגת העל), משוקללים לפי מספר המשחקים בכל מפעל.
// שחקנים מותאמים לפי מספר חולצה.
function combinedPlayers(elPlayers, ilPlayers) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const keys = ['min', 'pts', 'reb', 'ast', 'stl', 'tov', 'blk', 'pir'];
  const out = [];
  const used = new Set();
  for (const p of elPlayers.filter((x) => x.onRoster || x.gp)) {
    const ilp = ilPlayers.find((x) => Number(x.dorsal) === Number(p.dorsal));
    if (ilp) used.add(ilp.playerId);
    const g1 = p.gp || 0;
    const g2 = ilp?.gp || 0;
    const row = { ...p, gp: g1 + g2, gpEl: g1, gpLeague: g2 };
    for (const k of keys) row[k] = g1 + g2 ? r1(((p[k] || 0) * g1 + (ilp?.[k] || 0) * g2) / (g1 + g2)) : null;
    out.push(row);
  }
  for (const ilp of ilPlayers) {
    if (used.has(ilp.playerId)) continue;
    out.push({ ...ilp, code: null, gpEl: 0, gpLeague: ilp.gp });
  }
  return out;
}

// שחקני ליגת העל עם התמונה מהסגל באתר המנהלת
function leaguePlayers() {
  const ilS = ilState();
  const photo = new Map((ilS.roster || []).map((r) => [r.playerId, r.photo]));
  return (ilS.players || []).map((p) => ({ ...p, headshot: photo.get(p.playerId) || null }));
}

// סמלי הקבוצות בליגת העל: מתוך לוח המשחקים של מכבי (מופיעות בו כל הקבוצות)
function leagueCrests() {
  const m = new Map();
  for (const g of ilState().games || []) for (const t of [g.home, g.away]) if (t.teamId && t.crest && !m.has(t.teamId)) m.set(t.teamId, t.crest);
  return m;
}

app.get('/api/players', (req, res) => {
  const { players } = computed();
  const ilS = { ...ilState(), players: leaguePlayers() };
  res.json({
    euroleague: players,
    league: ilS.players || [],
    combined: combinedPlayers(players, ilS.players || []),
    leagueTeamAvg: ilS.teamAvg || null,
  });
});

app.get('/api/players/:code', (req, res) => {
  const { s, box, players } = computed();
  const p = players.find((x) => x.code === req.params.code);
  if (!p) return res.status(404).json({ error: 'לא נמצא' });
  const log = playerLogs(s.games, box, TEAM).get(p.code);
  const r = s.roster.find((x) => x.code === p.code);
  const ilp = (ilState().players || []).find((x) => Number(x.dorsal) === Number(p.dorsal));
  res.json({ ...p, country: r?.country, birthDate: r?.birthDate, height: r?.height, league: ilp || null, games: (log?.games || []).reverse() });
});

app.get('/api/standings', (req, res) => {
  const s = state();
  const ilS = ilState();
  res.json({
    euroleague: { round: s.standingsRound, teams: s.standings.map((t) => ({ ...t, nameHe: teamHe(t.code, t.name), us: t.code === TEAM })) },
    league: { teams: (ilS.table || []).map((t) => ({ ...t, crest: t.crest || leagueCrests().get(t.teamId) || null, nameHe: /מכבי ת"א/.test(t.name) ? 'מכבי תל אביב' : t.name, us: /מכבי ת"א/.test(t.name) })) },
  });
});

// ---- פוש ----
app.get('/api/push/key', (req, res) => res.json({ publicKey: publicKey() }));
const pushLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.post('/api/push/subscribe', pushLimit, (req, res) => {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ error: 'הרשמה לא תקינה' });
  const prefs = { start: req.body?.prefs?.start !== false, close: req.body?.prefs?.close !== false };
  const clean = { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  if (!addSubscription(clean, prefs)) return res.status(503).json({ error: 'הגענו למספר המרבי של מכשירים רשומים' });
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', pushLimit, (req, res) => {
  if (typeof req.body?.endpoint === 'string') removeSubscription(req.body.endpoint);
  res.json({ ok: true });
});
app.post('/api/push/prefs', (req, res) => res.json(typeof req.body?.endpoint === 'string' ? getPrefs(req.body.endpoint) : null));

// ---- ניהול (דורש טוקן) ----
const admin = adminGuard(config.adminToken);
app.get('/api/admin/roster', admin, (req, res) => res.json({ roster: unifiedRoster().map((p) => ({ code: p.code, nameHe: p.nameHe, dorsal: state().roster.find((r) => r.code === p.code)?.dorsal })), injuries: injuries(), active: activeInjuries() }));
app.post('/api/admin/injuries', admin, async (req, res) => {
  const { playerCode, remove } = req.body || {};
  if (typeof playerCode !== 'string' || !/^\w{1,20}$/.test(playerCode)) return res.status(400).json({ error: 'חסר שחקן' });
  if (remove) clearInjury(playerCode);
  else {
    const p = unifiedRoster().find((x) => x.code === playerCode);
    if (!p) return res.status(400).json({ error: 'השחקן לא נמצא בסגל' });
    setInjury({ playerCode, playerName: p.nameHe, injury: cleanText(req.body.injury), expectedReturn: cleanText(req.body.expectedReturn, 60), note: cleanText(req.body.note, 200) });
  }
  const g = nextGame();
  if (g) await buildPreview(g).catch(() => {});
  res.json({ ok: true, injuries: injuries() });
});
app.post('/api/admin/refresh', admin, async (req, res) => {
  await fullRefresh('ידני');
  const g = nextGame();
  if (g) await buildPreview(g);
  res.json({ ok: true, updatedAt: state().updatedAt });
});
app.post('/api/admin/test-push', admin, async (req, res) => {
  const n = await sendPush('test', { title: '💛💙 התראת ניסיון', body: 'ההתראות עובדות! נעדכן אותך בתחילת כל משחק ובסיומים מותחים.', url: '/' });
  res.json({ ok: true, sent: n });
});

app.get('/img/:w/:key', imageHandler('img'));
app.get('/logo/:w/:key', imageHandler('logo'));

app.get('/healthz', (req, res) => res.json({ ok: true, updatedAt: state().updatedAt, db: dbConnected() }));

const pub = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
app.use(express.static(pub, { extensions: ['html'] }));

// Render בחינם "מרדים" שרת אחרי 15 דקות בלי בקשות. השרת פונה לכתובת הציבורית של עצמו כל 10 דקות
// כדי להישאר ער (Render מגדיר את RENDER_EXTERNAL_URL אוטומטית). אפשר להגדיר גם KEEPALIVE_URL.
function keepAlive() {
  const url = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!url) return;
  console.log(`[keepalive] פינג כל 10 דקות ל-${url}`);
  setInterval(() => {
    fetch(new URL('/healthz', url), { signal: AbortSignal.timeout(20000) }).catch((e) => console.warn('[keepalive]', e.message));
  }, 10 * 60 * 1000);
}

const start = async () => {
  restoreSeason();
  try { await initStore(); } catch (e) { console.error('[store] חיבור למסד הנתונים נכשל – ממשיך עם קבצים בלבד:', e.message); }
  // מתחילים לקבל בקשות מיד; איסוף הנתונים רץ ברקע (בשרת חדש הוא לוקח דקה-שתיים)
  app.listen(config.port, () => console.log(`🏀 השרת רץ על http://localhost:${config.port}`));
  if (process.env.NO_SCHEDULER !== '1') {
    startScheduler(); // הסבב הראשון של המתזמן מבצע עדכון מלא אם אין עדיין נתונים
  } else if (!state().updatedAt || !ilState().updatedAt) {
    fullRefresh('הפעלה ראשונה').catch((e) => console.error('refresh failed', e.message));
  }
  keepAlive();
};
start();
