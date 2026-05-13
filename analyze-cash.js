// Consolidate cash flow from ALL sources:
// 1. Bank statements — explicit cash deposit/withdrawal transactions
// 2. Tracking files — Yoel's personal record (file 3 has employee cash payments)
// 3. WhatsApp case file — cash mentions
// 4. Hashavshevet ledgers — קופת מזומן account

import { readFileSync } from 'fs';

const banks = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/banks.json', 'utf8'));
const tracking = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/tracking.json', 'utf8'));
const caseFile = JSON.parse(readFileSync('C:/Users/avraham/meatfish-app/case-file.json', 'utf8'));

// ============ 1. BANK CASH FLOW ============
// Find transactions with "מזומן" in description
const CASH_PATTERNS = [
  { re: /הפקדת\s*מזומן|הפקדה.*מזומן/, type: 'הפקדת מזומן (נכנס)', direction: 'in' },
  { re: /ה\.מזומן|הפקדת מזומן/, type: 'הפקדת מזומן (נכנס)', direction: 'in' },
  { re: /משיכת?\s*מזומן|משיכה מזומן/, type: 'משיכת מזומן (יצא)', direction: 'out' },
  { re: /מזומן/, type: 'מזומן אחר', direction: 'any' },
];

const bankCash = { all: [], in: 0, out: 0, byPattern: {} };
for (const r of banks.rows) {
  for (const p of CASH_PATTERNS) {
    if (p.re.test(r.description)) {
      bankCash.all.push({ ...r, _pattern: p.type });
      if (r.credit > 0) bankCash.in += r.credit;
      if (r.debit  > 0) bankCash.out += r.debit;
      if (!bankCash.byPattern[p.type]) bankCash.byPattern[p.type] = { count: 0, in: 0, out: 0 };
      bankCash.byPattern[p.type].count++;
      bankCash.byPattern[p.type].in += r.credit;
      bankCash.byPattern[p.type].out += r.debit;
      break;
    }
  }
}

console.log('═══════════════════════════════════════════════');
console.log('1. מזומן בדפי בנק');
console.log('═══════════════════════════════════════════════');
console.log(`סך תנועות מזומן בבנק: ${bankCash.all.length}`);
console.log(`  נכנס (הפקדות):  ${bankCash.in.toLocaleString('he-IL')} ₪`);
console.log(`  יצא (משיכות):   ${bankCash.out.toLocaleString('he-IL')} ₪`);
console.log(`  נטו:           ${(bankCash.in - bankCash.out).toLocaleString('he-IL')} ₪`);
console.log('\nלפי בנק:');
const bankCashByBank = {};
for (const r of bankCash.all) {
  if (!bankCashByBank[r.bankName]) bankCashByBank[r.bankName] = { count: 0, in: 0, out: 0 };
  bankCashByBank[r.bankName].count++;
  bankCashByBank[r.bankName].in += r.credit;
  bankCashByBank[r.bankName].out += r.debit;
}
for (const [b, v] of Object.entries(bankCashByBank)) {
  console.log(`  ${b.padEnd(20)} ${v.count}r | נכנס ${v.in.toLocaleString('he-IL').padStart(12)} | יצא ${v.out.toLocaleString('he-IL').padStart(12)}`);
}

// ============ 2. TRACKING — file 3 monthly cash salary ============
console.log('\n═══════════════════════════════════════════════');
console.log('2. תשלומי מזומן לעובדים (קובץ מעקב 3 — סיכומים חודשיים)');
console.log('═══════════════════════════════════════════════');
const file3CashSalary = tracking.rows.filter(r =>
  r.file.includes('3.xls') &&
  r.topCat.includes('משכורות')
);
const byEmployee3 = {};
for (const r of file3CashSalary) {
  const emp = r.details;
  if (!byEmployee3[emp]) byEmployee3[emp] = { count: 0, total: 0, firstDate: null, lastDate: null };
  byEmployee3[emp].count++;
  byEmployee3[emp].total += Math.abs(r.amount);
  if (!byEmployee3[emp].firstDate || r.payDate < byEmployee3[emp].firstDate) byEmployee3[emp].firstDate = r.payDate;
  if (!byEmployee3[emp].lastDate || r.payDate > byEmployee3[emp].lastDate) byEmployee3[emp].lastDate = r.payDate;
}
let totalCashSalary = 0;
for (const [e, v] of Object.entries(byEmployee3).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`  ${e.padEnd(20)} ${v.count}r | ${v.total.toLocaleString('he-IL').padStart(12)} ₪ | ${v.firstDate} → ${v.lastDate}`);
  totalCashSalary += v.total;
}
console.log(`  סה"כ משכורות מזומן (מעקב 3): ${totalCashSalary.toLocaleString('he-IL')} ₪`);

// ============ 3. TRACKING — all cash flow by category ============
console.log('\n═══════════════════════════════════════════════');
console.log('3. כל המזומן במעקב האישי (כל 3 הקבצים)');
console.log('═══════════════════════════════════════════════');
const trackingCash = tracking.rows.filter(r => r.payMethod === 'מזומן');
const byCatCash = {};
for (const r of trackingCash) {
  const cat = r.topCat;
  if (!byCatCash[cat]) byCatCash[cat] = { count: 0, in: 0, out: 0 };
  byCatCash[cat].count++;
  const amt = Math.abs(r.amount);
  if (r.direction === 'in') byCatCash[cat].in += amt; else byCatCash[cat].out += amt;
}
const sortedCats = Object.entries(byCatCash).sort((a,b) => (b[1].in+b[1].out) - (a[1].in+a[1].out));
let totalTrackingIn = 0, totalTrackingOut = 0;
for (const [c, v] of sortedCats.slice(0, 15)) {
  console.log(`  ${c.padEnd(35)} ${v.count.toString().padStart(4)}r | נכנס ${v.in.toLocaleString('he-IL').padStart(12)} | יצא ${v.out.toLocaleString('he-IL').padStart(12)}`);
}
for (const [, v] of sortedCats) { totalTrackingIn += v.in; totalTrackingOut += v.out; }
console.log(`  סה"כ מזומן במעקב: נכנס ${totalTrackingIn.toLocaleString('he-IL')} | יצא ${totalTrackingOut.toLocaleString('he-IL')}`);

// ============ 4. CHAT CASH MENTIONS ============
console.log('\n═══════════════════════════════════════════════');
console.log('4. אזכורי מזומן בצ\'אטי וואטסאפ (סה"כ מצוטט)');
console.log('═══════════════════════════════════════════════');
let chatCash = 0;
const chatByYear = {};
for (const ev of caseFile.evidence) {
  for (const a of ev.amounts || []) {
    chatCash += a.amount;
    const yr = ev.date.slice(0, 4);
    chatByYear[yr] = (chatByYear[yr] || 0) + a.amount;
  }
}
console.log(`  ${caseFile.evidence.length} אזכורים, סה"כ ${chatCash.toLocaleString('he-IL')} ₪`);
for (const [y, s] of Object.entries(chatByYear).sort()) {
  console.log(`  ${y}: ${s.toLocaleString('he-IL')} ₪`);
}

// ============ FINAL SUMMARY ============
console.log('\n═══════════════════════════════════════════════');
console.log('סיכום סופי — מאיפה ואיפה המזומן');
console.log('═══════════════════════════════════════════════');
console.log(`מקור 1 — מזומן דרך בנקים:`);
console.log(`  הפקדות (נכנסו):        ${bankCash.in.toLocaleString('he-IL').padStart(14)} ₪`);
console.log(`  משיכות (יצאו):         ${bankCash.out.toLocaleString('he-IL').padStart(14)} ₪`);
console.log(`מקור 2 — מעקב אישי (כל המקורות):`);
console.log(`  נכנס (סה"כ):           ${totalTrackingIn.toLocaleString('he-IL').padStart(14)} ₪`);
console.log(`  יצא  (סה"כ):           ${totalTrackingOut.toLocaleString('he-IL').padStart(14)} ₪`);
console.log(`  משכורות מזומן (קובץ 3): ${totalCashSalary.toLocaleString('he-IL').padStart(14)} ₪`);
console.log(`מקור 3 — צ'אטי וואטסאפ:`);
console.log(`  סך אזכורים:            ${chatCash.toLocaleString('he-IL').padStart(14)} ₪`);
