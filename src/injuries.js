// דוח פציעות אוטומטי מתוך האתר הרשמי של מכבי (maccabi.co.il).
// האתר מפרסם עדכוני פציעות ככתבות, למשל: "איפה לונדברג ... סובל מקרע חלקי בגיד אכילס.
// ההערכה: היעדרות של בין 4 ל-6 שבועות". כאן מחפשים כתבות כאלה ומחלצים מהן את הפרטים.

const WP = 'https://maccabi.co.il/wp-json/wp/v2/posts';
const KEYWORDS = ['פציעה', 'פצוע', 'נפצע', 'ייעדר', 'יחמיץ', 'קרע', 'נקע', 'MRI'];
const INJURY_RE = /(פציע|נפצע|ייעדר|יחמיץ|קרע|נקע|מתיחה|שבר|פרק|נותח|ניתוח|דלקת|MRI|כאבים|בדיקה|בדיקות|לא ישחק|מחוץ לסגל)/;
const DURATION_RE = /(בין \d+ ל-?\d+ (?:ימים|שבועות|חודשים)|\d+(?:-\d+)? (?:ימים|שבועות|חודשים)|(?:מספר|כמה) (?:ימים|שבועות|חודשים)|(?:כ-?)?(?:שבוע|שבועיים|חודש|חודשיים)(?: ימים)?|עד סוף העונה|לשארית העונה|יום-יומיים|ימים ספורים)/;
const RETURN_RE = /(חזר לאימונים|חזר לשחק|שב לאימונים|כשיר|יחזור לסגל|חזר לסגל|השתלב באימונים)/;

const decode = (s) =>
  s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;/g, '–');
const plain = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function search(kw, after) {
  const url = `${WP}?per_page=20&orderby=date&order=desc&_fields=id,date,link,title,content&after=${after}&search=${encodeURIComponent(kw)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (fan-app)' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// שמות לחיפוש לכל שחקן: שם מלא בעברית, שם משפחה, ושמות חלופיים (למשל "טי.ג'יי ליף")
function nameVariants(heName) {
  const norm = heName.replace(/[׳’`"]/g, "'").replace(/'+/g, "'").trim();
  const parts = norm.split(' ');
  const v = new Set([norm, parts.slice(-2).join(' ')]);
  // שם משפחה לבד רק אם הוא ארוך מספיק כדי לא לתפוס מילים רגילות
  if (parts.at(-1).length >= 4) v.add(parts.at(-1));
  return [...v].filter((s) => s.length >= 3);
}

/**
 * @param roster [{code, names:[...]}]  שמות בעברית לכל שחקן (מכמה מקורות)
 * @param daysBack כמה ימים אחורה לחפש
 * מחזיר את העדכון האחרון לכל שחקן: {playerCode, injury, duration, returned, date, title, link, sentence}
 */
export async function fetchInjuryNews(roster, daysBack = 75) {
  const after = new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 19);
  const posts = new Map();
  for (const kw of KEYWORDS) {
    try {
      for (const p of await search(kw, after)) posts.set(p.id, p);
    } catch (e) {
      console.warn('[injuries] search failed', kw, e.message);
    }
  }
  const NEAR_INJURY = /(פצוע|נפצע|קרע|נקע|מתיחה|שבר|נותח|ניתוח|ייעדר|יחמיץ|סובל|לא חזר(?:ו)? לכשירות|לא כשיר|לא ישחק|מחוץ לסגל|בדיקת MRI|פרק את)/;
  const latest = new Map();
  const sorted = [...posts.values()].sort((a, b) => b.date.localeCompare(a.date));
  for (const p of sorted) {
    const body = plain(p.content.rendered).replace(/[’`]/g, "'");
    const title = plain(p.title.rendered).replace(/[’`]/g, "'");
    const sentences = body.split(/(?<=[.!?])\s+/);
    for (const pl of roster) {
      if (latest.has(pl.code)) continue; // כבר יש עדכון חדש יותר
      const variants = [...new Set(pl.names.flatMap(nameVariants))];
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        const v = variants.find((x) => s.includes(x));
        if (!v) continue;
        // מילת הפציעה חייבת להופיע קרוב לשם השחקן (עד ~70 תווים אחריו) ולא אחרי שם של שחקן אחר
        const after = s.slice(s.indexOf(v) + v.length, s.indexOf(v) + v.length + 70);
        const cut = after.split(/[,;]| ו(?=[א-ת]{2,} [א-ת])/)[0];
        const near = NEAR_INJURY.test(cut) || (NEAR_INJURY.test(after) && /(שנפצע|עבר|סובל|אובחן)/.test(after));
        const titleHit = variants.some((x) => title.includes(x)) && INJURY_RE.test(title + ' ' + s);
        if (!near && !titleHit) continue;
        const window = sentences.slice(i, i + 3).join(' ');
        latest.set(pl.code, {
          playerCode: pl.code,
          playerName: pl.names[0],
          injury: extractInjury(s),
          duration: window.match(DURATION_RE)?.[0] || null,
          returned: RETURN_RE.test(window) && !/(לא חזר|ייעדר|יחמיץ)/.test(window),
          date: p.date,
          title,
          link: p.link,
          sentence: s.slice(0, 280),
        });
        break;
      }
    }
  }
  return [...latest.values()];
}

// מנסה לחלץ את תיאור הפציעה עצמה ("קרע חלקי בגיד אכילס")
function extractInjury(s) {
  const m =
    s.match(/(?:סובל מ|סובלת מ|אובחן |אובחנה |עם )([^,.]{3,60})/) ||
    s.match(/((?:קרע|נקע|מתיחה|שבר|דלקת|פריקה|פרק)[^,.]{0,50})/);
  if (m && !/,/.test(m[1])) return m[1].replace(/^ה(?=קרע|נקע)/, '').trim();
  if (/לא חזר(?:ו)? לכשירות|לא כשיר/.test(s)) return 'לא בכשירות מלאה';
  return 'פצוע (פרטים בעדכון המועדון)';
}
