// משחקים מהאתר הרשמי של מכבי (maccabi.co.il) – משלים מפעלים שלא מופיעים ב-API של היורוליג
// ובאתר מנהלת ליגת העל, בעיקר גביע המדינה (שמנוהל ע"י איגוד הכדורסל) וטורנירי הכנה.
// רשימת המשחקים נלקחת ממפת האתר הציבורית (sitemap) ומדף הבית, ובכל דף משחק יש אובייקט
// maccabiGameData עם המפעל, התאריך, השעה, התוצאה והקבוצות.
import { load, save } from './store.js';

const SITE = 'https://maccabi.co.il';
const UA = { 'user-agent': 'Mozilla/5.0 (fan-app)' };

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// תאריך מתוך ה-slug: .../games/<יריבה>-27-09-2026/ או ...-08-11-2026-2/
function slugDate(url) {
  const m = decodeURIComponent(url).match(/-(\d{2})-(\d{2})-(\d{4})(?:-\d+)?\/?$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function listGameUrls() {
  const urls = new Set();
  const index = await get(`${SITE}/wp-sitemap.xml`);
  const maps = [...index.matchAll(/<loc>([^<]*wp-sitemap-posts-game-\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  for (const m of maps) {
    const xml = await get(m);
    for (const x of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(x[1]);
  }
  // משחקים עתידיים מופיעים בדף הבית ובלוח המשחקים
  for (const page of [`${SITE}/`, `${SITE}/game-board/`]) {
    try {
      const html = await get(page);
      for (const x of html.matchAll(/href="(https:\/\/maccabi\.co\.il\/games\/[^"]+)"/g)) urls.add(x[1]);
    } catch {}
  }
  return [...urls];
}

const COMP = [
  [/גביע המדינה/, 'statecup'],
  [/גביע הליגה|גביע ווינר/, 'cup'],
  [/סופרקאפ|סופר קאפ/, 'supercup'],
  [/יורוליג|אירופה/, 'euroleague'],
  [/ליגת העל|ליגת ווינר|ליגה/, 'league'],
];
const classify = (name) => COMP.find(([re]) => re.test(name || ''))?.[1] || 'other';

function parseGame(html, url) {
  const i = html.indexOf('maccabiGameData = ');
  if (i < 0) return null;
  let d;
  try {
    d = JSON.parse(html.slice(i + 18).match(/^(\{.*?\});?\s*(?:\n|<\/script>|var |window\.)/s)?.[1] || 'null');
  } catch {
    d = null;
  }
  if (!d) {
    // גיבוי: פענוח JSON עד סוף האובייקט
    const s = html.slice(i + 18);
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { end = k + 1; break; }
    }
    if (end < 0) return null;
    d = JSON.parse(s.slice(0, end));
  }
  const team = (t) => ({ name: t?.name || t?.shortName || '', short: t?.shortName || t?.name || '', logo: t?.logo || null });
  const status = d.status === 'FINISHED' ? 'result' : d.isLive ? 'live' : 'scheduled';
  return {
    id: `mc${String(d.gameId).replace(/\D/g, '')}`,
    url,
    competition: d.competition || '',
    comp: classify(d.competition),
    phase: d.phase || '',
    date: d.date,
    time: d.time || null,
    datetime: d.datetime,
    venue: d.venue || d.arena || '',
    status,
    home: { ...team(d.teams?.home), score: Number(d.score?.home) || 0 },
    away: { ...team(d.teams?.away), score: Number(d.score?.away) || 0 },
  };
}

/**
 * מעדכן את המטמון של משחקי האתר לעונה הנתונה (seasonStart/seasonEnd בפורמט YYYY-MM-DD).
 * דפים של משחקים שהסתיימו לא נקראים שוב.
 */
export async function refreshClubGames(seasonStart, seasonEnd) {
  const cache = load('clubgames', {});
  const urls = (await listGameUrls()).filter((u) => {
    const d = slugDate(u);
    return d && d >= seasonStart && d <= seasonEnd;
  });
  let fetched = 0;
  for (const url of urls) {
    const prev = cache[url];
    if (prev?.status === 'result') continue;
    try {
      const g = parseGame(await get(url), url);
      if (g) cache[url] = g;
      fetched++;
    } catch (e) {
      console.warn('[club] game page failed', decodeURIComponent(url), e.message);
    }
  }
  // משאירים רק משחקים מהעונה הנוכחית
  for (const k of Object.keys(cache)) if (!cache[k].date || cache[k].date < seasonStart || cache[k].date > seasonEnd) delete cache[k];
  save('clubgames', cache);
  console.log(`[club] ${Object.keys(cache).length} משחקים מאתר מכבי (${fetched} דפים נקראו)`);
  return Object.values(cache);
}

export const clubGames = () => Object.values(load('clubgames', {}));
