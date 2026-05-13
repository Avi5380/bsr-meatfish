// Extract all xlsx category files into a unified data.json
//
// Two formats:
//   A) Hashavshevet "כרטסת" reports — most files (גיליון2 sheet).
//      Header row: פרטים | פקודה | אסמכתא | אסמכתא1 | תאריך ערך | תאריך אסמכתא | יתרה | (גש) | זכות | חובה | (גש) | חשבון נגדי
//   B) Bank register `excel (6).xlsx` — ExcelGrid sheet, transactional list.
//      Skipped from per-category data (it's a separate transaction stream).
//   C) Bank statements `*.xls` — Activities sheet. Skipped from per-category for now.
//
// Output: data.json with categories[] + per-row id + flagged=false.

import * as XLSX from 'xlsx';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = 'D:/user/Desktop/כרטסות הוצאות - הכנסות 20-26-20260511T070339Z-3-001/כרטסות הוצאות - הכנסות 20-26';
const OUT = join(import.meta.dirname, 'data.json');
const OVERLAY = join(import.meta.dirname, 'overlay.json'); // user edits/flags survive re-extraction

const files = readdirSync(SRC)
  .filter(f => /\.xlsx?$/i.test(f) && !/^excel\s*\(/.test(f));

// Bank-statement .xls files have a different "Activities" sheet — skipped here.
// בעלים.xlsx is an exact duplicate of בעלים 20-25.xlsx (same 302 rows) — skip it to avoid double-counting.
const SKIP_FILES = new Set([
  '1.4.22-31.12.22.xls',
  'דפי בנק 1.1.23-6.8.23.xls',
  'בעלים.xlsx',  // duplicate of בעלים 20-25.xlsx
]);

// load existing overlay (user-edits + flags) so we don't lose state on re-extract
const overlay = existsSync(OVERLAY) ? JSON.parse(readFileSync(OVERLAY, 'utf8')) : {};

// Heuristic: classify by section markers in the chart-of-accounts header rows.
// Hashavshevet reports show: row5≈"רווח והפסד"/"מאזן", row7≈section, row9≈subsection.
// Returns: income | expense | tax | financing | balance | other
function classifySection(rows, fileName) {
  let txt = '';
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    txt += ' ' + (rows[i] || []).filter(c => c != null).join(' ');
  }

  const fn = fileName.replace(/\.xlsx?$/i, '');

  // explicit financing markers (balance-sheet items)
  // (Hebrew letters aren't \w in JS regex — avoid \b)
  if (/^(בעלים|הלוואה|הלוואת|השקעות|הון בעלים)/.test(fn)) return 'financing';
  if (/הלוואה|הלוואת|השקעות|הון בעלים/.test(fn)) return 'financing';
  // tax/social
  if (/מע"?מ|מקדמות מס|ניכויים מס|החזרים מס|ביטוח לאומי/.test(fn)) return 'tax';
  // generic "debts" or "Klal" (insurance) — leave as expense
  if (/^כלל\b|^כלל /.test(fn)) return 'expense';
  if (/תשלומי חובות/.test(fn)) return 'financing';

  // P&L
  if (txt.includes('הוצאות') && !txt.includes('הכנסות מ')) return 'expense';
  if (txt.includes('הכנסות')) return 'income';

  // suppliers/customers ("חוז" prefix files = related-party accounts)
  if (/^חוז /.test(fn)) return 'related';

  return 'other';
}

// .xls כרטסת format (e.g. קניות 22-26.xls, הכנסות 20-26.xls): wider layout.
// Layout: col 0 = פרטים/desc, col 12 = תאריך ערך, col 15 = תאריך אסמכתא,
//         col 18 = יתרה, col 20 = זכות (credit), col 23 = חובה (debit), col 27 = חשבון נגדי.
// Earlier version assumed col 23 was signed movement — that lost the credit side
// for income accounts (קניות has mostly col 23, הכנסות has mostly col 20).
function parseWideXls(rows) {
  const data = [];
  let currentYear = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const desc = String(row[0] || '').trim();
    const valueDate = row[12];
    const credit = typeof row[20] === 'number' ? row[20] : 0;
    const debit  = typeof row[23] === 'number' ? row[23] : 0;

    // year marker (single 4-digit text)
    const compactCells = row.filter(c => c != null && c !== '');
    if (compactCells.length === 1 && /^\d{4}$/.test(String(compactCells[0]).trim())) {
      currentYear = parseInt(compactCells[0]);
      continue;
    }
    // skip subtotals / page footers
    if (desc.startsWith('סה') || desc.includes('דף ')) continue;

    if (!(valueDate instanceof Date) || (credit === 0 && debit === 0)) continue;

    data.push({
      description: desc,
      period: row[3] != null ? String(row[3]) : '',
      reference1: row[10] != null ? String(row[10]) : '',
      reference2: row[7]  != null ? String(row[7])  : '',
      valueDate: toISO(valueDate),
      docDate: row[15] instanceof Date ? toISO(row[15]) : null,
      balance: typeof row[18] === 'number' ? row[18] : parseNum(row[18]),
      credit,
      debit,
      counterAccount: row[27] != null ? String(row[27]).trim() : '',
      year: currentYear || valueDate.getFullYear(),
    });
  }
  return { rows: data, headerFound: data.length > 0 };
}

function parseSheet(rows) {
  // find the header row containing "פרטים" in col 0
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'פרטים') { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { rows: [], headerFound: false };

  const data = [];
  let currentYear = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const allEmpty = row.every(c => c == null || c === '');
    if (allEmpty) continue;

    // year marker rows: a single 4-digit year token
    const onlyNumbers = row.filter(c => c != null && c !== '');
    if (onlyNumbers.length === 1 && /^\d{4}$/.test(String(onlyNumbers[0]).trim())) {
      currentYear = parseInt(onlyNumbers[0]);
      continue;
    }

    // skip subtotal rows ("סה"כ ...")
    const cell5 = String(row[5] || '');
    if (cell5.includes("סה''כ") || cell5.includes('סה"כ') || cell5.startsWith('סה')) continue;

    // a real data row has a Date in col 4 (תאריך ערך)
    const dateCell = row[4];
    if (!(dateCell instanceof Date)) continue;

    const credit = parseNum(row[8]);
    const debit  = parseNum(row[9]);
    const balance = parseNum(row[6]);
    if (credit === null && debit === null) continue;

    data.push({
      description: row[0] != null ? String(row[0]) : '',
      period: row[1] != null ? String(row[1]) : '',
      reference1: row[2] != null ? String(row[2]) : '',
      reference2: row[3] != null ? String(row[3]) : '',
      valueDate: toISO(dateCell),
      docDate: row[5] instanceof Date ? toISO(row[5]) : null,
      balance,
      credit,
      debit,
      counterAccount: row[11] != null ? String(row[11]) : '',
      year: currentYear || (dateCell instanceof Date ? dateCell.getFullYear() : null),
    });
  }
  return { rows: data, headerFound: true };
}

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/,/g, '').trim();
  // parens = negative (accounting)
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function toISO(d) {
  if (!(d instanceof Date)) return null;
  const yr = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

const categories = [];
let totalRows = 0;

for (const file of files) {
  if (SKIP_FILES.has(file)) { console.log(`[skip] ${file} — bank statement, manual handling needed`); continue; }
  const buf = readFileSync(join(SRC, file));
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames.includes('גיליון2') ? 'גיליון2' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // .xls files use the wide format; .xlsx uses the standard כרטסת format.
  const isXls = /\.xls$/i.test(file);
  const { rows: dataRows, headerFound } = isXls ? parseWideXls(rows) : parseSheet(rows);
  if (!headerFound || dataRows.length === 0) {
    console.log(`[skip] ${file} — no data rows`);
    continue;
  }

  // category name from filename (remove .xlsx and " 22-26"-style suffix)
  const name = file.replace(/\.xlsx?$/i, '').replace(/\s*\d{1,3}-\d{1,3}\s*$/, '').trim();
  // For the wide .xls (קניות), force section = expense (it's "עלות המכירות").
  // Exception: filename starting with הכנסות = income.
  const section = isXls
    ? (/^הכנסות/.test(name) ? 'income' : 'expense')
    : classifySection(rows, file);
  const id = name.replace(/\s+/g, '_');

  const enriched = dataRows.map((r, idx) => {
    const rowId = `${id}::${idx}`;
    const ov = overlay[rowId] || {};
    return { id: rowId, ...r, flagged: !!ov.flagged, note: ov.note || '', editedDescription: ov.editedDescription || null };
  });

  const totals = enriched.reduce((acc, r) => {
    if (r.flagged) { acc.flaggedCredit += r.credit || 0; acc.flaggedDebit += r.debit || 0; }
    else { acc.credit += r.credit || 0; acc.debit += r.debit || 0; }
    return acc;
  }, { credit: 0, debit: 0, flaggedCredit: 0, flaggedDebit: 0 });

  categories.push({ id, name, section, file, rowCount: enriched.length, totals, rows: enriched });
  totalRows += enriched.length;
  console.log(`[ok]  ${file} → ${enriched.length} rows (${section})`);
}

// Apply user section overrides (saved in overlay.categories[id].section)
const sectionOverrides = (overlay.categories) || {};

const summary = categories.reduce((acc, c) => {
  const ov = sectionOverrides[c.id];
  if (ov && ov.section) c.section = ov.section;

  if (c.section === 'income')  { acc.income += c.totals.credit; acc.flaggedIncome += c.totals.flaggedCredit; }
  if (c.section === 'expense') { acc.expense += c.totals.debit; acc.flaggedExpense += c.totals.flaggedDebit; }
  if (c.section === 'tax')     { acc.tax += c.totals.debit + c.totals.credit; }
  if (c.section === 'financing'){ acc.financing += c.totals.debit + c.totals.credit; }
  return acc;
}, { income: 0, expense: 0, tax: 0, financing: 0, flaggedIncome: 0, flaggedExpense: 0 });

const out = {
  generatedAt: new Date().toISOString(),
  source: SRC,
  fileCount: categories.length,
  totalRows,
  summary,
  categories,
};

writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`\nWrote ${OUT}`);
console.log(`Categories: ${categories.length}, total rows: ${totalRows}`);
console.log(`Summary: income=${summary.income.toFixed(2)}, expense=${summary.expense.toFixed(2)}`);
