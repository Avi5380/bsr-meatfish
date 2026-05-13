// Generate a printable HTML case-file report.

import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/case-file.json', 'utf8'));
const { aggregations: agg, evidence } = data;

const fmt = n => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(n);
const fmtDate = iso => {
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const dirLabels = {
  y_gave:        { he: 'אתה מסרת', cls: 'dir-out' },
  y_received:    { he: 'אתה קיבלת', cls: 'dir-in' },
  mani_took:     { he: 'מני לקח',  cls: 'dir-out' },
  mani_received: { he: 'מני קיבל', cls: 'dir-in' },
  unknown:       { he: 'לא ברור',   cls: 'dir-unk' },
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function highlight(text, amounts) {
  let out = escapeHtml(text);
  // highlight the raw strings of each amount mention
  for (const a of amounts) {
    const raw = escapeHtml(a.raw);
    const re = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, `<mark>${raw}</mark>`);
  }
  return out;
}

const totalsByYear = Object.entries(agg.by_year).sort();
const totalsByDir  = Object.entries(agg.by_direction).sort((a,b) => b[1]-a[1]);
const totalsByTag  = Object.entries(agg.by_tag).sort((a,b) => b[1]-a[1]);

const evidenceHtml = evidence.map((e, i) => {
  const totalAmount = e.amounts.reduce((s,a) => s + a.amount, 0);
  const tags = e.tags.length ? e.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
  const dir = dirLabels[e.direction] || dirLabels.unknown;
  const contextHtml = e.context.map(c => `
    <div class="ctx-line ${c.isThis ? 'this' : ''}">
      <span class="ctx-meta">${fmtDate(c.date)} ${c.time} ${escapeHtml(c.speaker)}:</span>
      <span class="ctx-body">${escapeHtml(c.body)}</span>
    </div>`).join('');
  return `
  <div class="evidence" id="ev-${i+1}">
    <div class="ev-header">
      <div class="ev-num">#${i+1}</div>
      <div class="ev-meta">
        <div class="ev-date">${fmtDate(e.date)} · ${e.time}</div>
        <div class="ev-chat">${escapeHtml(e.chat)}</div>
      </div>
      <div class="ev-speaker">${escapeHtml(e.speaker)}</div>
      <div class="ev-amount">${fmt(totalAmount)} ₪</div>
      <div class="ev-dir ${dir.cls}">${dir.he}</div>
    </div>
    <div class="ev-tags">${tags}</div>
    <blockquote class="ev-quote">${highlight(e.body, e.amounts)}</blockquote>
    <details class="ev-ctx-wrap">
      <summary>הצג הקשר (2 הודעות לפני / 2 אחרי)</summary>
      <div class="ev-ctx">${contextHtml}</div>
    </details>
  </div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>תיק ראיות — תנועות מזומן מצ'אטי וואטסאפ</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Frank+Ruhl+Libre:wght@500;700&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Heebo', system-ui, sans-serif; max-width: 980px; margin: 0 auto; padding: 24px; background: #fafaf7; color: #1a1a1a; line-height: 1.55; }
  h1 { font-family: 'Frank Ruhl Libre', serif; font-size: 32px; margin: 0 0 4px; letter-spacing: -.02em; }
  h2 { font-family: 'Frank Ruhl Libre', serif; font-size: 22px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #333; }
  h3 { font-size: 15px; color: #444; margin: 18px 0 6px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 18px; }
  .warning { background: #fff5d6; border: 1px solid #d4a800; border-right: 4px solid #d4a800; padding: 12px 16px; border-radius: 6px; margin: 14px 0; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 10px 0 18px; }
  th, td { padding: 8px 12px; border: 1px solid #d4d4ce; text-align: right; }
  th { background: #efebe2; font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
  .evidence { background: white; border: 1px solid #e0ddd2; border-radius: 8px; margin: 10px 0; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.04); page-break-inside: avoid; }
  .ev-header { display: grid; grid-template-columns: 50px 1fr auto auto auto; gap: 12px; align-items: center; font-size: 13px; }
  .ev-num { font-weight: 700; color: #888; font-size: 13px; }
  .ev-meta .ev-date { font-weight: 700; }
  .ev-meta .ev-chat { color: #777; font-size: 11px; }
  .ev-speaker { font-weight: 600; font-size: 13px; }
  .ev-amount { font-weight: 700; font-size: 16px; color: #2a6f45; font-variant-numeric: tabular-nums; }
  .ev-dir { font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 700; }
  .dir-in  { background: #ddecdb; color: #2a6f45; }
  .dir-out { background: #f3d8d8; color: #8c2c2c; }
  .dir-unk { background: #ebe9e0; color: #666; }
  .ev-tags { margin: 8px 0 2px; }
  .tag { display: inline-block; background: #f0ede2; color: #555; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-inline-end: 4px; }
  .ev-quote { border-right: 3px solid #999; background: #f8f6ef; padding: 10px 14px; margin: 8px 0; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  mark { background: #fce28a; padding: 0 3px; font-weight: 700; }
  details summary { cursor: pointer; color: #888; font-size: 12px; margin-top: 8px; }
  .ev-ctx { background: #f9f8f3; border-radius: 4px; padding: 8px 12px; margin-top: 6px; font-size: 12px; }
  .ctx-line { padding: 3px 0; border-bottom: 1px dashed #ddd; }
  .ctx-line:last-child { border-bottom: 0; }
  .ctx-line.this { background: #fff5d6; padding: 5px 8px; margin: 4px -8px; border-radius: 3px; }
  .ctx-meta { color: #888; margin-inline-end: 6px; font-weight: 600; }
  .toc { background: white; border: 1px solid #e0ddd2; border-radius: 8px; padding: 16px 20px; margin: 12px 0; font-size: 13px; }
  .toc a { color: #1a4490; text-decoration: none; margin-left: 12px; }
  @media print { body { background: white; padding: 0; } .evidence { break-inside: avoid; box-shadow: none; } details { display: none; } details[open] { display: block; } .ev-ctx { display: none; } }
</style>
</head>
<body>

<h1>תיק ראיות — תנועות מזומן מצ'אטי וואטסאפ</h1>
<div class="meta">
  מקור: ${escapeHtml(data.source?.audio_files_total ? `2 צ\'אטים, ${data.source.audio_files_total} הקלטות אודיו (תמלול בתהליך)` : '2 צ\'אטים')}<br>
  הופק: ${new Date(data.generatedAt).toLocaleString('he-IL')}<br>
  סה"כ הודעות נסרקו: ${agg.total_messages_scanned.toLocaleString('he-IL')} · פריטי ראיה: ${agg.total_evidence_items}
</div>

<div class="warning">
  <strong>שלב 1 — טקסט בלבד.</strong> דוח זה כולל אך ורק אזכורי כסף שמופיעים בהודעות הטקסט.
  ${data.source?.audio_transcripts_pending ? `${data.source.audio_files_total || 972} הקלטות קוליות עוד מתומללות — יתווספו בעדכון.` : ''}
  כל פריט מצורף עם ציטוט מילולי מדויק, תאריך, שעה ודובר.
</div>

<h2>1 · סיכום פיננסי</h2>

<h3>1.1 · סך אזכורים לפי שנה</h3>
<table>
  <tr><th>שנה</th><th>סה"כ אזכורים בש"ח</th></tr>
  ${totalsByYear.map(([y,s]) => `<tr><td>${y}</td><td class="num">${fmt(s)}</td></tr>`).join('')}
  <tr><th>סה"כ</th><th class="num">${fmt(totalsByYear.reduce((s,[,v])=>s+v,0))}</th></tr>
</table>

<h3>1.2 · לפי כיוון התנועה</h3>
<table>
  <tr><th>כיוון</th><th>סה"כ ש"ח</th></tr>
  ${totalsByDir.map(([d,s]) => `<tr><td>${dirLabels[d]?.he || d}</td><td class="num">${fmt(s)}</td></tr>`).join('')}
</table>
<p style="font-size:12px;color:#666;margin:4px 0">הערה: "לא ברור" משמעו שהמערכת לא יכלה לקבוע בוודאות מי לקח/מסר. נדרשת קריאה ידנית לפריטים אלה.</p>

<h3>1.3 · לפי שיטה / נושא</h3>
<table>
  <tr><th>תג</th><th>סה"כ ש"ח</th></tr>
  ${totalsByTag.map(([t,s]) => `<tr><td>${t}</td><td class="num">${fmt(s)}</td></tr>`).join('')}
</table>

<h2>2 · פריטי ראיה — סדר כרונולוגי</h2>
<p style="font-size:13px;color:#666;margin-bottom:12px">
  לחיצה על "הצג הקשר" מציגה 2 הודעות לפני ו-2 אחרי, כדי לראות את השיחה במלואה.
  ההדגשה הצהובה היא הסכום המצוטט.
</p>

${evidenceHtml}

<h2>3 · הערות מתודולוגיות</h2>
<ul>
  <li>החילוץ מתבסס על ביטויים מפורשים: <em>"X ש"ח"</em>, <em>"X שקל"</em>, <em>"X אלף"</em>, או מספר סמוך למילים כמו "מהקופה", "המשכורת", "להעביר".</li>
  <li>כיוון התנועה (אתה מסרת / מני לקח וכו') נקבע לפי מילים כמו "מסרתי", "לקחתי", "אני יכול לקחת". במקרים של ספק — סומן "לא ברור".</li>
  <li>תאריכי ההודעות, השעות, והדוברים — מקוריים מקובץ הצ'אט המקורי שיוצא מ-WhatsApp.</li>
  <li>אזכור אינו תמיד שווה לתנועה. ייתכן שאותה תנועה הוזכרה במספר הודעות (בקשה + אישור). דרוש סקירת אדם לאחר חילוץ.</li>
  <li>972 הקלטות קוליות מתומללות כעת ב-Whisper (מודל medium, עברית). כשיסתיים — יתווסף ערוץ ראיה שני.</li>
</ul>

</body></html>`;

writeFileSync('C:/Users/avraham/meatfish-app/case-file.html', html, 'utf8');
console.log(`✓ HTML report: C:/Users/avraham/meatfish-app/case-file.html (${(html.length/1024).toFixed(0)} KB)`);
console.log(`  ${evidence.length} evidence items`);
