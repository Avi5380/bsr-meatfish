// Express server: serves the SPA and persists user overlays.
// Original .xlsx files are NEVER modified — overlay.json holds flags + edits.

import express from 'express';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH    = join(__dirname, 'data.json');
const OVERLAY_PATH = join(__dirname, 'overlay.json');

function loadOverlay() {
  if (!existsSync(OVERLAY_PATH)) return { rows: {}, categories: {} };
  try {
    const o = JSON.parse(readFileSync(OVERLAY_PATH, 'utf8'));
    return { rows: o.rows || {}, categories: o.categories || {} };
  } catch { return { rows: {}, categories: {} }; }
}
function saveOverlay(o) {
  writeFileSync(OVERLAY_PATH, JSON.stringify(o, null, 2), 'utf8');
}

// Build the canonical view: data.json merged with overlay.
function buildView() {
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const overlay = loadOverlay();

  const summary = { income: 0, expense: 0, tax: 0, financing: 0, related: 0,
                    flaggedIncome: 0, flaggedExpense: 0, rowCount: 0, flaggedCount: 0 };
  const yearly = {}; // year -> { income, expense, tax, financing, related, flaggedIncome, flaggedExpense, count }

  function yr(y) {
    if (!yearly[y]) yearly[y] = { year: y, income: 0, expense: 0, tax: 0, financing: 0, related: 0,
                                   flaggedIncome: 0, flaggedExpense: 0, count: 0, flaggedCount: 0 };
    return yearly[y];
  }

  for (const cat of data.categories) {
    const ov = overlay.categories[cat.id];
    if (ov?.section) cat.section = ov.section;
    if (ov?.displayName) cat.displayName = ov.displayName;

    let credit = 0, debit = 0, fCredit = 0, fDebit = 0, flagged = 0;
    cat.byYear = {}; // year -> { credit, debit, flaggedCredit, flaggedDebit, count }

    for (const r of cat.rows) {
      const rov = overlay.rows[r.id] || {};
      r.flagged = !!rov.flagged;
      r.note    = rov.note || '';
      r.editedDescription = rov.editedDescription || null;
      r.classification = rov.classification || null;
      r.entity         = rov.entity         || null;
      summary.rowCount++;

      const y = r.year || (r.valueDate ? Number(r.valueDate.slice(0, 4)) : null);
      const yc = y ? (cat.byYear[y] = cat.byYear[y] || { credit: 0, debit: 0, flaggedCredit: 0, flaggedDebit: 0, count: 0 }) : null;
      const ys = y ? yr(y) : null;
      if (yc) yc.count++;
      if (ys) ys.count++;

      if (r.flagged) {
        flagged++;
        summary.flaggedCount++;
        fCredit += r.credit || 0;
        fDebit  += r.debit  || 0;
        if (yc) { yc.flaggedCredit += r.credit || 0; yc.flaggedDebit += r.debit || 0; }
        if (ys) ys.flaggedCount++;
        if (cat.section === 'income'  && ys) ys.flaggedIncome  += (r.credit || 0) - (r.debit  || 0);
        if (cat.section === 'expense' && ys) ys.flaggedExpense += (r.debit  || 0) - (r.credit || 0);
      } else {
        credit += r.credit || 0;
        debit  += r.debit  || 0;
        if (yc) { yc.credit += r.credit || 0; yc.debit += r.debit || 0; }
        if (ys) {
          // NET: refunds/reversals (זיכויים) cancel out properly.
          if (cat.section === 'income')    ys.income    += (r.credit || 0) - (r.debit  || 0);
          if (cat.section === 'expense')   ys.expense   += (r.debit  || 0) - (r.credit || 0);
          if (cat.section === 'tax')       ys.tax       += (r.debit || 0) + (r.credit || 0);
          if (cat.section === 'financing') ys.financing += (r.debit || 0) + (r.credit || 0);
          if (cat.section === 'related')   ys.related   += (r.debit || 0) + (r.credit || 0);
        }
      }
    }
    cat.totals = { credit, debit, flaggedCredit: fCredit, flaggedDebit: fDebit, flaggedCount: flagged,
                   net: cat.section === 'income' ? credit - debit
                      : cat.section === 'expense' ? debit - credit
                      : debit + credit };

    // NET totals (debit minus credit for expense; credit minus debit for income).
    if (cat.section === 'income')    { summary.income    += (credit - debit); summary.flaggedIncome  += (fCredit - fDebit); }
    if (cat.section === 'expense')   { summary.expense   += (debit - credit); summary.flaggedExpense += (fDebit - fCredit); }
    if (cat.section === 'tax')       { summary.tax       += debit + credit; }
    if (cat.section === 'financing') { summary.financing += debit + credit; }
    if (cat.section === 'related')   { summary.related   += debit + credit; }
  }
  data.summary = summary;
  data.yearly  = Object.values(yearly).sort((a, b) => a.year - b.year);
  return data;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// Force no-cache so users always see latest version through tunnels/proxies.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(join(__dirname, 'public'), { etag: false, lastModified: false }));

app.get('/api/data', (_req, res) => {
  try { res.json(buildView()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Classifications are stored in classifications.json (user-editable via API).
const CLASSIFICATIONS_PATH = join(__dirname, 'classifications.json');
function loadClassifications() {
  if (!existsSync(CLASSIFICATIONS_PATH)) return { items: [] };
  try { return JSON.parse(readFileSync(CLASSIFICATIONS_PATH, 'utf8')); } catch { return { items: [] }; }
}
function saveClassifications(d) {
  writeFileSync(CLASSIFICATIONS_PATH, JSON.stringify(d, null, 2), 'utf8');
}
function validClassificationIds() {
  return new Set(loadClassifications().items.map(c => c.id));
}

// CRUD: list / add / edit / delete classifications
app.get('/api/classifications', (_req, res) => {
  // include usage counts per classification (so user knows what gets orphaned on delete)
  const data = loadClassifications();
  const overlay = loadOverlay();
  const counts = {};
  for (const row of Object.values(overlay.rows || {})) {
    if (row.classification) counts[row.classification] = (counts[row.classification] || 0) + 1;
  }
  res.json({ items: data.items.map(c => ({ ...c, usageCount: counts[c.id] || 0 })) });
});

app.post('/api/classifications', (req, res) => {
  const { he, color } = req.body || {};
  if (!he || typeof he !== 'string' || !he.trim()) return res.status(400).json({ error: 'name required' });
  const data = loadClassifications();
  const id = 'cl_' + Math.random().toString(36).slice(2, 9);
  const item = { id, he: he.trim().slice(0, 60), color: (color || '#6b6b6b').slice(0, 9) };
  data.items.push(item);
  saveClassifications(data);
  res.json({ ok: true, item });
});

app.put('/api/classifications/:id', (req, res) => {
  const data = loadClassifications();
  const item = data.items.find(c => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const { he, color } = req.body || {};
  if (he !== undefined) item.he = String(he).trim().slice(0, 60);
  if (color !== undefined) item.color = String(color).slice(0, 9);
  saveClassifications(data);
  res.json({ ok: true, item });
});

app.delete('/api/classifications/:id', (req, res) => {
  const data = loadClassifications();
  const idx = data.items.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const [removed] = data.items.splice(idx, 1);
  saveClassifications(data);
  // Clear this classification from any rows that used it
  const overlay = loadOverlay();
  let cleared = 0;
  for (const r of Object.values(overlay.rows || {})) {
    if (r.classification === removed.id) { r.classification = null; cleared++; }
  }
  if (cleared > 0) saveOverlay(overlay);
  res.json({ ok: true, removed, cleared });
});

// Toggle / set flag, edit description, set note, set classification
app.put('/api/rows/:id', (req, res) => {
  const overlay = loadOverlay();
  const id = req.params.id;
  const cur = overlay.rows[id] || {};
  const { flagged, note, editedDescription, classification } = req.body || {};
  if (flagged !== undefined) cur.flagged = !!flagged;
  if (note !== undefined) cur.note = String(note || '');
  if (editedDescription !== undefined) cur.editedDescription = editedDescription || null;
  if (classification !== undefined) {
    if (classification === null || classification === '') {
      cur.classification = null;
    } else if (validClassificationIds().has(classification)) {
      cur.classification = classification;
    } else {
      return res.status(400).json({ error: 'invalid classification' });
    }
  }
  if (req.body.entity !== undefined) {
    cur.entity = req.body.entity ? String(req.body.entity).trim().slice(0, 100) : null;
  }
  overlay.rows[id] = cur;
  saveOverlay(overlay);
  res.json({ ok: true, row: cur });
});

// Bulk flag all rows in a category
app.post('/api/categories/:id/flag', (req, res) => {
  const overlay = loadOverlay();
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const cat = data.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'category not found' });
  const flagged = !!req.body?.flagged;
  for (const r of cat.rows) {
    const cur = overlay.rows[r.id] || {};
    cur.flagged = flagged;
    overlay.rows[r.id] = cur;
  }
  saveOverlay(overlay);
  res.json({ ok: true, count: cat.rows.length });
});

// Override a category's section ("income" | "expense" | "tax" | ...)
app.put('/api/categories/:id', (req, res) => {
  const overlay = loadOverlay();
  const id = req.params.id;
  const cur = overlay.categories[id] || {};
  const { section, displayName } = req.body || {};
  if (section !== undefined)     cur.section = section || undefined;
  if (displayName !== undefined) cur.displayName = displayName || undefined;
  overlay.categories[id] = cur;
  saveOverlay(overlay);
  res.json({ ok: true, category: cur });
});

// ============= AUDIO STREAMING =============
const AUDIO_DIR_FILE = join(__dirname, 'audio-dir.txt');
const AUDIO_DIR = existsSync(AUDIO_DIR_FILE) ? readFileSync(AUDIO_DIR_FILE, 'utf8').replace(/^﻿/, '').trim() : null;

app.get('/api/audio/:file', (req, res) => {
  const file = req.params.file;
  // Whitelist filename pattern: prevents path traversal
  if (!/^[A-Z0-9-]+\.opus$/i.test(file)) return res.status(400).json({ error: 'invalid filename' });
  if (!AUDIO_DIR) return res.status(503).json({ error: 'audio dir not configured' });
  const path = join(AUDIO_DIR, file);
  if (!existsSync(path)) return res.status(404).json({ error: 'file not found' });
  res.set('Content-Type', 'audio/ogg');
  res.sendFile(path);
});

// ============= CASE FILE (cash evidence) =============
const CASE_PATH        = join(__dirname, 'case-file.json');
const CASE_OVERLAY_PATH = join(__dirname, 'case-overlay.json');

function loadCaseOverlay() {
  if (!existsSync(CASE_OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(CASE_OVERLAY_PATH, 'utf8')); } catch { return {}; }
}
function saveCaseOverlay(o) {
  writeFileSync(CASE_OVERLAY_PATH, JSON.stringify(o, null, 2), 'utf8');
}

// Build evidence-id from item content (chat+date+time+first 20 chars of body).
// Stable across re-parses as long as the source message doesn't change.
function evId(e, idx) {
  const head = (e.body || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return `${e.chatId}-${e.date}-${e.time}-${idx}-${head}`;
}

const VALID_STATUS   = new Set(['taken','not_related','returned','review']);
const VALID_CATEGORY = new Set(['salary','store','returned_cash','change','maintenance','loan','other']);

function buildCaseView() {
  const data = JSON.parse(readFileSync(CASE_PATH, 'utf8'));
  const overlay = loadCaseOverlay();
  const totals = { taken: 0, not_related: 0, returned: 0, review: 0 };
  const totalsByCat = {}; // category -> amount (only counts items with status === 'taken')
  const byYear = {};
  for (let i = 0; i < data.evidence.length; i++) {
    const e = data.evidence[i];
    e.id = evId(e, i);
    const ov = overlay[e.id] || {};
    e.status   = ov.status   || 'review';
    e.category = ov.category || 'other';
    e.userNote = ov.note     || '';
    const amt = e.amounts.reduce((s,a) => s + a.amount, 0);
    e.totalAmount = amt;
    totals[e.status] += amt;
    if (e.status === 'taken') totalsByCat[e.category] = (totalsByCat[e.category] || 0) + amt;
    const yr = e.date.slice(0,4);
    if (!byYear[yr]) byYear[yr] = { year: yr, taken: 0, not_related: 0, returned: 0, review: 0, count: 0, byCategory: {} };
    byYear[yr][e.status] += amt;
    byYear[yr].count++;
    if (e.status === 'taken') byYear[yr].byCategory[e.category] = (byYear[yr].byCategory[e.category] || 0) + amt;
  }
  data.live = { totals, totalsByCat, byYear: Object.values(byYear).sort((a,b) => a.year.localeCompare(b.year)) };
  return data;
}

app.get('/api/case', (_req, res) => {
  try { res.json(buildCaseView()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/case/items/:id', (req, res) => {
  const overlay = loadCaseOverlay();
  const id = req.params.id;
  const cur = overlay[id] || {};
  const { status, category, note } = req.body || {};
  if (status !== undefined) {
    if (!VALID_STATUS.has(status)) return res.status(400).json({ error: 'invalid status' });
    cur.status = status;
  }
  if (category !== undefined) {
    if (!VALID_CATEGORY.has(category)) return res.status(400).json({ error: 'invalid category' });
    cur.category = category;
  }
  if (note !== undefined) cur.note = String(note || '');
  overlay[id] = cur;
  saveCaseOverlay(overlay);
  res.json({ ok: true, item: cur });
});

// ============= DELIVERIES (משלוחים & חיובים) =============
const DELIVERIES_PATH         = join(__dirname, 'deliveries.json');
const DELIVERIES_OVERLAY_PATH = join(__dirname, 'deliveries-overlay.json');

const VALID_DEL_STATUS = new Set(['pending','confirmed','disputed','duplicate','excluded']);
const VALID_DEL_TYPE   = new Set(['delivery','employee_hours','hours','purchase','other']);

function loadDelOverlay() {
  if (!existsSync(DELIVERIES_OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(DELIVERIES_OVERLAY_PATH, 'utf8')); } catch { return {}; }
}
function saveDelOverlay(o) { writeFileSync(DELIVERIES_OVERLAY_PATH, JSON.stringify(o, null, 2), 'utf8'); }

function buildDeliveriesView() {
  const data = JSON.parse(readFileSync(DELIVERIES_PATH, 'utf8'));
  const overlay = loadDelOverlay();
  const live = {
    totalCount: 0, totalAmount: 0,
    byType:    {}, byMonth:  {}, byDriver: {}, byCity: {}, byWorker: {},
    byStatus:  {},
  };
  for (const c of data.charges) {
    const ov = overlay[c.id] || {};
    c.status          = ov.status   || 'pending';
    c.userType        = ov.type     || c.type;       // user may reclassify
    c.userAmount      = ov.amount   !== undefined ? ov.amount   : null;
    c.userNote        = ov.note     || '';
    c.effectiveAmount = c.userAmount !== null ? c.userAmount : (c.extracted.amount || 0);
    if (c.status === 'excluded' || c.status === 'duplicate') continue; // not counted in totals
    live.totalCount++;
    live.totalAmount += c.effectiveAmount;
    live.byType[c.userType]   = (live.byType[c.userType]   || 0) + c.effectiveAmount;
    const mo = c.date.slice(0,7);
    live.byMonth[mo]          = (live.byMonth[mo]          || 0) + c.effectiveAmount;
    live.byDriver[c.speaker]  = (live.byDriver[c.speaker]  || 0) + c.effectiveAmount;
    for (const city of c.extracted.cities) live.byCity[city.name] = (live.byCity[city.name] || 0) + c.effectiveAmount;
    if (c.extracted.workerName) live.byWorker[c.extracted.workerName] = (live.byWorker[c.extracted.workerName] || 0) + c.effectiveAmount;
    live.byStatus[c.status]   = (live.byStatus[c.status]   || 0) + c.effectiveAmount;
  }
  data.live = live;
  return data;
}

app.get('/api/deliveries', (_req, res) => {
  try { res.json(buildDeliveriesView()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/deliveries/:id', (req, res) => {
  const overlay = loadDelOverlay();
  const id = req.params.id;
  const cur = overlay[id] || {};
  const { status, type, amount, note } = req.body || {};
  if (status !== undefined) {
    if (!VALID_DEL_STATUS.has(status)) return res.status(400).json({ error: 'invalid status' });
    cur.status = status;
  }
  if (type !== undefined) {
    if (!VALID_DEL_TYPE.has(type)) return res.status(400).json({ error: 'invalid type' });
    cur.type = type;
  }
  if (amount !== undefined) {
    cur.amount = amount === null || amount === '' ? null : Number(amount);
    if (cur.amount !== null && (isNaN(cur.amount) || cur.amount < 0)) return res.status(400).json({ error: 'invalid amount' });
  }
  if (note !== undefined) cur.note = String(note || '');
  overlay[id] = cur;
  saveDelOverlay(overlay);
  res.json({ ok: true, item: cur });
});

// ============= PERSONAL TRACKING (Yoel's spreadsheets) =============
const TRACKING_PATH         = join(__dirname, 'tracking.json');
const TRACKING_OVERLAY_PATH = join(__dirname, 'tracking-overlay.json');

function loadTracking() {
  if (!existsSync(TRACKING_PATH)) return { rows: [], aggregations: {} };
  return JSON.parse(readFileSync(TRACKING_PATH, 'utf8'));
}
function loadTrackingOverlay() {
  if (!existsSync(TRACKING_OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(TRACKING_OVERLAY_PATH, 'utf8')); } catch { return {}; }
}
function saveTrackingOverlay(o) { writeFileSync(TRACKING_OVERLAY_PATH, JSON.stringify(o, null, 2), 'utf8'); }

// Build tracking match index: amount (abs, 2dp) -> array of tracking rows
let _trackingIndex = null;
let _trackingMTime = 0;
function getTrackingIndex() {
  if (!existsSync(TRACKING_PATH)) return null;
  const stat = statSync(TRACKING_PATH);
  if (_trackingIndex && stat.mtimeMs === _trackingMTime) return _trackingIndex;
  const data = loadTracking();
  const idx = { byAmount: new Map(), rows: data.rows };
  for (const t of data.rows) {
    const key = Math.abs(t.amount).toFixed(2);
    if (!idx.byAmount.has(key)) idx.byAmount.set(key, []);
    idx.byAmount.get(key).push(t);
  }
  _trackingIndex = idx;
  _trackingMTime = stat.mtimeMs;
  return idx;
}

// Match a bank row to tracking rows
// match = same date ±30 days, same absolute amount, correct direction
const MATCH_DAY_TOLERANCE = 30;
const TRACKING_START_DATE = '2021-04-07';
const TRACKING_END_DATE   = '2024-12-31';
function findTrackingMatches(bankRow, idx) {
  if (!idx) return { matches: [], reason: 'no_tracking' };
  const amount = bankRow.credit > 0 ? bankRow.credit : bankRow.debit;
  const bankDirection = bankRow.credit > 0 ? 'in' : 'out';
  const key = amount.toFixed(2);
  const candidates = idx.byAmount.get(key) || [];
  const bankDateMs = new Date(bankRow.date).getTime();
  const matches = candidates
    .filter(t => t.direction === bankDirection)
    .filter(t => {
      const dt = new Date(t.payDate).getTime();
      return Math.abs(dt - bankDateMs) <= MATCH_DAY_TOLERANCE * 86400000;
    })
    .map(t => ({
      id: t.id,
      payDate: t.payDate,
      amount: t.amount,
      category: t.category,
      topCat: t.topCat,
      subCat: t.subCat,
      details: t.details,
      notes: t.notes,
      supplier: t.supplier,
      dayDiff: Math.round((new Date(t.payDate).getTime() - bankDateMs) / 86400000),
    }))
    .sort((a, b) => Math.abs(a.dayDiff) - Math.abs(b.dayDiff));

  // If no match — produce a clear reason
  let reason = null;
  if (matches.length === 0) {
    if (bankRow.date > TRACKING_END_DATE) {
      reason = 'after_tracking';
    } else if (bankRow.date < TRACKING_START_DATE) {
      reason = 'before_tracking';
    } else if (candidates.length === 0) {
      reason = 'amount_never_appears';
    } else {
      // Amount appears in tracking, but no match within ±30d. Find the closest.
      const directionalCandidates = candidates.filter(t => t.direction === bankDirection);
      if (directionalCandidates.length === 0) {
        reason = 'opposite_direction_only';
      } else {
        let closest = null;
        for (const t of directionalCandidates) {
          const diff = Math.abs(new Date(t.payDate).getTime() - bankDateMs) / 86400000;
          if (!closest || diff < closest) closest = diff;
        }
        reason = `closest_${Math.round(closest)}d`;
      }
    }
  }
  return { matches, reason };
}

app.get('/api/tracking', (_req, res) => {
  try {
    const data = loadTracking();
    const overlay = loadTrackingOverlay();
    for (const r of data.rows) {
      const ov = overlay[r.id] || {};
      r.classification = ov.classification || null;
      r.userNote       = ov.note           || '';
      r.flagged        = !!ov.flagged;
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tracking/rows/:id', (req, res) => {
  const overlay = loadTrackingOverlay();
  const id = req.params.id;
  const cur = overlay[id] || {};
  const { classification, note, flagged } = req.body || {};
  if (classification !== undefined) {
    if (classification === null || classification === '') cur.classification = null;
    else if (validClassificationIds().has(classification)) cur.classification = classification;
    else return res.status(400).json({ error: 'invalid classification' });
  }
  if (note !== undefined) cur.note = String(note || '');
  if (flagged !== undefined) cur.flagged = !!flagged;
  overlay[id] = cur;
  saveTrackingOverlay(overlay);
  res.json({ ok: true, row: cur });
});

// ============= BANK STATEMENTS =============
const BANKS_PATH         = join(__dirname, 'banks.json');
const BANK_OVERLAY_PATH  = join(__dirname, 'bank-overlay.json');

function loadBankOverlay() {
  if (!existsSync(BANK_OVERLAY_PATH)) return {};
  try { return JSON.parse(readFileSync(BANK_OVERLAY_PATH, 'utf8')); } catch { return {}; }
}
function saveBankOverlay(o) { writeFileSync(BANK_OVERLAY_PATH, JSON.stringify(o, null, 2), 'utf8'); }

function buildBanksView() {
  const data = JSON.parse(readFileSync(BANKS_PATH, 'utf8'));
  const overlay = loadBankOverlay();
  const trkIdx = getTrackingIndex();
  let matchedCount = 0;
  for (const r of data.rows) {
    const ov = overlay[r.id] || {};
    r.classification = ov.classification || null;
    r.note           = ov.note           || '';
    r.flagged        = !!ov.flagged;
    // Attach tracking matches with reason for no-match
    const { matches, reason } = findTrackingMatches(r, trkIdx);
    r.trackingMatches = matches;
    r.noMatchReason = matches.length === 0 ? reason : null;
    if (matches.length > 0) matchedCount++;
  }
  data.matchedRowCount = matchedCount;
  return data;
}

app.get('/api/banks', (_req, res) => {
  try { res.json(buildBanksView()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/banks/rows/:id', (req, res) => {
  const overlay = loadBankOverlay();
  const id = req.params.id;
  const cur = overlay[id] || {};
  const { classification, note, flagged } = req.body || {};
  if (classification !== undefined) {
    if (classification === null || classification === '') cur.classification = null;
    else if (validClassificationIds().has(classification)) cur.classification = classification;
    else return res.status(400).json({ error: 'invalid classification' });
  }
  if (note !== undefined) cur.note = String(note || '');
  if (flagged !== undefined) cur.flagged = !!flagged;
  overlay[id] = cur;
  saveBankOverlay(overlay);
  res.json({ ok: true, row: cur });
});

const PORT = process.env.PORT || 3031;
app.listen(PORT, () => console.log(`▶ http://localhost:${PORT}`));
