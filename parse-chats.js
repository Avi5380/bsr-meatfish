// Parse WhatsApp chat exports → extract every money mention.
// Build chronological list + yearly aggregates.

import { readFileSync, writeFileSync } from 'fs';

// Load actual paths from external file (Hebrew filenames with RTL marks are
// hard to embed as JS string literals on Windows).
const paths = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/chat-paths.json', 'utf8').replace(/^﻿/, ''));
const CHATS = [
  { label: 'מני (אישי)',  file: paths.chat1 },
  { label: 'משלוחים',    file: paths.chat2 },
];

// Parse one chat file into a list of {date, time, speaker, body} messages.
// WhatsApp format: "DD.MM.YYYY, HH:MM - SPEAKER: BODY"
// Continuation lines (without the date prefix) belong to the previous message.
function parseChat(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const msgs = [];
  let cur = null;
  const headRe = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}:\d{2})\s+-\s+(.+?):\s+([\s\S]*)$/;
  const sysRe  = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}:\d{2})\s+-\s+(.+)$/;
  for (const raw of lines) {
    // strip RTL/LRM marks
    const line = raw.replace(/[‎‏‪-‮⁦-⁩]/g, '');
    const m = headRe.exec(line);
    if (m) {
      if (cur) msgs.push(cur);
      const [, dd, mm, yyyy, hhmm, speaker, body] = m;
      cur = { date: `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,
              time: hhmm, speaker: speaker.trim(), body };
    } else {
      const ms = sysRe.exec(line);
      if (ms && !cur) continue; // system line at start, ignore
      if (cur) cur.body += '\n' + line;
    }
  }
  if (cur) msgs.push(cur);
  return msgs;
}

// Extract money amounts from text. Returns array of {amount, raw, currency}.
// Handles: "200 שקל", "1,000₪", "650 ש''ח", "1960 שקל", "5,500 ש"ח", "13 אלף", "16k"
function extractAmounts(text) {
  const results = [];
  // Pattern 1: number (with optional comma/decimal) followed by שקל/₪/ש"ח
  const re1 = /(?<!\d)(\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?)\s*(?:ש["']?ח|₪|שקל|שקלים)/g;
  let m;
  while ((m = re1.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && n >= 1 && n <= 10000000) results.push({ amount: n, raw: m[0], unit: 'ils' });
  }
  // Pattern 2: "13 אלף", "5 אלף שח"
  const re2 = /(?<!\d)(\d{1,4}(?:\.\d+)?)\s*אלף/g;
  while ((m = re2.exec(text)) !== null) {
    const n = parseFloat(m[1]) * 1000;
    if (!isNaN(n)) results.push({ amount: n, raw: m[0], unit: 'k' });
  }
  // Pattern 3: lone numbers near "מהקופה" / "מהקופה" without explicit currency — likely shekels
  const re3 = /(?<!\d)(\d{2,5})\s*(?=[^\d\n]{0,15}(?:מהקופה|לקופה|מהקופ|המשכורת|מהמשכורת|לחשבון|בחשבון))/g;
  while ((m = re3.exec(text)) !== null) {
    const n = parseInt(m[1]);
    if (n >= 50 && n <= 100000) results.push({ amount: n, raw: m[0].trim(), unit: 'implied' });
  }
  return results;
}

// Categorize the message by what it's about
function categorize(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (/מהקופה|לקופה|בקופה|הקופ/.test(text)) tags.push('קופה');
  if (/משכורת|המשכורת|שכר/.test(text))      tags.push('משכורת');
  if (/חוב|החוב|חובות/.test(text))            tags.push('חוב');
  if (/העברה|להעביר|העב/.test(text))          tags.push('העברה');
  if (/מסרתי|נתתי|העברתי/.test(text))         tags.push('מסירה');
  if (/קיבלתי|קיבלת|הגיע/.test(text))         tags.push('קבלה');
  if (/מזומן|בבמזומן/.test(text))             tags.push('מזומן');
  if (/אשראי|ויזה|כרטיס/.test(text))          tags.push('אשראי');
  if (/צק|שיק|המחאה/.test(text))              tags.push('שיק');
  if (/הלוואה|הלוואת/.test(text))             tags.push('הלוואה');
  if (/בונוס|פיצוי/.test(text))               tags.push('בונוס');
  if (/חגים|חג/.test(text))                   tags.push('חגים');
  if (/דלק|דלקנו|תזרים/.test(text))           tags.push('דלק');
  if (/אחותי|אח של|אחי/.test(text))           tags.push('משפחה');
  return tags;
}

const allHits = [];
const summary = { totalMsgs: 0, msgsWithMoney: 0, byChat: {}, byYear: {}, bySpeaker: {} };

for (const cfg of CHATS) {
  const msgs = parseChat(cfg.file);
  summary.totalMsgs += msgs.length;
  summary.byChat[cfg.label] = { msgs: msgs.length, hits: 0, total: 0 };
  for (const msg of msgs) {
    const amounts = extractAmounts(msg.body);
    if (amounts.length === 0) continue;
    const tags = categorize(msg.body);
    summary.msgsWithMoney++;
    summary.byChat[cfg.label].hits++;
    const year = msg.date.slice(0, 4);
    if (!summary.byYear[year]) summary.byYear[year] = { count: 0, total: 0, byTag: {} };
    if (!summary.bySpeaker[msg.speaker]) summary.bySpeaker[msg.speaker] = { count: 0, total: 0 };
    for (const a of amounts) {
      summary.byChat[cfg.label].total += a.amount;
      summary.byYear[year].count++;
      summary.byYear[year].total += a.amount;
      for (const t of tags) summary.byYear[year].byTag[t] = (summary.byYear[year].byTag[t] || 0) + a.amount;
      summary.bySpeaker[msg.speaker].count++;
      summary.bySpeaker[msg.speaker].total += a.amount;
    }
    allHits.push({
      chat: cfg.label, date: msg.date, time: msg.time, speaker: msg.speaker,
      tags,
      amounts: amounts.map(a => ({ amount: a.amount, raw: a.raw, unit: a.unit })),
      body: msg.body.trim().slice(0, 300),
    });
  }
}

allHits.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

const out = { generatedAt: new Date().toISOString(), summary, hits: allHits };
writeFileSync('C:/Users/avraham/meatfish-app/chat-cash.json', JSON.stringify(out, null, 2), 'utf8');

// === REPORT ===
console.log('═'.repeat(70));
console.log('סיכום פילוח מזומן מצ\'אטי וואטסאפ — שלב 1 (טקסט בלבד)');
console.log('═'.repeat(70));
console.log(`\nסה"כ הודעות נסרקו: ${summary.totalMsgs}`);
console.log(`הודעות שמזכירות סכום: ${summary.msgsWithMoney}`);
console.log('\n--- לפי צ\'אט ---');
for (const [lbl, v] of Object.entries(summary.byChat)) {
  console.log(`  ${lbl}: ${v.msgs} הודעות | ${v.hits} עם סכומים | סה"כ מוזכר: ${v.total.toLocaleString('he-IL')} ₪`);
}
console.log('\n--- לפי שנה ---');
for (const [yr, v] of Object.entries(summary.byYear).sort()) {
  console.log(`  ${yr}: ${v.count} אזכורים, סה"כ ${v.total.toLocaleString('he-IL')} ₪`);
  const topTags = Object.entries(v.byTag).sort((a,b)=>b[1]-a[1]).slice(0,4);
  for (const [tag, sum] of topTags) console.log(`     ${tag}: ${sum.toLocaleString('he-IL')} ₪`);
}
console.log('\n--- לפי דובר ---');
for (const [s, v] of Object.entries(summary.bySpeaker).sort((a,b)=>b[1].total-a[1].total)) {
  console.log(`  ${s}: ${v.count} אזכורים | ${v.total.toLocaleString('he-IL')} ₪`);
}
console.log('\nראשונות 20 התרחישים הכרונולוגיים:');
allHits.slice(0,20).forEach(h => {
  const amts = h.amounts.map(a=>`${a.amount.toLocaleString('he-IL')}₪`).join(', ');
  const tags = h.tags.length ? `[${h.tags.join(',')}]` : '';
  console.log(`  ${h.date} ${h.time} ${h.speaker}: ${amts} ${tags}`);
  console.log(`     ${h.body.split('\n')[0].slice(0,90)}`);
});

console.log(`\n✓ Full details saved to: C:/Users/avraham/meatfish-app/chat-cash.json`);
