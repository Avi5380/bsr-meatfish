// Look deeper at one accounting file & at excel (6).xlsx
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = 'D:/user/Downloads/זבל/הוצאות אופויקיניג';

function dump(file, sheet, fromRow, count) {
  const wb = XLSX.read(readFileSync(join(SRC, file)), { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[sheet];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`\n=== ${file} [${sheet}] rows=${rows.length} ===`);
  for (let i = fromRow; i < Math.min(fromRow + count, rows.length); i++) {
    const row = rows[i] || [];
    const cells = row.map(c => {
      if (c === null) return '·';
      if (c instanceof Date) return c.toISOString().slice(0,10);
      return String(c).slice(0, 30);
    });
    console.log(`${String(i).padStart(3)}: ${cells.join(' | ')}`);
  }
}

// A typical category file
dump('הכנסות 22-26.xlsx', 'גיליון2', 0, 40);
// Another for variety
dump('שכירות 22-26.xlsx', 'גיליון2', 0, 40);
// The unified register
dump('excel (6).xlsx', 'ExcelGrid', 0, 30);
// Bank statement
dump('דפי בנק 1.1.23-6.8.23.xls', 'Activities', 0, 20);
