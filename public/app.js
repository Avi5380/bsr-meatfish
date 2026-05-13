// Optikining SPA — vanilla JS, mobile-first.
// Views: overview / years / categories / flagged / category-detail / year-detail / row-sheet.

const SECTION_LABELS = {
  income:    { label: 'הכנסות',     color: 'income'    },
  expense:   { label: 'הוצאות',     color: 'expense'   },
  tax:       { label: 'מיסים',      color: 'tax'       },
  financing: { label: 'מימון',      color: 'financing' },
  related:   { label: 'חוז (קשור)', color: 'related'   },
  other:     { label: 'אחר',        color: 'other'     },
};
const SECTION_ORDER = ['income','expense','tax','financing','related','other'];

const fmt = n => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n));
};
const fmtFull = n => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};
const fmtDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const state = {
  data: null,
  view: 'overview',
  selectedCategory: null,
  selectedYear: null,
  yearFilter: 'all',
};

const main = document.getElementById('main');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const backBtn = document.getElementById('backBtn');
const sheet = document.getElementById('sheet');
const sheetCard = document.getElementById('sheetCard');
const toast = document.getElementById('toast');

backBtn.addEventListener('click', () => {
  if (state.selectedCategory) { state.selectedCategory = null; render(); return; }
  if (state.selectedYear) { state.selectedYear = null; render(); return; }
});
document.querySelectorAll('.tab').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    b.classList.add('active');
    state.view = b.dataset.tab;
    state.selectedCategory = null;
    state.selectedYear = null;
    render();
  });
});

document.querySelector('.sheet-backdrop')?.addEventListener('click', closeSheet);
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

async function load() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const r = await fetch('/api/data');
    state.data = await r.json();
    render();
  } catch (e) {
    main.innerHTML = `<div class="empty">שגיאה בטעינת נתונים: ${e.message}</div>`;
  }
}

function setHeader(title, subtitle, hasBack) {
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle || '';
  backBtn.hidden = !hasBack;
}

function render() {
  if (!state.data) return;
  if (state.selectedCategory) return renderCategory();
  if (state.selectedYear)     return renderYear();
  switch (state.view) {
    case 'overview':   return renderOverview();
    case 'years':      return renderYears();
    case 'categories': return renderCategories();
    case 'flagged':    return renderFlagged();
  }
}

// ============= OVERVIEW =============
function renderOverview() {
  const { summary, yearly, generatedAt, totalRows, fileCount } = state.data;
  setHeader('סקירה', `דוח מ-${fmtDate(generatedAt.slice(0,10))}`, false);

  const net = summary.income - summary.expense;
  const netClass = net >= 0 ? 'pos' : 'neg';
  const minYear = yearly.length ? yearly[0].year : '—';
  const maxYear = yearly.length ? yearly[yearly.length - 1].year : '—';

  const yearsHtml = yearly.map(y => yearCardHtml(y)).join('');

  main.innerHTML = `
    <section class="hero">
      <div class="hero-label">סך הכל • ${minYear}–${maxYear}</div>
      <div class="hero-net ${netClass}">${net >= 0 ? '+' : ''}${fmt(net)}<span class="currency">₪</span></div>
      <div class="hero-meta">${fileCount} קטגוריות · ${totalRows.toLocaleString('he-IL')} תנועות${summary.flaggedCount ? ` · ${summary.flaggedCount} מסומנים` : ''}</div>
      <div class="hero-split">
        <div class="split-cell income">
          <div class="label"><span class="dot"></span> הכנסות</div>
          <div class="value">${fmt(summary.income)} ₪</div>
          ${summary.flaggedIncome ? `<div class="sub">מסומנים: ${fmt(summary.flaggedIncome)} ₪</div>` : ''}
        </div>
        <div class="split-cell expense">
          <div class="label"><span class="dot"></span> הוצאות</div>
          <div class="value">${fmt(summary.expense)} ₪</div>
          ${summary.flaggedExpense ? `<div class="sub">מסומנים: ${fmt(summary.flaggedExpense)} ₪</div>` : ''}
        </div>
      </div>
    </section>

    <div class="section-h">לפי שנה <span class="count">${yearly.length}</span></div>
    <div class="years">${yearsHtml}</div>

    <div class="section-h">פירוט נוסף</div>
    <div class="cat-list">
      ${miniRow('מיסים', summary.tax, 'tax', '🧾')}
      ${miniRow('מימון', summary.financing, 'financing', '🏦')}
      ${miniRow('חוז (קשור)', summary.related, 'related', '🔗')}
    </div>
  `;
  attachYearClicks();
}

function yearCardHtml(y) {
  const net = (y.income || 0) - (y.expense || 0);
  const netClass = net >= 0 ? 'pos' : 'neg';
  return `
    <div class="year-card" data-year="${y.year}">
      <div class="count">${y.count} תנועות</div>
      <div class="yr">${y.year}</div>
      <div class="net ${netClass}">${net >= 0 ? '+' : ''}${fmt(net)} ₪</div>
      <div class="ie">
        <span class="in"><i style="background:var(--income)"></i>${fmt(y.income)}</span>
        <span class="out"><i style="background:var(--expense)"></i>${fmt(y.expense)}</span>
      </div>
    </div>
  `;
}
function miniRow(name, amount, color, glyph) {
  return `
    <div class="cat-row" style="cursor:default">
      <div class="cat-icon ${color}">${glyph}</div>
      <div>
        <div class="cat-name">${name}</div>
        <div class="cat-meta">תנועות פיננסיות נטרליות</div>
      </div>
      <div class="cat-amount neutral">${fmt(amount)} ₪</div>
    </div>
  `;
}
function attachYearClicks() {
  document.querySelectorAll('.year-card').forEach(c => {
    c.addEventListener('click', () => {
      state.selectedYear = parseInt(c.dataset.year);
      render();
    });
  });
}

// ============= YEARS TAB =============
function renderYears() {
  const { yearly } = state.data;
  setHeader('שנים', 'פירוט שנתי של כל הפעילות', false);
  const html = yearly.map(y => {
    const net = (y.income || 0) - (y.expense || 0);
    return `
      <div class="cat-row" data-year="${y.year}">
        <div class="cat-icon ${net >= 0 ? 'income' : 'expense'}">${y.year.toString().slice(2)}</div>
        <div>
          <div class="cat-name">${y.year}</div>
          <div class="cat-meta">${y.count} תנועות · הכנסות ${fmt(y.income)} ₪ · הוצאות ${fmt(y.expense)} ₪</div>
        </div>
        <div class="cat-amount ${net >= 0 ? 'income' : 'expense'}">${net >= 0 ? '+' : ''}${fmt(net)} ₪</div>
      </div>
    `;
  }).join('');
  main.innerHTML = `<div class="cat-list">${html}</div>`;
  document.querySelectorAll('[data-year]').forEach(c => {
    c.addEventListener('click', () => { state.selectedYear = parseInt(c.dataset.year); render(); });
  });
}

// ============= YEAR DETAIL =============
function renderYear() {
  const y = state.data.yearly.find(yr => yr.year === state.selectedYear);
  if (!y) { state.selectedYear = null; return render(); }
  const net = (y.income || 0) - (y.expense || 0);
  setHeader(`שנת ${y.year}`, `${y.count} תנועות`, true);

  // categories that have rows in this year
  const cats = state.data.categories
    .map(c => {
      const yc = c.byYear?.[y.year];
      if (!yc || yc.count === 0) return null;
      return { ...c, yearTotals: yc };
    })
    .filter(Boolean);

  // group by section
  const grouped = {};
  for (const c of cats) (grouped[c.section] ||= []).push(c);

  const sectionsHtml = SECTION_ORDER.filter(s => grouped[s]).map(s => {
    const list = grouped[s].sort((a, b) => {
      const av = (a.yearTotals.credit || 0) + (a.yearTotals.debit || 0);
      const bv = (b.yearTotals.credit || 0) + (b.yearTotals.debit || 0);
      return bv - av;
    });
    return `
      <div class="section-h">${SECTION_LABELS[s].label} <span class="count">${list.length}</span></div>
      <div class="cat-list">
        ${list.map(c => catRowHtml(c, c.yearTotals)).join('')}
      </div>
    `;
  }).join('');

  main.innerHTML = `
    <section class="hero">
      <div class="hero-label">סך הכל ${y.year}</div>
      <div class="hero-net ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmt(net)}<span class="currency">₪</span></div>
      <div class="hero-meta">${y.count} תנועות${y.flaggedCount ? ` · ${y.flaggedCount} מסומנים` : ''}</div>
      <div class="hero-split">
        <div class="split-cell income">
          <div class="label"><span class="dot"></span> הכנסות</div>
          <div class="value">${fmt(y.income)} ₪</div>
        </div>
        <div class="split-cell expense">
          <div class="label"><span class="dot"></span> הוצאות</div>
          <div class="value">${fmt(y.expense)} ₪</div>
        </div>
      </div>
    </section>
    ${sectionsHtml}
  `;
  attachCatClicks();
}

// ============= CATEGORIES TAB =============
function renderCategories() {
  setHeader('קטגוריות', `${state.data.categories.length} קטגוריות`, false);
  const grouped = {};
  for (const c of state.data.categories) (grouped[c.section] ||= []).push(c);

  const html = SECTION_ORDER.filter(s => grouped[s]).map(s => {
    const list = grouped[s].sort((a, b) => {
      const av = a.totals.credit + a.totals.debit;
      const bv = b.totals.credit + b.totals.debit;
      return bv - av;
    });
    return `
      <div class="section-h">${SECTION_LABELS[s].label} <span class="count">${list.length}</span></div>
      <div class="cat-list">${list.map(c => catRowHtml(c)).join('')}</div>
    `;
  }).join('');
  main.innerHTML = html;
  attachCatClicks();
}

function catRowHtml(c, customTotals) {
  const t = customTotals || c.totals;
  const initial = (c.displayName || c.name).slice(0, 2);
  // NET: for income/expense subtract refunds; for others show absolute movement.
  const amount = c.section === 'income'  ? (t.credit - t.debit)
               : c.section === 'expense' ? (t.debit - t.credit)
               : (t.credit + t.debit);
  const amountClass = c.section === 'income' ? 'income' : c.section === 'expense' ? 'expense' : 'neutral';
  const flagPill = c.totals.flaggedCount ? `<span class="flag-pill">${c.totals.flaggedCount} מסומנים</span>` : '';
  return `
    <div class="cat-row" data-cat="${c.id}">
      <div class="cat-icon ${SECTION_LABELS[c.section]?.color || 'other'}">${initial}</div>
      <div>
        <div class="cat-name">${c.displayName || c.name}${flagPill}</div>
        <div class="cat-meta">${(customTotals ? customTotals.count : c.rowCount)} תנועות</div>
      </div>
      <div class="cat-amount ${amountClass}">${fmt(amount)} ₪</div>
    </div>
  `;
}
function attachCatClicks() {
  document.querySelectorAll('[data-cat]').forEach(el => {
    el.addEventListener('click', () => { state.selectedCategory = el.dataset.cat; state.yearFilter = 'all'; render(); });
  });
}

// ============= CATEGORY DETAIL =============
function renderCategory() {
  const cat = state.data.categories.find(c => c.id === state.selectedCategory);
  if (!cat) { state.selectedCategory = null; return render(); }
  setHeader(cat.displayName || cat.name, `${cat.rowCount} תנועות · ${cat.file}`, true);

  // Year filter chips
  const years = Object.keys(cat.byYear || {}).sort();
  const filterBar = `
    <div class="filter-bar">
      <button class="chip ${state.yearFilter === 'all' ? 'active' : ''}" data-year="all">הכל</button>
      ${years.map(y => `<button class="chip ${state.yearFilter == y ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
    </div>
  `;

  // Filter rows by year
  const filteredRows = cat.rows.filter(r => state.yearFilter === 'all' || String(r.year) === String(state.yearFilter));

  // hero with totals
  const t = state.yearFilter === 'all' ? cat.totals : (cat.byYear[state.yearFilter] || { credit: 0, debit: 0, flaggedCount: 0 });
  const heroNet = (cat.section === 'income') ? t.credit
                  : (cat.section === 'expense') ? -t.debit
                  : (t.credit - t.debit);
  const sec = SECTION_LABELS[cat.section];

  // Group rows by year for visual separation
  const sortedRows = [...filteredRows].sort((a, b) => (b.valueDate || '').localeCompare(a.valueDate || ''));
  let txHtml = '';
  let lastYear = null;
  for (const r of sortedRows) {
    if (r.year !== lastYear) {
      txHtml += `<div class="year-strip">${r.year || '—'}</div>`;
      lastYear = r.year;
    }
    txHtml += txRowHtml(r);
  }
  if (!sortedRows.length) txHtml = `<div class="empty">אין תנועות לתקופה זו</div>`;

  main.innerHTML = `
    <section class="hero">
      <div class="hero-label">${sec?.label || cat.section} • ${state.yearFilter === 'all' ? 'כל התקופה' : state.yearFilter}</div>
      <div class="hero-net ${heroNet >= 0 ? 'pos' : 'neg'}">${heroNet >= 0 ? '' : ''}${fmt(heroNet)}<span class="currency">₪</span></div>
      <div class="hero-meta">${filteredRows.length} תנועות${t.flaggedCount ? ` · ${t.flaggedCount} מסומנים` : ''}</div>
      <div class="hero-split">
        <div class="split-cell income">
          <div class="label"><span class="dot"></span> זכות</div>
          <div class="value">${fmt(t.credit)} ₪</div>
        </div>
        <div class="split-cell expense">
          <div class="label"><span class="dot"></span> חובה</div>
          <div class="value">${fmt(t.debit)} ₪</div>
        </div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" id="btnEditCat">סיווג: ${sec?.label}</button>
      </div>
    </section>

    ${filterBar}
    <div class="tx-list">${txHtml}</div>
  `;

  document.querySelectorAll('.filter-bar .chip').forEach(c => {
    c.addEventListener('click', () => { state.yearFilter = c.dataset.year; render(); });
  });
  document.querySelectorAll('.tx-row').forEach(el => {
    el.addEventListener('click', () => openRowSheet(cat, el.dataset.id));
  });
  document.getElementById('btnEditCat')?.addEventListener('click', () => openCatSheet(cat));
}

function txRowHtml(r) {
  const desc = r.editedDescription || r.description || '(ללא תיאור)';
  const credit = r.credit || 0, debit = r.debit || 0;
  const isCredit = credit > 0 && debit === 0;
  const isDebit  = debit > 0 && credit === 0;
  const amount = isCredit ? credit : isDebit ? -debit : (credit - debit);
  return `
    <div class="tx-row ${r.flagged ? 'flagged' : ''}" data-id="${r.id}">
      <div>
        <div class="tx-desc">${escapeHtml(desc)}${r.flagged ? ' 🚩' : ''}</div>
        <div class="tx-meta">
          <span>${fmtDate(r.valueDate)}</span>
          ${r.reference1 ? `<span class="pill">אסמכתא ${escapeHtml(r.reference1)}</span>` : ''}
          ${r.counterAccount ? `<span class="pill">${escapeHtml(r.counterAccount.trim())}</span>` : ''}
        </div>
      </div>
      <div class="tx-amount ${isCredit ? 'credit' : isDebit ? 'debit' : ''}">
        ${amount >= 0 ? '+' : ''}${fmt(amount)} ₪
        <span class="balance">יתרה ${fmt(r.balance)}</span>
      </div>
    </div>
  `;
}

// ============= FLAGGED TAB =============
function renderFlagged() {
  const flagged = [];
  for (const c of state.data.categories) {
    for (const r of c.rows) {
      if (r.flagged) flagged.push({ ...r, _cat: c });
    }
  }
  setHeader('מסומנים', `${flagged.length} תנועות מסומנות`, false);
  const totalCredit = flagged.reduce((s, r) => s + (r.credit || 0), 0);
  const totalDebit  = flagged.reduce((s, r) => s + (r.debit || 0), 0);

  if (flagged.length === 0) {
    main.innerHTML = `
      <section class="hero">
        <div class="hero-label">מסומנים</div>
        <div class="hero-net pos">0<span class="currency">₪</span></div>
        <div class="hero-meta">לא סומנו תנועות. כדי לסמן תנועה לחץ עליה ובחר "סמן כחשבונית מדומה".</div>
      </section>
    `;
    return;
  }

  flagged.sort((a, b) => (b.valueDate || '').localeCompare(a.valueDate || ''));
  const txHtml = flagged.map(r => {
    const desc = r.editedDescription || r.description || '(ללא תיאור)';
    const credit = r.credit || 0, debit = r.debit || 0;
    const amount = credit > 0 ? credit : -debit;
    const isCredit = credit > 0;
    return `
      <div class="tx-row flagged" data-id="${r.id}" data-cat="${r._cat.id}">
        <div>
          <div class="tx-desc">${escapeHtml(desc)} 🚩</div>
          <div class="tx-meta">
            <span>${fmtDate(r.valueDate)}</span>
            <span class="pill">${escapeHtml(r._cat.name)}</span>
            ${r.note ? `<span class="pill">📝 ${escapeHtml(r.note)}</span>` : ''}
          </div>
        </div>
        <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">
          ${amount >= 0 ? '+' : ''}${fmt(amount)} ₪
        </div>
      </div>
    `;
  }).join('');

  main.innerHTML = `
    <section class="hero">
      <div class="hero-label">סך מסומנים</div>
      <div class="hero-net neg">${fmt(totalCredit + totalDebit)}<span class="currency">₪</span></div>
      <div class="hero-meta">${flagged.length} תנועות סומנו ולא נכללות בסיכומים</div>
      <div class="hero-split">
        <div class="split-cell income">
          <div class="label"><span class="dot"></span> בזכות</div>
          <div class="value">${fmt(totalCredit)} ₪</div>
        </div>
        <div class="split-cell expense">
          <div class="label"><span class="dot"></span> בחובה</div>
          <div class="value">${fmt(totalDebit)} ₪</div>
        </div>
      </div>
    </section>
    <div class="tx-list">${txHtml}</div>
  `;
  document.querySelectorAll('.tx-row[data-cat]').forEach(el => {
    el.addEventListener('click', () => {
      const cat = state.data.categories.find(c => c.id === el.dataset.cat);
      openRowSheet(cat, el.dataset.id);
    });
  });
}

// ============= ROW SHEET =============
function openRowSheet(cat, rowId) {
  const r = cat.rows.find(x => x.id === rowId);
  if (!r) return;
  const sec = SECTION_LABELS[cat.section];
  const credit = r.credit || 0, debit = r.debit || 0;
  const amountStr = credit > 0 ? `+${fmtFull(credit)}` : debit > 0 ? `-${fmtFull(debit)}` : '0';

  sheetCard.innerHTML = `
    <div class="sheet-handle"></div>
    <h3>פרטי תנועה</h3>
    <div style="font-size:13px; color:var(--text-dim); margin-bottom:14px">${sec?.label || ''} · ${cat.displayName || cat.name}</div>

    <div class="row-detail"><span class="k">תיאור</span><span class="v">${escapeHtml(r.editedDescription || r.description || '—')}</span></div>
    <div class="row-detail"><span class="k">סכום</span><span class="v" style="font-weight:700;color:${credit>0?'var(--income-2)':'var(--expense-2)'}">${amountStr} ₪</span></div>
    <div class="row-detail"><span class="k">תאריך ערך</span><span class="v">${fmtDate(r.valueDate)}</span></div>
    <div class="row-detail"><span class="k">תאריך אסמכתא</span><span class="v">${fmtDate(r.docDate) || '—'}</span></div>
    <div class="row-detail"><span class="k">פקודה</span><span class="v">${escapeHtml(r.period || '—')}</span></div>
    <div class="row-detail"><span class="k">אסמכתא</span><span class="v">${escapeHtml([r.reference1, r.reference2].filter(Boolean).join(' · ') || '—')}</span></div>
    <div class="row-detail"><span class="k">חשבון נגדי</span><span class="v">${escapeHtml(r.counterAccount?.trim() || '—')}</span></div>
    <div class="row-detail"><span class="k">יתרה רצה</span><span class="v">${fmtFull(r.balance)} ₪</span></div>
    <div class="row-detail"><span class="k">קובץ מקור</span><span class="v" style="font-size:11px; color:var(--text-mute)">${escapeHtml(cat.file)}</span></div>

    <h4>תיאור (עריכה)</h4>
    <input type="text" id="editDesc" value="${escapeAttr(r.editedDescription || r.description || '')}" placeholder="תיאור התנועה">

    <h4>הערה אישית</h4>
    <textarea id="editNote" placeholder="הוסף הערה (לא משנה את האקסל)">${escapeHtml(r.note || '')}</textarea>

    <div class="actions">
      <button class="btn flag ${r.flagged ? 'active' : ''}" id="btnFlag">${r.flagged ? '🚩 סומן' : '🚩 סמן כחשבונית מדומה'}</button>
      <button class="btn primary" id="btnSave">שמור</button>
    </div>
  `;
  sheet.hidden = false;

  document.getElementById('btnFlag').addEventListener('click', async () => {
    const newFlag = !r.flagged;
    await api(`PUT`, `/api/rows/${encodeURIComponent(r.id)}`, { flagged: newFlag });
    showToast(newFlag ? 'סומן' : 'הוסר סימון');
    closeSheet();
    await load();
  });
  document.getElementById('btnSave').addEventListener('click', async () => {
    const note = document.getElementById('editNote').value;
    const desc = document.getElementById('editDesc').value;
    await api(`PUT`, `/api/rows/${encodeURIComponent(r.id)}`, {
      note,
      editedDescription: desc === r.description ? null : desc,
    });
    showToast('נשמר');
    closeSheet();
    await load();
  });
}

// ============= CATEGORY SHEET =============
function openCatSheet(cat) {
  sheetCard.innerHTML = `
    <div class="sheet-handle"></div>
    <h3>סיווג קטגוריה</h3>
    <div style="font-size:13px; color:var(--text-dim); margin-bottom:14px">${cat.displayName || cat.name}</div>

    <h4>שם להצגה</h4>
    <input type="text" id="editCatName" value="${escapeAttr(cat.displayName || cat.name)}">

    <h4>סווג כ</h4>
    <select id="editSection">
      ${SECTION_ORDER.map(s => `<option value="${s}" ${cat.section===s?'selected':''}>${SECTION_LABELS[s].label}</option>`).join('')}
    </select>

    <h4>פעולות מקובצות</h4>
    <div class="actions">
      <button class="btn flag" id="btnFlagAll">🚩 סמן הכל</button>
      <button class="btn" id="btnUnflagAll">בטל סימון</button>
    </div>

    <div class="actions" style="margin-top:18px">
      <button class="btn" id="btnCancel">ביטול</button>
      <button class="btn primary" id="btnSaveCat">שמור</button>
    </div>
  `;
  sheet.hidden = false;
  document.getElementById('btnCancel').addEventListener('click', closeSheet);
  document.getElementById('btnSaveCat').addEventListener('click', async () => {
    const section = document.getElementById('editSection').value;
    const name = document.getElementById('editCatName').value.trim();
    await api('PUT', `/api/categories/${encodeURIComponent(cat.id)}`, {
      section,
      displayName: name === cat.name ? null : name,
    });
    showToast('עודכן');
    closeSheet();
    await load();
  });
  document.getElementById('btnFlagAll').addEventListener('click', async () => {
    if (!confirm(`לסמן את כל ${cat.rowCount} התנועות בקטגוריה "${cat.name}"?`)) return;
    await api('POST', `/api/categories/${encodeURIComponent(cat.id)}/flag`, { flagged: true });
    showToast(`סומנו ${cat.rowCount} תנועות`);
    closeSheet();
    await load();
  });
  document.getElementById('btnUnflagAll').addEventListener('click', async () => {
    await api('POST', `/api/categories/${encodeURIComponent(cat.id)}/flag`, { flagged: false });
    showToast('הוסרו סימונים');
    closeSheet();
    await load();
  });
}

function closeSheet() { sheet.hidden = true; sheetCard.innerHTML = ''; }
function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 1800);
}
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

load();
