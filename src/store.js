// אחסון: מטמון בזיכרון + קבצי JSON.
// בשרתים חינמיים (כמו Render) הקבצים נמחקים בכל הפעלה מחדש, ולכן מה שחשוב לשמור לאורך זמן
// (הרשמות להתראות, פציעות ידניות, מפתחות ההתראות) נשמר גם במסד נתונים Postgres אם הוגדר DATABASE_URL.
// שאר הנתונים (סטטיסטיקה, לוח משחקים) נמשכים מחדש מהמקורות בכל הפעלה.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

// מפתחות שנשמרים גם במסד הנתונים
const DURABLE = new Set(['subscriptions', 'injuries', 'vapid', 'notified']);

const cache = new Map();
let pool = null;

export async function initStore() {
  if (!process.env.DATABASE_URL) {
    console.log('[store] אין DATABASE_URL – שמירה בקבצים בלבד');
    return;
  }
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  await pool.query('CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await pool.query('SELECT key, value FROM kv WHERE key = ANY($1)', [[...DURABLE]]);
  for (const r of rows) {
    cache.set(r.key, r.value);
    writeFile(r.key, r.value);
  }
  console.log(`[store] מחובר למסד הנתונים (${rows.length} רשומות נטענו)`);
}

function writeFile(name, value) {
  const file = path.join(config.dataDir, `${name}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try {
    value = JSON.parse(fs.readFileSync(path.join(config.dataDir, `${name}.json`), 'utf8'));
  } catch {}
  cache.set(name, value);
  return value;
}

export function save(name, value) {
  cache.set(name, value);
  writeFile(name, value);
  if (pool && DURABLE.has(name)) {
    pool
      .query('INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [name, JSON.stringify(value)])
      .catch((e) => console.error('[store] שמירה במסד הנתונים נכשלה', name, e.message));
  }
}
