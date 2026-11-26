import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import {
  activeInjuries, allGames, boxByCode, buildPreview, clearInjury, findGame, fullRefresh, ilState, injuries,
  lastGame, nextGame, previews, setInjury, state, unifiedRoster,
} from './data.js';
import { dynamicFacts, STATIC_FACTS } from './facts.js';
import { playerHe, POSITION_HE, teamHe } from './hebrew.js';
import { addSubscription, getPrefs, publicKey, removeSubscription, sendPush } from './push.js';
import { startScheduler } from './scheduler.js';
import { initStore } from './store.js';
import { hotPlayers, playerLogs, playersTable, teamAverages, teamSummary, topPerformer } from './stats.js';

const TEAM = config.teamCode;
const app = express();
app.use(express.json());

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

app.get('/api/players', (req, res) => {
  const { players } = computed();
  const ilS = ilState();
  res.json({ euroleague: players, league: ilS.players || [], leagueTeamAvg: ilS.teamAvg || null });
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
    league: { teams: (ilS.table || []).map((t) => ({ ...t, nameHe: /מכבי ת"א/.test(t.name) ? 'מכבי תל אביב' : t.name, us: /מכבי ת"א/.test(t.name) })) },
  });
});

// ---- פוש ----
app.get('/api/push/key', (req, res) => res.json({ publicKey: publicKey() }));
app.post('/api/push/subscribe', (req, res) => {
  if (!req.body?.subscription?.endpoint) return res.status(400).json({ error: 'missing subscription' });
  addSubscription(req.body.subscription, req.body.prefs);
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', (req, res) => {
  removeSubscription(req.body?.endpoint);
  res.json({ ok: true });
});
app.post('/api/push/prefs', (req, res) => res.json(getPrefs(req.body?.endpoint)));

// ---- ניהול (דורש טוקן) ----
const admin = (req, res, next) => (req.get('x-admin-token') === config.adminToken ? next() : res.status(401).json({ error: 'טוקן שגוי' }));
app.get('/api/admin/roster', admin, (req, res) => res.json({ roster: unifiedRoster().map((p) => ({ code: p.code, nameHe: p.nameHe, dorsal: state().roster.find((r) => r.code === p.code)?.dorsal })), injuries: injuries(), active: activeInjuries() }));
app.post('/api/admin/injuries', admin, async (req, res) => {
  const { playerCode, injury, expectedReturn, note, remove } = req.body || {};
  if (!playerCode) return res.status(400).json({ error: 'חסר שחקן' });
  if (remove) clearInjury(playerCode);
  else {
    const p = unifiedRoster().find((x) => x.code === playerCode);
    setInjury({ playerCode, playerName: p?.nameHe || playerCode, injury, expectedReturn, note });
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

app.get('/healthz', (req, res) => res.json({ ok: true, updatedAt: state().updatedAt, db: !!process.env.DATABASE_URL }));

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
  try { await initStore(); } catch (e) { console.error('[store] חיבור למסד הנתונים נכשל – ממשיך עם קבצים בלבד:', e.message); }
  if (!state().updatedAt || !ilState().updatedAt) {
    try { await fullRefresh('הפעלה ראשונה'); } catch (e) { console.error('refresh failed', e.message); }
  }
  app.listen(config.port, () => console.log(`🏀 השרת רץ על http://localhost:${config.port}`));
  if (process.env.NO_SCHEDULER !== '1') startScheduler();
  keepAlive();
};
start();
