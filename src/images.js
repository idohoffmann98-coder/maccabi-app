// תמונות מהירות: השרת מוריד כל תמונה (שחקן / סמל קבוצה) פעם אחת, מקטין אותה ושומר בדיסק.
// הדפדפן מקבל קובץ קטן (בערך 5-15KB במקום עד 650KB) עם הוראה לשמור אותו לחודש.
// רק מאתרים מוכרים, כדי שהשרת לא ישמש "מתווך" לכל כתובת באינטרנט.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';

const ALLOWED = new Set(['media-cdn.cortextech.io', 'media-cdn.incrowdsports.com', 'basket.co.il', 'www.basket.co.il', 'maccabi.co.il']);
const SIZES = new Set([48, 96, 192]);
const MAX_BYTES = 8 * 1024 * 1024;
const dir = path.join(config.dataDir, 'img');
fs.mkdirSync(dir, { recursive: true });

const inflight = new Map();
const MAX_FILES = 3000;
let made = { count: 0, reset: Date.now() + 60_000 };
function canProduce() {
  if (Date.now() > made.reset) made = { count: 0, reset: Date.now() + 60_000 };
  if (++made.count > 120) return false; // עד 120 תמונות חדשות בדקה
  try {
    return fs.readdirSync(dir).length < MAX_FILES;
  } catch {
    return true;
  }
}

// כתובת ציבורית של תמונה מוקטנת. התמונה נשמרת לפי הכתובת המקורית, כך שתמונה חדשה מקבלת כתובת חדשה.
// kind: 'img' – תמונת שחקן (חיתוך ריבועי מלמעלה), 'logo' – סמל קבוצה (הקטנה בלי חיתוך)
export function imgUrl(src, w = 96, kind = 'img') {
  if (!src) return null;
  return `/${kind}/${w}/${Buffer.from(src).toString('base64url')}`;
}

async function produce(src, w, file, kind) {
  // הפניות מותרות רק בין אתרים מהרשימה (למשל www.basket.co.il ← basket.co.il)
  let url = src;
  let res;
  for (let hop = 0; ; hop++) {
    res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (fan-app)' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status < 300 || res.status >= 400) break;
    const next = new URL(res.headers.get('location') || '', url);
    if (hop >= 3 || next.protocol !== 'https:' || !ALLOWED.has(next.hostname)) throw new Error('redirect not allowed');
    url = next.href;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('too large');
  // ראש וכתפיים: חיתוך מלמעלה (התמונות הן בדרך כלל דיוקן עד המותניים)
  const img = sharp(buf);
  const out = await (kind === 'logo'
    ? img.resize(w, w, { fit: 'inside', withoutEnlargement: true })
    : img.resize(w, w, { fit: 'cover', position: 'top' })
  ).webp({ quality: 80 }).toBuffer();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
  return out;
}

function fileFor(kind, w, src) {
  return path.join(dir, `${crypto.createHash('sha1').update(`${kind}:${w}:${src}`).digest('hex')}.webp`);
}

// הכנה מראש של התמונות המוקטנות (רץ ברקע אחרי כל עדכון נתונים)
export async function warmImages(items) {
  let made = 0;
  for (const { src, w, kind } of items) {
    try {
      if (!src || !ALLOWED.has(new URL(src).hostname)) continue;
      const file = fileFor(kind, w, src);
      if (fs.existsSync(file)) continue;
      await produce(src, w, file, kind);
      made++;
    } catch {}
  }
  if (made) console.log(`[images] הוכנו ${made} תמונות מוקטנות`);
}

export const imageHandler = (kind) => async (req, res) => {
  const w = Number(req.params.w);
  let src;
  try {
    src = Buffer.from(req.params.key, 'base64url').toString('utf8');
    const u = new URL(src);
    if (!/^https?:$/.test(u.protocol) || !SIZES.has(w)) throw new Error('bad');
    // רק מאתרים מוכרים (ולא מפנים לכתובות אחרות, כדי שהשרת לא ישמש להפניה לאתרים זרים)
    if (!ALLOWED.has(u.hostname)) throw new Error('host');
  } catch {
    return res.status(400).end();
  }
  const file = fileFor(kind, w, src);
  try {
    let body;
    if (fs.existsSync(file)) body = fs.readFileSync(file);
    else {
      if (!inflight.has(file)) {
        if (!canProduce()) throw new Error('busy');
        inflight.set(file, produce(src, w, file, kind).finally(() => inflight.delete(file)));
      }
      body = await inflight.get(file);
    }
    res.set({ 'content-type': 'image/webp', 'cache-control': 'public, max-age=2592000, immutable' });
    res.end(body);
  } catch (e) {
    // אם ההקטנה נכשלה – מפנים לתמונה המקורית
    res.set('cache-control', 'no-store').redirect(302, src);
  }
};
