// התראות פוש (Web Push / VAPID)
import webpush from 'web-push';
import { config } from './config.js';
import { load, save } from './store.js';

// המפתחות נטענים בפעם הראשונה שצריך אותם (אחרי שהאחסון אותחל).
// אפשר גם לקבוע אותם במשתני סביבה VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
let keys = null;
function ensureKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    keys = load('vapid', null);
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      save('vapid', keys);
    }
  }
  webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey);
  return keys;
}

export const publicKey = () => ensureKeys().publicKey;

const subs = () => load('subscriptions', []);

export function addSubscription(sub, prefs = {}) {
  const list = subs().filter((s) => s.sub.endpoint !== sub.endpoint);
  list.push({ sub, prefs: { start: prefs.start !== false, close: prefs.close !== false }, createdAt: new Date().toISOString() });
  save('subscriptions', list);
}

export function removeSubscription(endpoint) {
  save('subscriptions', subs().filter((s) => s.sub.endpoint !== endpoint));
}

export function getPrefs(endpoint) {
  return subs().find((s) => s.sub.endpoint === endpoint)?.prefs || null;
}

// kind: 'start' | 'close' | 'test'
export async function sendPush(kind, payload) {
  ensureKeys();
  const list = subs();
  const dead = [];
  let sent = 0;
  await Promise.all(
    list
      .filter((s) => kind === 'test' || s.prefs[kind])
      .map(async (s) => {
        try {
          await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 60 * 30 });
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.sub.endpoint);
          else console.warn('[push] failed', e.statusCode || e.message);
        }
      }),
  );
  if (dead.length) save('subscriptions', subs().filter((s) => !dead.includes(s.sub.endpoint)));
  console.log(`[push] ${kind}: נשלח ל-${sent} מכשירים`);
  return sent;
}
