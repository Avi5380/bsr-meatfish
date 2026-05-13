// Quick explorer: scan all xlsx files and dump first sheet structure
import * as XLSX from 'xlsx';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SRC = 'D:/user/Downloads/זבל/הוצאות אופויקיניג';
const files = readdirSync(SRC).filter(f => /\.(xlsx|xls)$/i.test(f));

console.log(`Found ${files.length} files\n`);

for (const f of files) {
  const buf = readFileSync(join(SRC, f));
  let wb;
  try { wb = XLSX.read(buf, { type: 'buffer', cellDates: true }); }
  catch (e) { console.log(`!! ${f}: ${e.message}`); continue; }

  console.log(`=== ${f} ===`);
  console.log(`  sheets: ${wb.SheetNames.join(', ')}`);
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    console.log(`  [${sn}] rows=${rows.length}`);
    // print first 4 rows
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      const row = rows[i];
      const compact = (row || []).slice(0, 8).map(c =>
        c === null ? '·' : (c instanceof Date ? c.toISOString().slice(0,10) : String(c).slice(0, 25))
      ).join(' | ');
      console.log(`    ${i}: ${compact}`);
    }
  }
  console.log();
}
