// Shared classification logic — used by owner-account.html and income-account.html.
// Loads classifications from /api/classifications and provides:
//   - getClassDefs(), getClassOrder()
//   - openClassModal(onChange) — pops up the manage UI
//   - classSelectHtml(currentId) — renders <select> options
//   - classSelectStyle(id) — inline style for colored select/row
//   - escHtml(s) — local escaper

(function (global) {
  let _defs = {};
  let _order = [];

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadClassifications() {
    const r = await fetch('/api/classifications');
    const d = await r.json();
    _defs = {};
    _order = [];
    for (const item of d.items || []) {
      _defs[item.id] = item;
      _order.push(item.id);
    }
    return { defs: _defs, order: _order };
  }

  function getClassDefs() { return _defs; }
  function getClassOrder() { return _order; }
  function getClassDef(id) { return _defs[id] || null; }

  function classSelectHtml(currentId, rowId) {
    const cur = currentId || '';
    return `
      <select class="cls-select" data-id="${escHtml(rowId)}" style="${classSelectStyle(cur)}">
        <option value="">— לא סווג —</option>
        ${_order.map(id => `<option value="${escHtml(id)}" ${cur === id ? 'selected' : ''}>${escHtml(_defs[id].he)}</option>`).join('')}
      </select>
    `;
  }

  function classSelectStyle(id) {
    if (!id || !_defs[id]) return '';
    const c = _defs[id].color;
    return `background:${c}26; border-color:${c}; color:${c}; font-weight:700;`;
  }

  function classRowStyle(id) {
    if (!id || !_defs[id]) return '';
    const c = _defs[id].color;
    return `background:${c}1A; border-right:4px solid ${c};`;
  }

  // ============ MODAL ============
  function openClassModal(onChange) {
    let modal = document.getElementById('classModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'classModal';
      modal.innerHTML = `
        <style>
          #classModal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
          #classModal .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
          #classModal .panel {
            position: relative; background: white; border-radius: 14px;
            width: 90%; max-width: 560px; max-height: 85vh; overflow-y: auto;
            padding: 20px 24px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
          }
          #classModal h3 { font-family: 'Frank Ruhl Libre', serif; margin: 0 0 12px; font-size: 22px; }
          #classModal .cls-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; margin: 6px 0; border: 1px solid #e0ddd2; }
          #classModal .cls-item .swatch { width: 24px; height: 24px; border-radius: 50%; flex: 0 0 auto; cursor: pointer; border: 2px solid white; box-shadow: 0 0 0 1px #ccc; }
          #classModal .cls-item input.name { flex: 1; background: white; border: 1.5px solid #e0ddd2; border-radius: 6px; padding: 5px 10px; font-family: inherit; font-size: 13px; font-weight: 600; }
          #classModal .cls-item input.name:focus { outline: none; border-color: #333; }
          #classModal .cls-item .usage { font-size: 11px; color: #888; padding: 2px 8px; background: #f0ede2; border-radius: 4px; font-weight: 600; }
          #classModal .cls-item .del { background: #c92a2a; color: white; border: 0; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700; }
          #classModal .cls-item .del:hover { background: #a02020; }
          #classModal .add-form { display: flex; gap: 8px; margin: 14px 0 4px; padding: 12px; background: #f8f6ef; border-radius: 8px; border: 1px dashed #aaa; align-items: center; }
          #classModal .add-form input[type=text] { flex: 1; background: white; border: 1.5px solid #e0ddd2; border-radius: 6px; padding: 6px 10px; font-family: inherit; font-size: 13px; }
          #classModal .add-form input[type=color] { width: 36px; height: 32px; border: 1px solid #ccc; cursor: pointer; padding: 0; }
          #classModal .add-form button { background: #2a6f45; color: white; border: 0; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700; }
          #classModal .close { position: absolute; top: 10px; left: 14px; background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #888; }
          #classModal .hint { font-size: 12px; color: #888; margin-top: 8px; }
        </style>
        <div class="backdrop"></div>
        <div class="panel">
          <button class="close">×</button>
          <h3>ניהול סיווגים</h3>
          <div id="classModalList"></div>
          <div class="add-form">
            <input type="text" id="newClassName" placeholder="שם סיווג חדש" maxlength="60">
            <input type="color" id="newClassColor" value="#1c4f7c">
            <button id="addClassBtn">+ הוסף</button>
          </div>
          <div class="hint">לחץ על העיגול הצבעוני כדי לשנות צבע. שינוי שם נשמר אוטומטית בעת יציאה מהשדה. מחיקה תסיר את הסיווג מכל השורות שמשתמשות בו.</div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.close').addEventListener('click', closeClassModal);
      modal.querySelector('.backdrop').addEventListener('click', closeClassModal);
      modal.querySelector('#addClassBtn').addEventListener('click', async () => {
        const nameEl = document.getElementById('newClassName');
        const colorEl = document.getElementById('newClassColor');
        const name = nameEl.value.trim();
        if (!name) return;
        await fetch('/api/classifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ he: name, color: colorEl.value }),
        });
        nameEl.value = '';
        await loadClassifications();
        renderModalList(onChange);
        if (onChange) onChange();
      });
    }
    renderModalList(onChange);
  }

  function closeClassModal() {
    const modal = document.getElementById('classModal');
    if (modal) modal.remove();
  }

  async function renderModalList(onChange) {
    // Re-fetch with usage counts
    const r = await fetch('/api/classifications');
    const d = await r.json();
    const list = document.getElementById('classModalList');
    if (!list) return;
    list.innerHTML = d.items.map(item => `
      <div class="cls-item" data-id="${escHtml(item.id)}">
        <input type="color" class="swatch" value="${escHtml(item.color)}" title="לחץ לשינוי צבע" style="background:${escHtml(item.color)}; width:24px; height:24px; border-radius:50%; padding:0;">
        <input type="text" class="name" value="${escHtml(item.he)}" maxlength="60">
        <span class="usage">${item.usageCount || 0} שורות</span>
        <button class="del">🗑 מחק</button>
      </div>
    `).join('');

    list.querySelectorAll('.cls-item').forEach(row => {
      const id = row.dataset.id;
      const colorEl = row.querySelector('.swatch');
      const nameEl = row.querySelector('.name');
      const delBtn = row.querySelector('.del');

      const save = async () => {
        await fetch(`/api/classifications/${encodeURIComponent(id)}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ he: nameEl.value, color: colorEl.value }),
        });
        await loadClassifications();
        if (onChange) onChange();
      };
      nameEl.addEventListener('blur', save);
      colorEl.addEventListener('change', save);
      delBtn.addEventListener('click', async () => {
        const item = d.items.find(x => x.id === id);
        const msg = item.usageCount > 0
          ? `למחוק את "${item.he}"?\n${item.usageCount} שורות ישתמשו בו ויהפכו ל"לא סווג".`
          : `למחוק את "${item.he}"?`;
        if (!confirm(msg)) return;
        await fetch(`/api/classifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadClassifications();
        renderModalList(onChange);
        if (onChange) onChange();
      });
    });
  }

  global.ClsShared = {
    loadClassifications, getClassDefs, getClassOrder, getClassDef,
    classSelectHtml, classSelectStyle, classRowStyle,
    openClassModal, closeClassModal,
  };
})(window);
