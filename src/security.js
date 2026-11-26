// אבטחה: כותרות אבטחה לדפדפן, הגבלת קצב בקשות, ובדיקת קלט.
import crypto from 'node:crypto';

// ---- כותרות אבטחה + מדיניות תוכן (CSP): הדפדפן יריץ רק קוד מהאתר שלנו ----
const IMG_HOSTS = 'https://media-cdn.cortextech.io https://media-cdn.incrowdsports.com https://basket.co.il https://www.basket.co.il https://maccabi.co.il';
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: ${IMG_HOSTS}`,
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000',
  });
  res.removeHeader('X-Powered-By');
  next();
}

// ---- הגבלת קצב פשוטה לפי כתובת IP ----
export function rateLimit({ windowMs, max, message = 'יותר מדי בקשות, נסו שוב מאוחר יותר' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, (h = { count: 0, reset: now + windowMs }));
    if (++h.count > max) return res.status(429).json({ error: message });
    next();
  };
}

// ---- סיסמת ניהול: השוואה בזמן קבוע + חסימה אחרי ניסיונות כושלים ----
const failures = new Map();
export function adminGuard(token) {
  const expected = crypto.createHash('sha256').update(String(token)).digest();
  const weak = !token || token === 'change-me' || String(token).length < 16;
  if (weak) console.warn('[security] ADMIN_TOKEN חלש או לא מוגדר – עמוד הניהול חסום עד שיוגדר טוקן של 16 תווים לפחות');
  return (req, res, next) => {
    if (weak) return res.status(503).json({ error: 'עמוד הניהול לא הוגדר (ADMIN_TOKEN)' });
    const f = failures.get(req.ip);
    if (f && f.until > Date.now()) return res.status(429).json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד 15 דקות' });
    const given = crypto.createHash('sha256').update(String(req.get('x-admin-token') || '')).digest();
    if (crypto.timingSafeEqual(given, expected)) {
      failures.delete(req.ip);
      return next();
    }
    const n = (f?.count || 0) + 1;
    failures.set(req.ip, { count: n, until: n >= 10 ? Date.now() + 15 * 60 * 1000 : 0 });
    return res.status(401).json({ error: 'טוקן שגוי' });
  };
}

// ---- בדיקת הרשמה להתראות: רק משירותי ההתראות של הדפדפנים הגדולים ----
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function validSubscription(sub) {
  try {
    if (!sub || typeof sub !== 'object') return false;
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:' || String(sub.endpoint).length > 1000) return false;
    if (!PUSH_HOSTS.some((re) => re.test(u.hostname))) return false;
    const { p256dh, auth } = sub.keys || {};
    return typeof p256dh === 'string' && typeof auth === 'string' && p256dh.length < 200 && auth.length < 100 && /^[\w-]+=*$/.test(p256dh) && /^[\w-]+=*$/.test(auth);
  } catch {
    return false;
  }
}

// טקסט חופשי מעמוד הניהול: מחרוזת, בלי תווי בקרה, באורך מוגבל
export const cleanText = (v, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
