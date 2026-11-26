const TEAM = 'TEL';
const view = document.getElementById('view');
const TZ = 'Asia/Jerusalem';

const api = async (p) => {
  const r = await fetch(`/api/${p}`);
  if (!r.ok) throw new Error(r.status);
  return r.json();
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (d, opts) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, ...opts }).format(new Date(d));
const dayDate = (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'numeric' });
const hour = (d) => fmtDate(d, { hour: '2-digit', minute: '2-digit' });
const img = (src, cls = 'avatar', alt = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" />` : `<div class="${cls}"></div>`);
const crest = (t, size = 52) => (t?.crest ? `<img src="${esc(t.crest)}" alt="" width="${size}" height="${size}" loading="lazy" />` : '');
const STAT_HE = { pts: 'נקודות', reb: 'ריבאונדים', ast: 'אסיסטים', pir: 'מדד' };

function countdown(date) {
  const ms = new Date(date) - Date.now();
  if (ms <= 0) return 'עכשיו';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  if (d > 0) return `בעוד ${d} ימים ו-${h} שעות`;
  if (h > 0) return `בעוד ${h} שעות ו-${m} דק'`;
  return `בעוד ${m} דקות`;
}

const ourScore = (g) => (g.home.code === TEAM ? [g.home.score, g.away.score] : [g.away.score, g.home.score]);
const resultBadge = (g) => {
  const [us, them] = ourScore(g);
  return `<span class="badge ${us > them ? 'W' : 'L'}">${us > them ? 'נ' : 'ה'}</span>`;
};
const formBadges = (form) => `<div class="form">${(form || []).map((r) => `<span class="badge ${r}">${r === 'W' ? 'נ' : 'ה'}</span>`).join('')}</div>`;

function matchCard(g, { label, link = true } = {}) {
  const done = g.status === 'result';
  const mid = done
    ? `<div class="score"><span>${g.home.score}</span><span>-</span><span>${g.away.score}</span></div><div class="when">סיום${g.overtimes ? ' (הארכה)' : ''}</div>`
    : `<div class="big-time">${g.timeTBD ? 'טרם נקבע' : hour(g.date)}</div><div class="when">${dayDate(g.date)}</div>${g.timeTBD ? '' : `<span class="countdown">${countdown(g.date)}</span>`}`;
  // בתצוגה מימין לשמאל: קבוצת הבית מימין
  return `<div class="card">
    <div class="match-head"><span>${esc(label || '')}</span><span><span class="comp comp-${g.comp}">${esc(g.compHe)}</span> ${esc(g.stage || '')}</span></div>
    <div class="match">
      <div class="team">${crest(g.home)}<span>${esc(g.home.nameHe)}</span></div>
      <div class="mid">${mid}</div>
      <div class="team">${crest(g.away)}<span>${esc(g.away.nameHe)}</span></div>
    </div>
    ${g.venue ? `<div class="when" style="text-align:center;margin-top:8px">📍 ${esc(g.venue)}</div>` : ''}
    ${link ? `<a class="cta" href="#/game/${g.id}">${done ? 'פרטי המשחק ←' : 'לפני המשחק: פצועים, מפגשי עבר ושחקנים חמים ←'}</a>` : ''}
  </div>`;
}

const injRow = (i) => `<div class="abs"><div style="flex:1"><div><b>${esc(i.playerName)}</b></div>
  <div class="inj">🩹 ${esc(i.injury || 'פצוע')}${i.expectedReturn ? ` · היעדרות משוערת: ${esc(i.expectedReturn)}` : ''}</div>
  <div class="why">${esc(i.note || '')}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">לעדכון באתר מכבי ↗</a>` : ''}</div></div></div>`;

// ---------- עובדה מגניבה (משתנה בכל פתיחה) ----------
let facts = [];
function pickFact() {
  if (!facts.length) return null;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('seenFacts') || '[]'); } catch {}
  let pool = facts.map((f, i) => i).filter((i) => !seen.includes(i));
  if (!pool.length) { seen = []; pool = facts.map((f, i) => i); }
  const i = pool[Math.floor(Math.random() * pool.length)];
  seen.push(i);
  try { localStorage.setItem('seenFacts', JSON.stringify(seen.slice(-Math.floor(facts.length * 0.8)))); } catch {}
  return facts[i];
}
function renderFact() {
  const f = pickFact();
  const el = document.getElementById('fact');
  if (!el || !f) return;
  el.innerHTML = `<div class="label">${f.kind === 'season' ? '📊 מהעונה הנוכחית' : '📜 מההיסטוריה'} · הידעת?</div>
    <p>${esc(f.text)}</p><button id="nextFact">עוד עובדה ↻</button>`;
  document.getElementById('nextFact').onclick = renderFact;
}

// ---------- מסכים ----------
async function home() {
  const [d, f] = await Promise.all([api('home'), facts.length ? facts : api('facts')]);
  facts = f;
  const s = d.summary;
  view.innerHTML = `
    <div class="fact" id="fact"></div>
    ${d.nextGame ? `<h2>המשחק הבא</h2>${matchCard(d.nextGame, { label: d.nextGame.isHome ? '🏠 משחק בית' : '✈️ משחק חוץ' })}` : ''}
    ${d.upcoming.length ? `<div class="card">${d.upcoming.map(gameRow).join('')}</div>` : ''}
    ${d.injuries.length ? `<h2>🩹 פצועים <small>מעודכן מאתר המועדון</small></h2><div class="card">${d.injuries.map(injRow).join('')}</div>` : ''}
    ${d.hot.length ? `<h2>🔥 השחקנים החמים <small>3 משחקים אחרונים לעומת ממוצע העונה</small></h2>
      <div class="card hot">${d.hot.map(hotRow).join('')}</div>` : ''}
    ${d.lastGame ? `<h2>המשחק האחרון</h2>${matchCard(d.lastGame, { label: ourScore(d.lastGame)[0] > ourScore(d.lastGame)[1] ? '✅ ניצחון' : '❌ הפסד' })}
      ${d.lastGameTop?.ours ? `<div class="card"><div class="mvp">${img(d.lastGameTop.ours.headshot)}<div><div class="line">המצטיין של מכבי</div><div class="big">${esc(d.lastGameTop.ours.name)}</div><div class="line">${d.lastGameTop.ours.pts} נק' · ${d.lastGameTop.ours.reb} ריב' · ${d.lastGameTop.ours.ast} אס' · מדד ${d.lastGameTop.ours.pir}</div></div></div></div>` : ''}` : ''}
    <h2>מאזן העונה</h2>
    <div class="records">${Object.entries(d.records).map(([k, r]) => `<div class="stat"><b>${r.won}<small class="muted"> נ' </small>${r.lost}<small class="muted"> ה'</small></b><span>${esc(r.compHe)}</span></div>`).join('')}</div>
    <h2>מכבי ביורוליג <small>${d.standing ? `מקום ${d.standing.position} בטבלה` : ''}${d.ilStanding ? ` · ליגת העל: מקום ${d.ilStanding.position}` : ''}</small></h2>
    <div class="stats-grid">
      <div class="stat"><b>${s.won}</b><span>ניצחונות</span></div>
      <div class="stat"><b>${s.lost}</b><span>הפסדים</span></div>
      <div class="stat"><b>${s.ptsFor}</b><span>נק' למשחק</span></div>
      <div class="stat"><b>${s.ptsAgainst}</b><span>ספיגה</span></div>
      <div class="stat"><b>${d.teamAvg.reb}</b><span>ריבאונדים</span></div>
      <div class="stat"><b>${d.teamAvg.ast}</b><span>אסיסטים</span></div>
      <div class="stat"><b>${d.teamAvg.threePct ?? '-'}%</b><span>מהשלוש</span></div>
      <div class="stat"><b>${s.homeWon}/${s.homeWon + s.homeLost}</b><span>ניצחונות בבית</span></div>
    </div>
    <div class="card" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span class="muted">5 משחקים אחרונים</span>${formBadges(s.form)}</div>
    <h2>מובילי הקבוצה</h2>
    <div class="leaders">${d.leaders.map((l) => `<a class="card leader" href="#/player/${l.code}">${img(l.headshot)}<div><div class="val">${l.value}</div><div class="small muted">${STAT_HE[l.stat]} למשחק</div><div class="small"><b>${esc(l.name)}</b></div></div></a>`).join('')}</div>
    <div class="foot">אפליקציית אוהדים לא רשמית · נתונים: יורוליג, מנהלת ליגת העל ואתר מכבי · עודכן ${d.updatedAt ? fmtDate(d.updatedAt, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>`;
  renderFact();
}

const hotRow = (h) => `<a class="player-row" href="#/player/${h.code}">${img(h.headshot)}
  <div class="info"><div class="name">${esc(h.name)} <span class="flame">🔥 +${h.delta}</span></div>
  <div class="trend">מדד <b>${h.recentPir}</b> לעומת ${h.seasonPir} בעונה · <b>${h.recentPts}</b> נק' לעומת ${h.seasonPts}</div>
  <div class="trend">${h.lastGames.map((g) => `${g.pts} נק' מול ${esc(g.opp)}`).join(' · ')}</div></div></a>`;

function gameRow(g) {
  const opp = g.isHome ? g.away : g.home;
  const [us, them] = ourScore(g);
  return `<a class="game-row" href="#/game/${g.id}">${crest(opp, 36)}
    <div><div class="opp">${g.isHome ? '' : '@ '}${esc(opp.nameHe)}</div><div class="meta"><span class="comp comp-${g.comp}">${esc(g.compHe)}</span> ${dayDate(g.date)} · ${g.timeTBD ? 'שעה טרם נקבעה' : hour(g.date)}</div></div>
    <div class="res">${g.status === 'result' ? `<span dir="ltr">${us} - ${them}</span> ${resultBadge(g)}` : `<span class="meta">${g.isHome ? 'בית' : 'חוץ'}</span>`}</div></a>`;
}

let gamesComp = 'all';
let gamesStatus = 'next';
async function games() {
  const list = await api('games');
  const draw = () => {
    const f = list
      .filter((g) => gamesComp === 'all' || g.comp === gamesComp || (gamesComp === 'cups' && /cup/.test(g.comp)))
      .filter((g) => gamesStatus === 'all' || (gamesStatus === 'done' ? g.status === 'result' : g.status !== 'result'));
    if (gamesStatus === 'done') f.reverse();
    view.innerHTML = `<h2>לוח משחקים <small>כל המפעלים</small></h2>
      <div class="chips">${[['all', 'הכל'], ['euroleague', 'יורוליג'], ['league', 'ליגת העל'], ['cups', 'גביעים']].map(([k, l]) => `<button class="chip ${gamesComp === k ? 'active' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
      <div class="chips">${[['next', 'הבאים'], ['done', 'תוצאות'], ['all', 'הכל']].map(([k, l]) => `<button class="chip ${gamesStatus === k ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
      <div class="card">${f.map(gameRow).join('') || '<div class="empty">אין משחקים</div>'}</div>`;
    view.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { gamesComp = b.dataset.c; draw(); }));
    view.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { gamesStatus = b.dataset.s; draw(); }));
  };
  draw();
}

function boxTable(side) {
  return `<div class="card"><h3>${esc(side.nameHe)}</h3><div class="table-wrap"><table>
    <thead><tr><th style="text-align:start">שחקן</th><th>דק'</th><th>נק'</th><th>ריב'</th><th>אס'</th><th>חט'</th><th>שלשות</th><th>מדד</th></tr></thead>
    <tbody>${side.players.map((p) => `<tr><td class="team-cell">${p.starter ? '<b>' : ''}${esc(p.nameHe)}${p.starter ? '</b>' : ''}</td><td>${p.min}</td><td><b>${p.pts}</b></td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.fgm3}/${p.fga3}</td><td>${p.pir}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

function absList(list) {
  if (!list.length) return '<div class="empty">אין נעדרים ידועים 💪</div>';
  return list.map((a) => `<div class="abs">${img(a.headshot)}<div><div><b>${esc(a.name)}</b></div>
    ${a.injury ? `<div class="inj">🩹 ${esc(a.injury)}${a.expectedReturn ? ` · חזרה משוערת: ${esc(a.expectedReturn)}` : ''}</div>` : ''}
    <div class="why">${a.missedGames ? `לא שיחק ב-${a.missedGames} ${a.missedGames === 1 ? 'משחק היורוליג האחרון' : 'משחקי היורוליג האחרונים'}` : 'שיחק במשחק האחרון'}${a.note ? ` · ${esc(a.note)}` : ''}${a.link ? ` · <a href="${esc(a.link)}" target="_blank" rel="noopener">לעדכון ↗</a>` : ''}</div></div></div>`).join('');
}

async function game(id) {
  const d = await api(`games/${id}`);
  const g = d.game;
  let html = `<a class="back" href="#/games">→ חזרה ללוח המשחקים</a>${matchCard(g, { link: false })}`;
  if (g.url) html += `<a class="cta" href="${esc(g.url)}" target="_blank" rel="noopener">${g.status === 'result' ? 'סטטיסטיקה מלאה באתר מנהלת הליגה ↗' : 'דף המשחק באתר מנהלת הליגה ↗'}</a>`;
  if (d.box) {
    if (d.top?.overall) html += `<h2>⭐ השחקן המוביל במשחק</h2><div class="card"><div class="mvp">${img(d.top.overall.headshot, 'avatar lg')}<div><div class="big">${esc(d.top.overall.name)}</div><div class="line">${esc(d.top.overall.teamName)}</div><div class="line">${d.top.overall.pts} נק' · ${d.top.overall.reb} ריב' · ${d.top.overall.ast} אס' · מדד ${d.top.overall.pir}</div></div></div></div>`;
    html += `<h2>סטטיסטיקה</h2>${boxTable(d.box.home)}${boxTable(d.box.away)}`;
  }
  const p = d.preview;
  if (p && g.status !== 'result') {
    const h = p.h2h;
    const theirsAbs = p.absences.theirs;
    html += `<h2>🩹 פצועים ונעדרים <small>נבדק ${fmtDate(p.builtAt, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></h2>
      <div class="${theirsAbs ? 'split' : ''}"><div class="card"><h3>מכבי</h3>${absList(p.absences.ours)}</div>${theirsAbs ? `<div class="card"><h3>${esc(p.opp.name)}</h3>${absList(theirsAbs)}</div>` : ''}</div>
      <h2>⚔️ מפגשי עבר מול ${esc(p.opp.name)} <small>העונה ושתי העונות הקודמות</small></h2>
      <div class="card">${h.meetings.length ? `<div class="rec"><div class="w"><b>${h.record.won}</b><span class="small muted">ניצחונות מכבי</span></div><div class="l"><b>${h.record.lost}</b><span class="small muted">ניצחונות ${esc(p.opp.name)}</span></div></div>
      <div class="small muted" style="text-align:start">תוצאה: מכבי - יריבה</div>
      ${h.meetings.map((m) => `<div class="h2h"><span><span class="badge ${m.win ? 'W' : 'L'}">${m.win ? 'נ' : 'ה'}</span> ${fmtDate(m.date, { day: 'numeric', month: 'numeric', year: 'numeric' })} · ${m.home ? 'בבית' : 'בחוץ'} · <span class="comp comp-${m.comp}">${esc(m.compHe)}</span></span><span class="sc" dir="ltr">${m.us} - ${m.them}</span></div>`).join('')}`
      : '<div class="empty">אין מפגשים קודמים בעונות האחרונות</div>'}</div>
      ${h.lastMeetingTop?.overall ? `<h2>⭐ המוביל במפגש האחרון</h2><div class="card"><div class="mvp">${img(h.lastMeetingTop.overall.headshot, 'avatar lg')}<div><div class="big">${esc(h.lastMeetingTop.overall.name)}</div><div class="line">${esc(h.lastMeetingTop.overall.teamName)}</div><div class="line">${h.lastMeetingTop.overall.pts} נק' · ${h.lastMeetingTop.overall.reb} ריב' · ${h.lastMeetingTop.overall.ast} אס' · מדד ${h.lastMeetingTop.overall.pir}</div></div></div>
        ${h.lastMeetingTop.ours && h.lastMeetingTop.ours.code !== h.lastMeetingTop.overall.code ? `<div class="small muted" style="margin-top:8px">המצטיין של מכבי: <b>${esc(h.lastMeetingTop.ours.name)}</b> – ${h.lastMeetingTop.ours.pts} נק', מדד ${h.lastMeetingTop.ours.pir}</div>` : ''}</div>`
        : h.lastMeeting?.url ? `<a class="cta" href="${esc(h.lastMeeting.url)}" target="_blank" rel="noopener">המובילים במפגש האחרון – באתר המנהלת ↗</a>` : ''}
      <h2>🔥 שחקנים חמים <small>לפי משחקי היורוליג האחרונים</small></h2>
      <div class="${p.hot.theirs ? 'split' : ''}"><div class="card hot"><h3>מכבי</h3>${p.hot.ours.map(hotRow).join('') || '<div class="empty">אין שחקן בכושר חריג כרגע</div>'}</div>
      ${p.hot.theirs ? `<div class="card hot"><h3>${esc(p.opp.name)}</h3>${p.hot.theirs.map(hotRow).join('') || '<div class="empty">אין שחקן בכושר חריג כרגע</div>'}</div>` : ''}</div>
      ${p.oppStanding ? `<h2>בטבלה <small>${esc(p.oppStanding.table)}</small></h2><div class="card"><div class="h2h"><span>מכבי – מקום ${p.ourStanding?.position ?? '-'}</span><span>${p.ourStanding?.won ?? 0} נ' / ${p.ourStanding?.lost ?? 0} ה'</span></div><div class="h2h"><span>${esc(p.opp.name)} – מקום ${p.oppStanding.position}</span><span>${p.oppStanding.won} נ' / ${p.oppStanding.lost} ה'</span></div></div>` : ''}`;
  } else if (g.status !== 'result') {
    html += `<div class="card empty" style="margin-top:10px">התצוגה המקדימה (פצועים, מפגשי עבר ושחקנים חמים) תתעדכן לקראת המשחק.</div>`;
  }
  view.innerHTML = html;
}

let playersSort = 'pts';
let playersComp = 'euroleague';
async function players() {
  const d = await api('players');
  const draw = () => {
    const src = playersComp === 'euroleague' ? d.euroleague.filter((p) => p.onRoster || p.gp) : d.league;
    const rows = [...src].sort((a, b) => (b[playersSort] || 0) - (a[playersSort] || 0));
    const row = (p) => {
      const inner = `${playersComp === 'euroleague' ? img(p.headshot) : `<div class="avatar num">${esc(String(Number(p.dorsal)))}</div>`}
        <div class="info"><div class="name">${esc(p.name)}${p.injury ? ' <span title="פצוע">🩹</span>' : ''}</div><div class="sub">#${esc(String(Number(p.dorsal)))}${p.positionHe ? ` · ${esc(p.positionHe)}` : ''} · ${p.gp || 0} משחקים</div></div>
        <div class="nums"><div><b>${p.pts ?? '-'}</b>נק'</div><div><b>${p.reb ?? '-'}</b>ריב'</div><div><b>${p.ast ?? '-'}</b>אס'</div><div><b>${p.pir ?? '-'}</b>מדד</div></div>`;
      return playersComp === 'euroleague' ? `<a class="player-row" href="#/player/${p.code}">${inner}</a>` : `<div class="player-row">${inner}</div>`;
    };
    view.innerHTML = `<h2>שחקני מכבי <small>ממוצעים למשחק</small></h2>
      <div class="chips">${[['euroleague', 'יורוליג'], ['league', 'ליגת העל']].map(([k, l]) => `<button class="chip ${playersComp === k ? 'active' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
      <div class="chips">${['pts', 'reb', 'ast', 'pir'].map((k) => `<button class="chip ${playersSort === k ? 'active' : ''}" data-s="${k}">${STAT_HE[k]}</button>`).join('')}</div>
      <div class="card">${rows.map(row).join('') || '<div class="empty">אין נתונים עדיין</div>'}</div>
      ${playersComp === 'league' && d.leagueTeamAvg ? `<h2>מכבי בליגת העל</h2><div class="stats-grid">
        <div class="stat"><b>${d.leagueTeamAvg.pts}</b><span>נק' למשחק</span></div><div class="stat"><b>${d.leagueTeamAvg.reb}</b><span>ריבאונדים</span></div>
        <div class="stat"><b>${d.leagueTeamAvg.ast}</b><span>אסיסטים</span></div><div class="stat"><b>${esc((d.leagueTeamAvg.fg3.match(/\(([^)]+)\)/) || [])[1] || '-')}</b><span>מהשלוש</span></div></div>` : ''}`;
    view.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { playersComp = b.dataset.c; draw(); }));
    view.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { playersSort = b.dataset.s; draw(); }));
  };
  draw();
}

async function player(code) {
  const p = await api(`players/${code}`);
  const age = p.birthDate ? Math.floor((Date.now() - new Date(p.birthDate)) / 31557600000) : null;
  view.innerHTML = `<a class="back" href="#/players">→ חזרה לשחקנים</a>
    <div class="card profile">${img(p.headshot, 'avatar lg')}<div><h1>${esc(p.name)}</h1>
      <div class="muted">#${esc(p.dorsal)} · ${esc(p.positionHe || '')}${age ? ` · גיל ${age}` : ''}${p.height ? ` · ${p.height} ס"מ` : ''}</div>
      ${p.injury ? `<div class="inj" style="color:var(--loss);font-weight:700;margin-top:4px">🩹 ${esc(p.injury.injury)}${p.injury.expectedReturn ? ` · היעדרות: ${esc(p.injury.expectedReturn)}` : ''}</div>` : ''}</div></div>
    ${p.league ? `<h2>ליגת העל <small>${p.league.gp} משחקים</small></h2><div class="stats-grid"><div class="stat"><b>${p.league.pts}</b><span>נקודות</span></div><div class="stat"><b>${p.league.reb}</b><span>ריבאונדים</span></div><div class="stat"><b>${p.league.ast}</b><span>אסיסטים</span></div><div class="stat"><b>${p.league.pir}</b><span>מדד</span></div></div><h2>יורוליג</h2>` : ''}
    ${p.gp ? `<div class="stats-grid" style="margin-top:10px">
      <div class="stat"><b>${p.pts}</b><span>נקודות</span></div><div class="stat"><b>${p.reb}</b><span>ריבאונדים</span></div>
      <div class="stat"><b>${p.ast}</b><span>אסיסטים</span></div><div class="stat"><b>${p.pir}</b><span>מדד</span></div>
      <div class="stat"><b>${p.min}</b><span>דקות</span></div><div class="stat"><b>${p.fgPct ?? '-'}%</b><span>מהשדה</span></div>
      <div class="stat"><b>${p.threePct ?? '-'}%</b><span>מהשלוש</span></div><div class="stat"><b>${p.ftPct ?? '-'}%</b><span>מהעונשין</span></div></div>
    <h2>משחק אחר משחק</h2>
    <div class="card"><div class="table-wrap"><table><thead><tr><th style="text-align:start">יריבה</th><th>דק'</th><th>נק'</th><th>ריב'</th><th>אס'</th><th>מדד</th></tr></thead>
    <tbody>${p.games.map((g) => `<tr><td class="team-cell"><a href="#/game/${g.gameCode}">${esc(g.oppName)}</a></td><td>${g.min}</td><td><b>${g.pts}</b></td><td>${g.reb}</td><td>${g.ast}</td><td>${g.pir}</td></tr>`).join('')}</tbody></table></div></div>`
    : '<div class="card empty" style="margin-top:10px">עדיין לא שיחק ביורוליג העונה</div>'}`;
}

let standingsComp = 'euroleague';
async function standings() {
  const d = await api('standings');
  const draw = () => {
    const el = standingsComp === 'euroleague';
    const t = el ? d.euroleague : d.league;
    view.innerHTML = `<h2>${el ? 'טבלת היורוליג' : 'טבלת ליגת העל'} <small>${el ? `אחרי מחזור ${t.round}` : ''}</small></h2>
      <div class="chips">${[['euroleague', 'יורוליג'], ['league', 'ליגת העל']].map(([k, l]) => `<button class="chip ${standingsComp === k ? 'active' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
      <div class="card table-wrap"><table><thead><tr><th>#</th><th style="text-align:start">קבוצה</th><th>מש'</th><th>נ'</th><th>ה'</th><th>הפרש</th>${el ? '<th>כושר</th>' : "<th>נק'</th>"}</tr></thead>
      <tbody>${t.teams.map((x) => `<tr class="${x.us ? 'us' : ''} ${el ? (x.position <= 6 ? 'zone-po' : x.position <= 10 ? 'zone-pi' : '') : x.position <= 8 ? 'zone-po' : ''}">
        <td>${x.position}</td><td class="team-cell"><div>${x.crest ? `<img src="${esc(x.crest)}" alt="" loading="lazy" />` : ''}${esc(x.nameHe)}</div></td>
        <td>${x.played}</td><td>${x.won}</td><td>${x.lost}</td><td dir="ltr">${esc(x.diff)}</td><td>${el ? formBadges(x.form.slice(-3)) : x.points}</td></tr>`).join('')}</tbody></table>
      <div class="legend">${el ? '<span><i style="background:var(--win)"></i>פלייאוף (1-6)</span><span><i style="background:#e6a700"></i>פליי-אין (7-10)</span>' : '<span><i style="background:var(--win)"></i>פלייאוף (1-8)</span>'}</div></div>`;
    view.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { standingsComp = b.dataset.c; draw(); }));
  };
  draw();
}

// ---------- ניתוב ----------
const routes = [
  [/^#?\/?$/, home, 'home'],
  [/^#\/games$/, games, 'games'],
  [/^#\/game\/(\w+)$/, game, 'games'],
  [/^#\/players$/, players, 'players'],
  [/^#\/player\/(\w+)$/, player, 'players'],
  [/^#\/standings$/, standings, 'standings'],
];
async function route() {
  const h = location.hash || '#/';
  for (const [re, fn, tab] of routes) {
    const m = h.match(re);
    if (!m) continue;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    view.innerHTML = '<div class="loading">טוען…</div>';
    try { await fn(...m.slice(1)); } catch (e) { view.innerHTML = `<div class="empty">אופס, לא הצלחנו לטעון את הנתונים (${esc(e.message)})</div>`; }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);
route();

// ---------- PWA + פוש ----------
const dlg = document.getElementById('pushDialog');
const bell = document.getElementById('bell');
const status = document.getElementById('pushStatus');
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let swReg = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(async (reg) => {
    swReg = reg;
    const sub = await reg.pushManager?.getSubscription();
    bell.classList.toggle('on', !!sub);
  });
}

const b64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

bell.onclick = async () => {
  document.getElementById('iosHint').hidden = !(isIOS && !standalone);
  const sub = await swReg?.pushManager?.getSubscription();
  status.textContent = !('PushManager' in window) ? 'הדפדפן הזה לא תומך בהתראות פוש.' : sub ? '✅ ההתראות פעילות במכשיר הזה.' : 'קבלו התראה כשהמשחק מתחיל ובסיומים מותחים.';
  if (sub) {
    const prefs = await fetch('/api/push/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).then((r) => r.json()).catch(() => null);
    if (prefs) { document.getElementById('prefStart').checked = prefs.start; document.getElementById('prefClose').checked = prefs.close; }
  }
  dlg.showModal();
};

document.getElementById('pushOn').onclick = async () => {
  try {
    if (!swReg) throw new Error('Service worker לא זמין');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { status.textContent = 'לא אושרה הרשאה להתראות. אפשר לשנות בהגדרות הדפדפן.'; return; }
    const { publicKey } = await api('push/key');
    const sub = (await swReg.pushManager.getSubscription()) || (await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }));
    await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub, prefs: { start: document.getElementById('prefStart').checked, close: document.getElementById('prefClose').checked } }),
    });
    bell.classList.add('on');
    status.textContent = '✅ מעולה! ההתראות הופעלו ונשמרו.';
  } catch (e) {
    status.textContent = `לא הצלחנו להפעיל התראות: ${e.message}`;
  }
};
document.getElementById('pushOff').onclick = async () => {
  const sub = await swReg?.pushManager?.getSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
  bell.classList.remove('on');
  status.textContent = 'ההתראות כובו.';
};
