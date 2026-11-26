// אחסון פשוט בקבצי JSON (מספיק לאפליקציה אישית; קל להחליף בהמשך למסד נתונים)
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const cache = new Map();

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(config.dataDir, `${name}.json`);
  let value = fallback;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  cache.set(name, value);
  return value;
}

export function save(name, value) {
  cache.set(name, value);
  const file = path.join(config.dataDir, `${name}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
