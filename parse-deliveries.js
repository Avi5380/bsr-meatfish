// Parse the "משלוחים גולד פיש" chat into structured charges.
// Each chat message from a sender (מני / מוטי בק / רוני) that mentions an amount
// becomes a "charge". We extract: type, amount, driver, worker, city, hours, km, count.
// The user can refine each charge in the UI.

import { readFileSync, writeFileSync } from 'fs';

const paths = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/chat-paths.json', 'utf8').replace(/^﻿/, ''));
const CHAT_FILE = paths.chat2;

const headRe = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}:\d{2})\s+-\s+(.+?):\s+([\s\S]*)$/;

function parseChat(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const msgs = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/[‎‏‪-‮⁦-⁩]/g, '');
    const m = headRe.exec(line);
    if (m) {
      if (cur) msgs.push(cur);
      const [, dd, mm, yyyy, hhmm, speaker, body] = m;
      cur = { date: `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,
              time: hhmm, speaker: speaker.trim(), body };
    } else if (cur) {
      cur.body += '\n' + line;
    }
  }
  if (cur) msgs.push(cur);
  return msgs;
}

// City normalizer — \b doesn't work with Hebrew, use plain string match.
const CITIES = [
  { variants: ['בית שמש','ב"ש',"ב'ש",'בש '],            name: 'בית שמש' },
  { variants: ['ירושלים','ירושליים','י-ם','י"ם'],       name: 'ירושלים' },
  { variants: ['טלזסטון','טלז סטון'],                    name: 'טלזסטון' },
  { variants: ['צור הדסה'],                              name: 'צור הדסה' },
  { variants: ['רמות'],                                  name: 'רמות' },
  { variants: ['גילה'],                                  name: 'גילה' },
  { variants: ['קרית יובל'],                             name: 'קרית יובל' },
  { variants: ['שמגר'],                                  name: 'שמגר' },
  { variants: ['מודיעין'],                               name: 'מודיעין' },
  { variants: ['ביתר'],                                  name: 'ביתר' },
  { variants: ['גוש דן'],                                name: 'גוש דן' },
  { variants: ['פתח תקווה'],                             name: 'פתח תקווה' },
];

const WORKER_NAMES = [
  'אליעזר','בוקי','סנדר','אהרון','שלמה','אבי','דוד','ישראל',
  'יוסף','חיים','משה','שמואל','יעקב','אבישי','אריאל','עמיחי','איתן','אדם',
];
const VENDOR_NAMES = [
  'טמבור','מכולת','שופר סל','שופרסל','רמי לוי','אוסם','חברה לחשמל','פלאפון','בזק',
  'אלקטרה','קלאב מרקט','איקאה','אייס','ביתילי','דלק','פינצטה','מנעול',
  'אריזה','שנאי','התקנת',
];

function extractAmount(text) {
  // last "number ₪/שח/שקל" or trailing standalone number 50-5000
  const re1 = /(\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?)\s*(?:ש["']?ח|₪|שקל)/g;
  let m, last = null;
  while ((m = re1.exec(text)) !== null) last = parseFloat(m[1].replace(/,/g, ''));
  if (last !== null) return { value: last, source: 'with_currency' };
  // standalone integer (likely amount) — pick the largest in 30-5000 range
  const nums = [...text.matchAll(/(?<!\d)(\d{2,4})(?!\d)/g)]
    .map(m => parseInt(m[1]))
    .filter(n => n >= 20 && n <= 9999);
  if (nums.length) return { value: Math.max(...nums), source: 'standalone' };
  return null;
}

function detectCities(text) {
  const found = [];
  for (const c of CITIES) {
    let hit = null;
    for (const v of c.variants) {
      const idx = text.indexOf(v);
      if (idx !== -1) { hit = { idx, v }; break; }
    }
    if (!hit) continue;
    // Try to find a count number near the city (within 8 chars before or after)
    const start = Math.max(0, hit.idx - 8);
    const end = Math.min(text.length, hit.idx + hit.v.length + 8);
    const window = text.slice(start, end);
    const m = /(\d{1,3})/.exec(window);
    found.push({ name: c.name, count: m ? parseInt(m[1]) : null });
  }
  return found;
}

function detectHours(text) {
  // patterns: "4 שעות", "2.5 שעות", "חצי שעה", "8.5 שעות"
  const m = /(\d+(?:\.\d+)?)\s*שעות/.exec(text);
  if (m) return parseFloat(m[1]);
  if (/חצי\s*שעה/.test(text)) return 0.5;
  return null;
}

function detectKm(text) {
  const m = /(\d+)\s*ק["']?מ/.exec(text);
  return m ? parseInt(m[1]) : null;
}

function detectStations(text) {
  // "13 משלוחים", "(13 משלוחים)", "21 תחנות"
  const m = /(\d{1,3})\s*(?:משלוחים|תחנות)/.exec(text);
  return m ? parseInt(m[1]) : null;
}

function detectWorker(text) {
  for (const n of WORKER_NAMES) if (text.includes(n)) return n;
  return null;
}

function detectVendor(text) {
  for (const v of VENDOR_NAMES) if (text.includes(v)) return v;
  return null;
}

function classifyType(text, extracted) {
  // Employee hours: contains hours + worker name (and no city)
  if (extracted.workerName && extracted.hours !== null && extracted.cities.length === 0) {
    return 'employee_hours';
  }
  // Delivery: city found + (count or hours/km)
  if (extracted.cities.length > 0) return 'delivery';
  // Hours-only (no worker name)
  if (extracted.hours !== null) return 'hours';
  // Purchase: vendor mentioned or short message + amount
  if (extracted.vendor) return 'purchase';
  return 'other';
}

const msgs = parseChat(CHAT_FILE);
console.log(`Parsed ${msgs.length} messages from deliveries chat.\n`);

const SENDERS = new Set(['מני','מוטי בק','רוני']);
const charges = [];
for (let i = 0; i < msgs.length; i++) {
  const m = msgs[i];
  if (!SENDERS.has(m.speaker)) continue;
  if (/\.opus|\.jpg|\.pdf|\.mp4/.test(m.body)) continue; // skip media
  const amount = extractAmount(m.body);
  if (!amount) continue;
  const extracted = {
    amount: amount.value,
    amountSource: amount.source,
    cities: detectCities(m.body),
    hours: detectHours(m.body),
    km: detectKm(m.body),
    stations: detectStations(m.body),
    workerName: detectWorker(m.body),
    vendor: detectVendor(m.body),
  };
  const type = classifyType(m.body, extracted);
  // stable id
  const body24 = m.body.replace(/\s+/g, ' ').trim().slice(0, 24);
  const id = `del-${m.date}-${m.time}-${i}-${body24}`;
  charges.push({
    id,
    date: m.date,
    time: m.time,
    speaker: m.speaker,
    type,
    rawBody: m.body.trim(),
    extracted,
  });
}

// Aggregate
const agg = {
  totalCharges: charges.length,
  totalAmount: 0,
  byType: {},
  byMonth: {},
  byDriver: {},
  byCity: {},
  byWorker: {},
};
for (const c of charges) {
  const amt = c.extracted.amount || 0;
  agg.totalAmount += amt;
  agg.byType[c.type] = (agg.byType[c.type] || 0) + amt;
  const mo = c.date.slice(0, 7);
  agg.byMonth[mo] = (agg.byMonth[mo] || 0) + amt;
  agg.byDriver[c.speaker] = (agg.byDriver[c.speaker] || 0) + amt;
  for (const city of c.extracted.cities) agg.byCity[city.name] = (agg.byCity[city.name] || 0) + amt;
  if (c.extracted.workerName) agg.byWorker[c.extracted.workerName] = (agg.byWorker[c.extracted.workerName] || 0) + amt;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: CHAT_FILE,
  aggregations: agg,
  charges,
};
writeFileSync('C:/Users/avraham/meatfish-app/deliveries.json', JSON.stringify(out, null, 2), 'utf8');

console.log('═'.repeat(72));
console.log(`Charges extracted: ${charges.length} | total amount: ${agg.totalAmount.toLocaleString('he-IL')} ₪`);
console.log('═'.repeat(72));
console.log('\n--- by type ---');
for (const [t, v] of Object.entries(agg.byType).sort((a,b)=>b[1]-a[1]))
  console.log(`  ${t.padEnd(18)} ${v.toLocaleString('he-IL').padStart(12)} ₪`);
console.log('\n--- by speaker ---');
for (const [s, v] of Object.entries(agg.byDriver).sort((a,b)=>b[1]-a[1]))
  console.log(`  ${s.padEnd(18)} ${v.toLocaleString('he-IL').padStart(12)} ₪`);
console.log('\n--- by city ---');
for (const [c, v] of Object.entries(agg.byCity).sort((a,b)=>b[1]-a[1]))
  console.log(`  ${c.padEnd(18)} ${v.toLocaleString('he-IL').padStart(12)} ₪`);
console.log('\n--- by worker ---');
for (const [w, v] of Object.entries(agg.byWorker).sort((a,b)=>b[1]-a[1]).slice(0,10))
  console.log(`  ${w.padEnd(18)} ${v.toLocaleString('he-IL').padStart(12)} ₪`);
console.log('\n--- by month (first 12) ---');
for (const [mo, v] of Object.entries(agg.byMonth).sort().slice(0, 24))
  console.log(`  ${mo}: ${v.toLocaleString('he-IL').padStart(10)} ₪`);
