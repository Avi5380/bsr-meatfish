// Parse bank statements (Tefahot + PAGI) — handles multiple formats per bank.
// Detects columns by their Hebrew header names rather than by position.

import * as XLSX from 'xlsx';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BANK_ROOT = 'C:/Users/avraham/meatfish-app/bank-sources';

function toISO(d) {
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if (typeof d === 'string') {
    // dd/mm/yyyy
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/,/g, '').replace(/[^\d.\-()]/g, '').trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

// Find header row + map column names to indices.
// Looks for known header keywords in any row in the first ~10 rows.
function findHeaderMapping(rows) {
  const MAP = {
    date:        ['תאריך', 'תאריך פעולה'],
    valueDate:   ['תאריך ערך', 'ערך'],
    credit:      ['זכות', 'הכנסה'],
    debit:       ['חובה', 'הוצאה'],
    description: ['תאור', 'תיאור', 'סוג תנועה', 'תיאור הפעולה', 'פרטים'],
    balance:     ['יתרה', 'יתרה בש"ח'],
    ref:         ['אסמכתא'],
    opType:      ['סוג פעולה', 'סוג תשלום'],
  };

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i];
    if (!r) continue;
    const hits = {};
    for (let c = 0; c < r.length; c++) {
      const v = r[c];
      if (typeof v !== 'string') continue;
      const t = v.trim();
      for (const [key, keywords] of Object.entries(MAP)) {
        if (hits[key] != null) continue;
        if (keywords.some(kw => t === kw)) { hits[key] = c; break; }
      }
    }
    // Must have at least date + credit + debit (or income/expense which map to credit/debit)
    if (hits.date != null && hits.credit != null && hits.debit != null) {
      return { headerRow: i, ...hits };
    }
  }
  return null;
}

function parseFile(rows, file) {
  const map = findHeaderMapping(rows);
  if (!map) return [];
  const out = [];
  for (let i = map.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dateRaw = r[map.date];
    if (dateRaw == null || dateRaw === '') continue;
    const date = toISO(dateRaw);
    if (!date) continue;
    const credit = parseNum(r[map.credit]) || 0;
    const debit  = Math.abs(parseNum(r[map.debit]) || 0);
    if (credit === 0 && debit === 0) continue;
    const desc = r[map.description] != null ? String(r[map.description]).trim() : '';
    // Skip "opening balance" rows
    if (/יתרת פתיחה|יתרה התחלת/.test(desc)) continue;
    out.push({
      date,
      valueDate: map.valueDate != null ? toISO(r[map.valueDate]) || date : date,
      description: desc,
      credit, debit,
      balance: map.balance != null ? parseNum(r[map.balance]) : null,
      ref: map.ref != null && r[map.ref] != null ? String(r[map.ref]).trim() : '',
      opType: map.opType != null && r[map.opType] != null ? String(r[map.opType]).trim() : '',
    });
  }
  return out;
}

const BANK_DEFS = [
  { id: 'tefahot', name: 'מזרחי-טפחות', dir: 'tefahot' },
  { id: 'pagi',    name: 'בנק פאג"י',    dir: 'pagi' },
];

const allRows = [];
const banks = [];

for (const bd of BANK_DEFS) {
  const dirPath = join(BANK_ROOT, bd.dir);
  const files = readdirSync(dirPath).filter(f => /\.xlsx?$/i.test(f));
  let bankRowCount = 0, credit = 0, debit = 0;
  let minDate = null, maxDate = null;
  for (const file of files) {
    const buf = readFileSync(join(dirPath, file));
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    let totalParsed = 0;
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
      const parsed = parseFile(rows, file);
      parsed.forEach((row, idx) => {
        const fileBase = file.replace(/\.xlsx?$/i, '');
        row.id   = `bnk-${bd.id}-${fileBase}-${idx}`;
        row.bank = bd.id;
        row.bankName = bd.name;
        row.file = file;
        allRows.push(row);
        bankRowCount++;
        credit += row.credit;
        debit  += row.debit;
        if (!minDate || row.date < minDate) minDate = row.date;
        if (!maxDate || row.date > maxDate) maxDate = row.date;
      });
      totalParsed += parsed.length;
    }
    console.log(`  ${bd.name} / ${file}: ${totalParsed} rows`);
  }
  banks.push({ id: bd.id, name: bd.name, file_count: files.length, rowCount: bankRowCount,
               periodStart: minDate, periodEnd: maxDate,
               totals: { credit, debit, net: credit - debit } });
}

allRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

// Deduplicate by (date, description, credit, debit, ref) — multiple statements often overlap
const seen = new Set();
const deduped = [];
let dupes = 0;
for (const r of allRows) {
  const key = `${r.bank}|${r.date}|${r.description}|${r.credit}|${r.debit}|${r.ref}`;
  if (seen.has(key)) { dupes++; continue; }
  seen.add(key);
  deduped.push(r);
}

// Recompute bank totals from deduped
const bankTotals = {};
for (const r of deduped) {
  if (!bankTotals[r.bank]) bankTotals[r.bank] = { credit: 0, debit: 0, rowCount: 0 };
  bankTotals[r.bank].credit += r.credit;
  bankTotals[r.bank].debit  += r.debit;
  bankTotals[r.bank].rowCount++;
}
for (const b of banks) {
  if (bankTotals[b.id]) {
    b.rowCount = bankTotals[b.id].rowCount;
    b.totals = { ...bankTotals[b.id], net: bankTotals[b.id].credit - bankTotals[b.id].debit };
  }
}

const out = { generatedAt: new Date().toISOString(), banks, rows: deduped, duplicatesRemoved: dupes };
writeFileSync('C:/Users/avraham/meatfish-app/banks.json', JSON.stringify(out, null, 2), 'utf8');

console.log('\n═══════════════════════════════════════════════');
console.log(`Total raw rows: ${allRows.length}, deduplicated: ${deduped.length} (${dupes} duplicates removed)`);
for (const b of banks) {
  console.log(`\n${b.name}: ${b.rowCount} שורות | ${b.periodStart} → ${b.periodEnd}`);
  console.log(`  זכות (נכנס): ${b.totals.credit.toLocaleString('he-IL')} ₪`);
  console.log(`  חובה (יצא):  ${b.totals.debit.toLocaleString('he-IL')} ₪`);
  console.log(`  נטו: ${b.totals.net.toLocaleString('he-IL')} ₪`);
}
console.log(`\n✓ ${deduped.length} bank rows → banks.json`);
