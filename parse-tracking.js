// Parse Yoel's personal tracking Excel files into a unified tracking.json.
// Files 1 & 2 have detailed transactions; File 3 has monthly summaries.

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SRC = 'D:/user/Desktop/כרטסות הוצאות - הכנסות 20-26-20260511T070339Z-3-001';
const FILES = [
  { name: 'תנועות מהתוכנה לסינכרון באתר 1.xls', type: 'detailed' },
  { name: 'תנועות מהתוכנה לסינכרון באתר 2.xls', type: 'detailed' },
  { name: 'תנועות מהתוכנה לסינכרון באתר 3.xls', type: 'monthly' },
];

function toISO(d) {
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if (typeof d === 'string') {
    const m = /^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/.exec(d.trim());
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const allRows = [];
let totalRaw = 0;

for (const fileDef of FILES) {
  const buf = readFileSync(join(SRC, fileDef.name));
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sn = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null });
  console.log(`\n${fileDef.name} (${fileDef.type}): ${rows.length} rows`);

  // Header row is row 0 in all files
  // file 1/2: [0]=ת.תשלום [1]=עבור תאריך [2]=ביצוע עסקה [3]=סכום [4]=קטגוריה [5]=פרטים
  //           [6]=אופן תשלום [7]=הערות [8]=הערות נוספות [9]=ספק [10]=חשבון בנק [11]=כ.אשראי
  // file 3:   [0]=ת.תשלום [1]=ביצוע עסקה [2]=סכום [3]=קטגוריה [4]=פרטים [5]=אופן תשלום [6]=הערות

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    totalRaw++;
    let payDate, txDate, amount, category, details, payMethod, notes, notes2, supplier, bankAcc, creditCard;
    if (fileDef.type === 'detailed') {
      payDate    = toISO(r[0]);
      txDate     = toISO(r[2] || r[0]);
      amount     = parseNum(r[3]);
      category   = r[4] != null ? String(r[4]).trim() : '';
      details    = r[5] != null ? String(r[5]).trim() : '';
      payMethod  = r[6] != null ? String(r[6]).trim() : '';
      notes      = r[7] != null ? String(r[7]).trim() : '';
      notes2     = r[8] != null ? String(r[8]).trim() : '';
      supplier   = r[9] != null ? String(r[9]).trim() : '';
      bankAcc    = r[10] != null ? String(r[10]).trim() : '';
      creditCard = r[11] != null ? String(r[11]).trim() : '';
    } else {
      payDate    = toISO(r[0]);
      txDate     = toISO(r[1] || r[0]);
      amount     = parseNum(r[2]);
      category   = r[3] != null ? String(r[3]).trim() : '';
      details    = r[4] != null ? String(r[4]).trim() : '';
      payMethod  = r[5] != null ? String(r[5]).trim() : '';
      notes      = r[6] != null ? String(r[6]).trim() : '';
    }
    if (!payDate || amount == null || !category) continue;

    // Parse category — usually "סעיף - תת-סעיף" pattern
    const catParts = category.split(/\s*-\s*/);
    const topCat = catParts[0] || category;
    const subCat = catParts.slice(1).join(' - ') || null;

    allRows.push({
      id: `trk-${fileDef.name.replace(/\D/g,'').slice(0,3)}-${i}`,
      file: fileDef.name,
      payDate, txDate,
      amount,
      direction: amount >= 0 ? 'in' : 'out',  // positive = into the account, negative = out
      category, topCat, subCat,
      details, payMethod, notes, notes2, supplier, bankAcc, creditCard,
    });
  }
}

allRows.sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));

// ============== Aggregations ==============
const agg = {
  totalRows: allRows.length,
  totalIn: 0, totalOut: 0,
  byCategory: {},   // top category -> {count, in, out}
  byCategoryDetail: {}, // full category -> {count, in, out}
  bySupplier: {},
  byEmployee: {},   // detected employee names
  byYear: {},
  byPayMethod: {},
};

// Employee detection: monthly file lists names in 'details' column
const EMPLOYEE_NAMES = new Set();
for (const r of allRows) {
  if (r.topCat.includes('משכורות') && r.details) {
    EMPLOYEE_NAMES.add(r.details);
  }
}

for (const r of allRows) {
  const amt = Math.abs(r.amount);
  if (r.direction === 'in') agg.totalIn += amt; else agg.totalOut += amt;

  if (!agg.byCategory[r.topCat]) agg.byCategory[r.topCat] = { count: 0, in: 0, out: 0 };
  agg.byCategory[r.topCat].count++;
  if (r.direction === 'in') agg.byCategory[r.topCat].in += amt; else agg.byCategory[r.topCat].out += amt;

  if (!agg.byCategoryDetail[r.category]) agg.byCategoryDetail[r.category] = { count: 0, in: 0, out: 0 };
  agg.byCategoryDetail[r.category].count++;
  if (r.direction === 'in') agg.byCategoryDetail[r.category].in += amt; else agg.byCategoryDetail[r.category].out += amt;

  if (r.supplier) {
    if (!agg.bySupplier[r.supplier]) agg.bySupplier[r.supplier] = { count: 0, in: 0, out: 0 };
    agg.bySupplier[r.supplier].count++;
    if (r.direction === 'in') agg.bySupplier[r.supplier].in += amt; else agg.bySupplier[r.supplier].out += amt;
  }

  // employee tracking: if topCat involves salary AND details has a name
  if (r.topCat.includes('משכורות') && r.details) {
    const e = r.details;
    if (!agg.byEmployee[e]) agg.byEmployee[e] = { count: 0, totalPaid: 0, firstDate: null, lastDate: null };
    agg.byEmployee[e].count++;
    agg.byEmployee[e].totalPaid += amt;
    if (!agg.byEmployee[e].firstDate || r.payDate < agg.byEmployee[e].firstDate) agg.byEmployee[e].firstDate = r.payDate;
    if (!agg.byEmployee[e].lastDate  || r.payDate > agg.byEmployee[e].lastDate)  agg.byEmployee[e].lastDate  = r.payDate;
  }

  const yr = r.payDate.slice(0, 4);
  if (!agg.byYear[yr]) agg.byYear[yr] = { count: 0, in: 0, out: 0 };
  agg.byYear[yr].count++;
  if (r.direction === 'in') agg.byYear[yr].in += amt; else agg.byYear[yr].out += amt;

  if (r.payMethod) {
    if (!agg.byPayMethod[r.payMethod]) agg.byPayMethod[r.payMethod] = { count: 0, in: 0, out: 0 };
    agg.byPayMethod[r.payMethod].count++;
    if (r.direction === 'in') agg.byPayMethod[r.payMethod].in += amt; else agg.byPayMethod[r.payMethod].out += amt;
  }
}

const out = { generatedAt: new Date().toISOString(), files: FILES.map(f => f.name), aggregations: agg, rows: allRows };
writeFileSync('C:/Users/avraham/meatfish-app/tracking.json', JSON.stringify(out, null, 2), 'utf8');

console.log('\n═══════════════════════════════════════════════');
console.log(`Tracking rows: ${allRows.length} (from ${totalRaw} raw)`);
console.log(`סך נכנס: ${agg.totalIn.toLocaleString('he-IL')} ₪`);
console.log(`סך יצא:  ${agg.totalOut.toLocaleString('he-IL')} ₪`);
console.log(`נטו: ${(agg.totalIn - agg.totalOut).toLocaleString('he-IL')} ₪`);

console.log('\nשנה בשנה:');
for (const [yr, v] of Object.entries(agg.byYear).sort()) {
  console.log(`  ${yr}: ${v.count} שורות | נכנס ${v.in.toLocaleString('he-IL')} | יצא ${v.out.toLocaleString('he-IL')}`);
}

console.log('\nאופן תשלום:');
for (const [m, v] of Object.entries(agg.byPayMethod).sort((a,b)=>(b[1].in+b[1].out)-(a[1].in+a[1].out))) {
  console.log(`  ${m}: ${v.count} שורות | נכנס ${v.in.toLocaleString('he-IL')} | יצא ${v.out.toLocaleString('he-IL')}`);
}

console.log(`\nעובדים שזוהו (משכורות מזומן):`);
for (const [e, v] of Object.entries(agg.byEmployee).sort((a,b)=>b[1].totalPaid - a[1].totalPaid)) {
  console.log(`  ${e.padEnd(25)}: ${v.count}r | ${v.totalPaid.toLocaleString('he-IL').padStart(12)} ₪ | ${v.firstDate} → ${v.lastDate}`);
}

console.log(`\nTop 10 קטגוריות:`);
const topCats = Object.entries(agg.byCategory).sort((a,b)=>(b[1].in+b[1].out)-(a[1].in+a[1].out)).slice(0,10);
for (const [c, v] of topCats) console.log(`  ${c.padEnd(40)}: ${v.count}r | נכנס ${v.in.toLocaleString('he-IL').padStart(12)} | יצא ${v.out.toLocaleString('he-IL').padStart(12)}`);
