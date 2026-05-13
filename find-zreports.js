// Search both chats for cash-register Z reports / daily summaries / end-of-day totals.
// Patterns:
//   "זד יומי", "זד מרכז", "ז.ד", "סיכום קופה", "סיכום יום", "סך הקניות", "הכנסות יום"
//   "סוף יום", "מכירות יומיות", "ריכוז יום"
//   Or: long messages from Mani with many small line-item amounts and a total.

import { readFileSync, writeFileSync } from 'fs';

const paths = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/chat-paths.json', 'utf8').replace(/^﻿/, ''));
const CHATS = [
  { id: 'mani',       label: 'צ\'אט אישי עם מני גולד פיש', file: paths.chat1 },
  { id: 'mishlochim', label: 'קבוצת משלוחים',              file: paths.chat2 },
];

const headRe = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}:\d{2})\s+-\s+(.+?):\s+([\s\S]*)$/;
function parseChat(path, chatId, chatLabel) {
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
      cur = { chatId, chatLabel, date: `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,
              time: hhmm, speaker: speaker.trim(), body };
    } else if (cur) {
      cur.body += '\n' + line;
    }
  }
  if (cur) msgs.push(cur);
  return msgs;
}

// Match patterns to look for
const Z_PATTERNS = [
  { name: 'זד יומי',         re: /זד\s*יומי/g,         strength: 'high' },
  { name: 'זד מרכז/קופה',     re: /זד\s*(מרכז|קופה|הקופה)/g, strength: 'high' },
  { name: 'ז.ד',              re: /(?:^|\s)ז\.ד(?:\s|$)/g, strength: 'medium' },
  { name: 'דוח קופה',         re: /דוח\s*קופה|דו["']ח\s*קופה/g, strength: 'high' },
  { name: 'דוח יומי',         re: /דוח\s*יומי|דו["']ח\s*יומי/g, strength: 'medium' },
  { name: 'סיכום קופה',       re: /סיכום\s*קופה/g,       strength: 'high' },
  { name: 'סיכום יום',         re: /סיכום\s*(של\s+)?היום|סיכום\s*יומי|סיכום\s*ה?יום/g, strength: 'medium' },
  { name: 'סוף יום',           re: /סוף\s*יום/g,         strength: 'medium' },
  { name: 'ריכוז הכנסות',      re: /ריכוז\s*הכנסות|ריכוז\s*מכירות|ריכוז\s*זדים/g, strength: 'high' },
  { name: 'הכנסות יום/חודש',   re: /הכנסות\s+(של\s+)?(היום|חודש|ל?חודש|\d)/g, strength: 'medium' },
  { name: 'מכירות',            re: /מכירות\s+(\d|ב?חודש|מ?חודש)/g, strength: 'low' },
];

const matches = [];
for (const cfg of CHATS) {
  const msgs = parseChat(cfg.file, cfg.id, cfg.label);
  for (const m of msgs) {
    const hits = [];
    for (const p of Z_PATTERNS) {
      p.re.lastIndex = 0;
      const found = [...m.body.matchAll(p.re)];
      if (found.length) hits.push({ pattern: p.name, strength: p.strength, count: found.length });
    }
    // Also: heuristic for "long message with multiple amounts and a total"
    const lines = m.body.split('\n').filter(l => l.trim());
    const amountLines = lines.filter(l => /\d{2,5}/.test(l));
    const allLines = lines.length;
    if (allLines >= 4 && amountLines.length >= 3 && /[₪]|שח|שקל/.test(m.body)) {
      hits.push({ pattern: 'תבנית-דוח (4+ שורות, 3+ סכומים)', strength: 'low', count: 1 });
    }
    if (hits.length) {
      matches.push({
        chat: m.chatLabel,
        chatId: m.chatId,
        date: m.date,
        time: m.time,
        speaker: m.speaker,
        body: m.body.trim(),
        hits,
      });
    }
  }
}

matches.sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));

// Stats
const byPattern = {};
const byChat = {};
for (const m of matches) {
  byChat[m.chat] = (byChat[m.chat] || 0) + 1;
  for (const h of m.hits) byPattern[h.pattern] = (byPattern[h.pattern] || 0) + 1;
}

writeFileSync('C:/Users/avraham/meatfish-app/z-reports.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: matches.length,
  byPattern,
  byChat,
  matches,
}, null, 2), 'utf8');

console.log('═'.repeat(72));
console.log(`חיפוש דוחות זד / סיכומי קופה: נמצאו ${matches.length} הודעות`);
console.log('═'.repeat(72));
console.log('\n--- לפי תבנית ---');
for (const [p, c] of Object.entries(byPattern).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${p.padEnd(40)} ${String(c).padStart(4)}`);
}
console.log('\n--- לפי צ\'אט ---');
for (const [c, n] of Object.entries(byChat)) console.log(`  ${c}: ${n}`);
console.log('\n--- 15 דוגמאות ראשונות (לפי תאריך) ---');
matches.slice(0, 15).forEach(m => {
  const hitNames = m.hits.map(h => `${h.pattern}(${h.strength})`).join(', ');
  console.log(`\n  ${m.date} ${m.time} ${m.speaker} [${hitNames}]`);
  console.log(`    ${m.body.replace(/\n/g, ' / ').slice(0, 180)}`);
});
