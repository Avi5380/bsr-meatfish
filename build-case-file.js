// Build the "case file" — every money mention in both chats AND transcripts,
// with verbatim quote, request/reply linkage, context.

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const paths = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/chat-paths.json', 'utf8').replace(/^﻿/, ''));
const CHATS = [
  { id: 'mani',       label: 'צ\'אט אישי עם מני גולד פיש', file: paths.chat1 },
  { id: 'mishlochim', label: 'קבוצת משלוחים',              file: paths.chat2 },
];
const TRANSCRIPTS_DIR = 'C:/Users/avraham/meatfish-app/transcripts';

const headRe = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}:\d{2})\s+-\s+(.+?):\s+([\s\S]*)$/;
function parseChat(path, chatId) {
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
      cur = { chatId, date: `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,
              time: hhmm, speaker: speaker.trim(), body };
    } else if (cur) cur.body += '\n' + line;
  }
  if (cur) msgs.push(cur);
  return msgs;
}

// ============ TRANSCRIPTS ============
// Load every transcript JSON, build {filename → text}
const transcripts = {};
for (const f of readdirSync(TRANSCRIPTS_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const j = JSON.parse(readFileSync(join(TRANSCRIPTS_DIR, f), 'utf8'));
    transcripts[j.file] = { text: j.text || '', duration: j.duration, segments: j.segments || [] };
  } catch (e) {}
}
console.log(`Loaded ${Object.keys(transcripts).length} transcripts`);

// Build {opusFilename → {chatId,date,time,speaker}} by scanning chats for file references
const audioRefs = {};
for (const cfg of CHATS) {
  for (const m of parseChat(cfg.file, cfg.id)) {
    const opus = /([A-Z]+-?\d+-WA\d+\.opus|\d{8}-?WA\d+\.opus|[A-Z]+-?\d+-?\d*\.opus)/i.exec(m.body);
    if (opus) audioRefs[opus[1]] = { chatId: cfg.id, date: m.date, time: m.time, speaker: m.speaker };
  }
}
console.log(`Audio refs mapped: ${Object.keys(audioRefs).length}`);

// ============ MONEY EXTRACTION ============
// Hebrew word numerals
const HEB_WORDS = {
  'אפס':0,'אחד':1,'אחת':1,'שניים':2,'שני':2,'שתיים':2,'שתי':2,
  'שלוש':3,'שלושה':3,'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5,
  'שש':6,'שישה':6,'שבע':7,'שבעה':7,'שמונה':8,'תשע':9,'תשעה':9,
  'עשר':10,'עשרה':10,
  'עשרים':20,'שלושים':30,'ארבעים':40,'חמישים':50,'שישים':60,'שבעים':70,'שמונים':80,'תשעים':90,
  'מאה':100,'מאתיים':200,
  'אלף':1000,'אלפיים':2000,
};

function extractAmounts(text) {
  const out = [];
  // numeric with currency
  const re1 = /(?<!\d)(\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?)\s*(?:ש["']?ח|₪|שקל|שקלים)/g;
  let m;
  while ((m = re1.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n) && n >= 1 && n <= 10000000) out.push({ amount: n, raw: m[0], type: 'explicit' });
  }
  // "X אלף"
  const re2 = /(?<!\d)(\d{1,4}(?:\.\d+)?)\s*אלף/g;
  while ((m = re2.exec(text)) !== null) {
    const n = parseFloat(m[1]) * 1000;
    if (!isNaN(n)) out.push({ amount: n, raw: m[0], type: 'thousand' });
  }
  // contextual: number near key words
  const re3 = /(?<!\d)(\d{2,5})(?=[^\d\n]{0,18}(?:מהקופה|לקופה|הקופ|המשכורת|לחשבון|לאחותי|להעביר|תעביר|העברתי))/g;
  while ((m = re3.exec(text)) !== null) {
    const n = parseInt(m[1]);
    if (n >= 50 && n <= 100000) out.push({ amount: n, raw: m[0].trim(), type: 'context' });
  }
  // hebrew word numerals — "מאתיים שקל", "אלף שקל"
  const re4 = /(אלפיים|אלף|מאתיים|מאה|עשרים|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים)\s*(שקל|שקלים|ש["']?ח|₪)/g;
  while ((m = re4.exec(text)) !== null) {
    const n = HEB_WORDS[m[1]];
    if (n) out.push({ amount: n, raw: m[0], type: 'hebrew_word' });
  }
  const seen = new Set();
  return out.filter(x => { const k = `${x.amount}|${x.raw}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function classify(text) {
  const tags = [];
  if (/מהקופה|לקופה|בקופה|הקופ/.test(text))      tags.push('קופה');
  if (/משכורת|המשכורת|^שכר|שכרי|שכרו/.test(text)) tags.push('משכורת');
  if (/חוב\b|החוב\b|חובות/.test(text))            tags.push('חוב');
  if (/העברה|להעביר|תעביר|העברתי/.test(text))      tags.push('העברה');
  if (/מסרתי|נתתי|מסרת|נתת/.test(text))           tags.push('מסירה');
  if (/קיבלתי|קיבלת|הגיע|נכנס/.test(text))         tags.push('קבלה');
  if (/מזומן/.test(text))                          tags.push('מזומן');
  if (/אשראי|ויזה|כרטיס/.test(text))               tags.push('אשראי');
  if (/שיק|המחאה|צ.?ק\b/.test(text))               tags.push('שיק');
  if (/הלוואה|הלוואת/.test(text))                  tags.push('הלוואה');
  if (/בונוס|פיצוי/.test(text))                    tags.push('בונוס');
  if (/חגים|חג\b|פסח|סוכות/.test(text))           tags.push('חגים');
  if (/אחותי|אחי\b|משפחה|לאמא/.test(text))         tags.push('משפחה');
  if (/לקחת|לוקח|לקחתי/.test(text))                tags.push('לקיחה');
  if (/לרכב|דלק|תיקון/.test(text))                 tags.push('רכב');
  return tags;
}

function direction(speaker, body) {
  const isY    = speaker === 'Y' || speaker === 'y';
  const isMani = speaker.includes('מני');
  if (isY) {
    if (/מסרתי|נתתי|העברתי|שילמתי/.test(body)) return 'y_gave';
    if (/קיבלתי/.test(body))                    return 'y_received';
  }
  if (isMani) {
    if (/לקחתי|לקחת|אני יוכל לקחת|יכול לקחת|אני יקח/.test(body)) return 'mani_took';
    if (/קיבלתי/.test(body)) return 'mani_received';
  }
  return 'unknown';
}

function isRequest(body) {
  if (/[?؟]/.test(body)) return true;
  if (/אפשר|אפשרי|יוכל|תוכל|אני יקח|אני יוכל לקחת|אני אקח|אני לוקח/.test(body)) return true;
  return false;
}

function classifyReply(body) {
  const POS = /(^|\W)(כן|אישור|אוקי|אוקיי|בסדר|סבבה|בכיף|אפשר|תקח|תיקח|קח|אישרתי|אחלה|כמובן|בוודאי|אין בעיה)(\W|$)|👍|✅/;
  const NEG = /(^|\W)(לא|אסור|תחזיר|תחזור|אל תיקח|אל תקח|רגע|חכה|לא עכשיו|לא היום|לא אישרתי|לא ראיתי)(\W|$)|❌|🚫/;
  const hasPos = POS.test(body);
  const hasNeg = NEG.test(body);
  if (hasPos && !hasNeg) return 'approved';
  if (hasNeg && !hasPos) return 'denied';
  if (hasPos && hasNeg) return 'ambiguous';
  return 'unclear';
}

function findReply(allMsgs, msgIdx, requesterSpeaker) {
  for (let j = msgIdx + 1; j < Math.min(allMsgs.length, msgIdx + 7); j++) {
    const m = allMsgs[j];
    if (m.chatId !== allMsgs[msgIdx].chatId) continue;
    if (m.speaker === requesterSpeaker) continue;
    if (/\.opus|\.jpg|\.pdf|\.mp4/.test(m.body)) continue;
    return { date: m.date, time: m.time, speaker: m.speaker, body: m.body.trim().slice(0, 200), classification: classifyReply(m.body) };
  }
  return null;
}

// ============ Build evidence ============
const ALL_MSGS = [];
for (const cfg of CHATS) {
  for (const m of parseChat(cfg.file, cfg.id)) ALL_MSGS.push({ ...m, chatLabel: cfg.label });
}
ALL_MSGS.sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));

const chatIndex = {};
for (const cfg of CHATS) chatIndex[cfg.id] = ALL_MSGS.filter(m => m.chatId === cfg.id);

const evidence = [];

// === Text-based evidence (from chat messages) ===
for (const msg of ALL_MSGS) {
  const amounts = extractAmounts(msg.body);
  if (amounts.length === 0) continue;
  const tags = classify(msg.body);
  const dir = direction(msg.speaker, msg.body);
  const sameChat = chatIndex[msg.chatId];
  const myIdx = sameChat.indexOf(msg);
  const context = sameChat.slice(Math.max(0, myIdx-2), Math.min(sameChat.length, myIdx+3))
    .map(m => ({ date: m.date, time: m.time, speaker: m.speaker, body: m.body.trim().slice(0, 250), isThis: m === msg }));
  const requestFlag = isRequest(msg.body);
  let reply = null;
  if (requestFlag) reply = findReply(sameChat, myIdx, msg.speaker);

  evidence.push({
    source: 'text',
    chat: msg.chatLabel,
    chatId: msg.chatId,
    date: msg.date,
    time: msg.time,
    speaker: msg.speaker,
    body: msg.body.trim(),
    amounts: amounts.map(a => ({ amount: a.amount, raw: a.raw, type: a.type })),
    tags,
    direction: dir,
    isRequest: requestFlag,
    reply,
    context,
  });
}

// === Audio-based evidence (from transcripts) ===
let audioAdded = 0, audioSkipped = 0;
for (const [opus, ref] of Object.entries(audioRefs)) {
  const tr = transcripts[opus];
  if (!tr || !tr.text || tr.text.length < 8) { audioSkipped++; continue; }
  const amounts = extractAmounts(tr.text);
  if (amounts.length === 0) { audioSkipped++; continue; }
  const tags = classify(tr.text);
  const dir = direction(ref.speaker, tr.text);
  const chat = CHATS.find(c => c.id === ref.chatId);
  // build context from the chat (3 around the message that referenced this opus)
  const sameChat = chatIndex[ref.chatId];
  // find the msg containing this opus
  const myIdxText = sameChat.findIndex(m => m.body.includes(opus));
  const context = myIdxText >= 0
    ? sameChat.slice(Math.max(0, myIdxText-2), Math.min(sameChat.length, myIdxText+3))
        .map(m => ({ date: m.date, time: m.time, speaker: m.speaker, body: m.body.trim().slice(0, 250), isThis: m === sameChat[myIdxText] }))
    : [];

  evidence.push({
    source: 'audio',
    audioFile: opus,
    audioDuration: tr.duration,
    chat: chat.label,
    chatId: ref.chatId,
    date: ref.date,
    time: ref.time,
    speaker: ref.speaker,
    body: tr.text.trim(),  // the transcript text serves as the "body"
    transcriptNote: 'תמלול אוטומטי — ייתכנו אי-דיוקים. בדיקה ע"י האזנה מומלצת.',
    amounts: amounts.map(a => ({ amount: a.amount, raw: a.raw, type: a.type })),
    tags,
    direction: dir,
    isRequest: isRequest(tr.text),
    reply: null,
    context,
  });
  audioAdded++;
}
console.log(`Audio evidence: added=${audioAdded}, skipped (no amount/empty)=${audioSkipped}`);

evidence.sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));

// ============ Aggregations ============
const agg = {
  total_messages_scanned: ALL_MSGS.length,
  total_transcripts: Object.keys(transcripts).length,
  total_evidence_items: evidence.length,
  total_text_items: evidence.filter(e => e.source === 'text').length,
  total_audio_items: evidence.filter(e => e.source === 'audio').length,
  total_requests: evidence.filter(e => e.isRequest).length,
  by_reply_status: { approved: 0, denied: 0, ambiguous: 0, unclear: 0, no_reply: 0, not_a_request: 0 },
  by_reply_status_amount: { approved: 0, denied: 0, ambiguous: 0, unclear: 0, no_reply: 0, not_a_request: 0 },
  by_source: { text: 0, audio: 0 },
  by_source_amount: { text: 0, audio: 0 },
  by_year: {},
  by_year_source: {},
};

for (const e of evidence) {
  const yr = e.date.slice(0,4);
  const total = e.amounts.reduce((s,a) => s + a.amount, 0);
  const replyKey = !e.isRequest ? 'not_a_request' : (e.reply ? e.reply.classification : 'no_reply');
  agg.by_reply_status[replyKey]++;
  agg.by_reply_status_amount[replyKey] += total;
  agg.by_source[e.source]++;
  agg.by_source_amount[e.source] += total;
  agg.by_year[yr] = (agg.by_year[yr] || 0) + total;
  if (!agg.by_year_source[yr]) agg.by_year_source[yr] = { text: 0, audio: 0 };
  agg.by_year_source[yr][e.source] += total;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: { chats: 2, audio_files_total: Object.keys(transcripts).length, audio_files_with_money: audioAdded },
  aggregations: agg, evidence };
writeFileSync('C:/Users/avraham/meatfish-app/case-file.json', JSON.stringify(out, null, 2), 'utf8');

console.log('═'.repeat(72));
console.log(`CASE FILE — שלב 2 (טקסט + תמלול אודיו)`);
console.log('═'.repeat(72));
console.log(`\nסה"כ פריטי ראיה: ${agg.total_evidence_items}`);
console.log(`  מטקסט: ${agg.total_text_items} | מאודיו: ${agg.total_audio_items}`);
console.log(`\n--- לפי מקור ---`);
for (const [s, n] of Object.entries(agg.by_source))
  console.log(`  ${s}: ${n} פריטים, ${agg.by_source_amount[s].toLocaleString('he-IL')} ₪`);
console.log(`\n--- לפי שנה ---`);
for (const [y, s] of Object.entries(agg.by_year).sort()) console.log(`  ${y}: ${s.toLocaleString('he-IL')} ₪`);
console.log(`\n--- בקשות מול תשובות ---`);
const replyLabels = { approved: 'אושר', denied: 'סורב', ambiguous: 'מעורפל', unclear: 'תשובה לא ברורה', no_reply: 'ללא תשובה', not_a_request: 'לא בקשה' };
for (const [k, count] of Object.entries(agg.by_reply_status)) {
  console.log(`  ${(replyLabels[k]||k).padEnd(18)} ${String(count).padStart(4)} פריטים | ${agg.by_reply_status_amount[k].toLocaleString('he-IL').padStart(10)} ₪`);
}
console.log(`\n✓ ${evidence.length} items → case-file.json`);
