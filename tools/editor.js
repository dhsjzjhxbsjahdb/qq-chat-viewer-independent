// Annotation editor. Loaded only by the /edit page that tools/annotate.mjs serves; the published site never loads it.
(() => {
  'use strict';
  const V = window.__VIEWER__;
  if (!V) return;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (cls, text, onclick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = onclick;
    return b;
  };
  const stamp = m => m.d.slice(0, 16).replace(/-/g, '/');
  const excerpt = (m, n = 90) => { const t = V.textOf(m).replace(/\s+/g, ' ').trim() || '[消息]'; return t.length > n ? t.slice(0, n) + '…' : t; };

  document.body.classList.add('editing');
  document.title = '编辑批注 · ' + document.title;
  let selectedId = null, editor = null;  // editor: { m, ta, status, original }

  /* ---------- header: mode badge + list button ---------- */
  const title = document.querySelector('.header-title h2');
  title.after(el('span', 'ed-badge', '编辑模式'));
  const listBtn = btn('ed-list-btn', '', () => togglePanel());
  document.querySelector('.date-btn').before(listBtn);

  /* ---------- selecting a bubble ---------- */
  V.hooks.decorateRow = (row, m) => { if (m.i === selectedId) row.classList.add('ed-selected'); };
  V.hooks.bubbleClick = (row, m) => {
    if (editor && dirty()) { warnDirty(); return; }
    if (editor && editor.m.i === m.i) { V.hidePop(true); return; }  // second click deselects
    select(row, m);
  };
  V.hooks.popClosed = () => {
    editor = null;
    selectedId = null;
    for (const r of document.querySelectorAll('.msg.ed-selected')) r.classList.remove('ed-selected');
  };
  const dirty = () => editor && editor.ta.value.trim() !== editor.original.trim();
  const warnDirty = () => {
    editor.status.textContent = '有未保存的修改：请先保存或取消';
    editor.status.className = 'ed-status warn';
    editor.ta.focus();
  };
  V.popCloseGuards.push(() => { if (!dirty()) return true; warnDirty(); return false; });

  function select(row, m) {
    for (const r of document.querySelectorAll('.msg.ed-selected')) r.classList.remove('ed-selected');
    selectedId = m.i;
    row.classList.add('ed-selected');
    const note = V.getNotes().find(n => n.i === m.i);
    const original = note?.n || '';

    const head = el('div', 'anno-head');
    head.append(el('strong', '', note ? '编辑批注' : '添加批注'), el('span', '', `${V.nameOf(m)} · ${stamp(m)}`));
    const quote = el('div', 'ed-quote', excerpt(m));
    const ta = el('textarea', 'ed-input');
    ta.value = original;
    ta.rows = 4;
    ta.placeholder = '写下对这条消息的批注…';
    const status = el('div', 'ed-status', note?.u ? `上次修改 ${note.u.slice(0, 16).replace('T', ' ')}` : 'Ctrl/⌘ + Enter 保存');
    const foot = el('div', 'ed-foot');
    if (note) foot.append(btn('ed-btn danger', '删除', () => commit(m, '')));
    foot.append(el('span', 'ed-gap'), btn('ed-btn', '取消', () => V.hidePop(true)), btn('ed-btn primary', '保存', () => commit(m, ta.value)));
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(m, ta.value); }
      if (e.key === 'Escape' && !dirty()) { e.stopPropagation(); V.hidePop(true); }
    });
    ta.addEventListener('input', () => { status.className = 'ed-status'; status.textContent = dirty() ? '未保存' : 'Ctrl/⌘ + Enter 保存'; });

    V.showPop(row.querySelector('.msg-content'), [head, quote, ta, status, foot]);
    editor = { m, ta, status, original };
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  /* ---------- saving ---------- */
  let saving = false;
  async function commit(m, text) {
    if (saving) return;
    text = text.replace(/\r\n?/g, '\n').trim();
    const others = V.getNotes().filter(n => n.i !== m.i);
    const next = text ? [...others, { i: m.i, n: text, u: new Date().toISOString() }] : others;
    if (!text && !V.getNotes().some(n => n.i === m.i)) { V.hidePop(true); return; }
    saving = true;
    if (editor) { editor.status.className = 'ed-status'; editor.status.textContent = '保存中…'; }
    try {
      try {
        const r = await fetch('api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: next }) });
        if (!r.ok) throw new Error(await r.text() || r.status);
      } catch (e) {
        // a proxy can lose the reply even though the save went through: check what the server has now
        if (!(await serverHas(next))) throw e;
      }
      V.hidePop(true);
      V.setNotes(next);
      renderPanel();
      V.toast(text ? '批注已保存' : '批注已删除');
    } catch (e) {
      if (editor) { editor.status.className = 'ed-status warn'; editor.status.textContent = '保存失败：' + e.message; }
    } finally {
      saving = false;
    }
  }

  // true when notes.js on the server already holds exactly these notes
  async function serverHas(list) {
    try {
      const r = await fetch('notes.js?check=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return false;
      const saved = (await r.text()).split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l.replace(/,\s*$/, '')));
      const key = a => a.map(n => n.i + '\u0000' + n.n.trim()).sort().join('\u0001');
      return key(saved) === key(list.map(n => ({ i: n.i, n: n.n.replace(/\r\n?/g, '\n') })));
    } catch { return false; }
  }

  /* ---------- list of all annotations ---------- */
  const panel = el('aside', 'ed-panel hidden');
  panel.setAttribute('aria-label', '全部批注');
  const panelHead = el('div', 'ed-panel-head');
  const panelTitle = el('strong', '');
  panelHead.append(panelTitle, btn('icon-btn ed-close', '×', () => togglePanel(false)));
  const panelList = el('div', 'ed-panel-list');
  panel.append(panelHead, panelList);
  document.querySelector('.chat-area').append(panel);

  function togglePanel(open = panel.classList.contains('hidden')) {
    panel.classList.toggle('hidden', !open);
    listBtn.classList.toggle('on', open);
    if (open) renderPanel();
  }
  function renderPanel() {
    const notes = V.getNotes().sort((a, b) => a.i - b.i);
    listBtn.textContent = `批注 ${notes.length}`;
    panelTitle.textContent = `全部批注（${notes.length}）`;
    if (panel.classList.contains('hidden')) return;
    const byId = new Map(V.msgs.map(m => [m.i, m]));
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      const m = byId.get(n.i);
      const item = btn('ed-item', '', () => {
        V.openAtId(n.i);
        if (matchMedia('(max-width: 760px)').matches) togglePanel(false);
      });
      const top = el('div', 'ed-item-top');
      top.append(el('span', '', m ? V.nameOf(m) : '#' + n.i), el('time', '', m ? stamp(m) : ''));
      item.append(top, el('div', 'ed-item-msg', m ? excerpt(m, 60) : '（消息不存在）'), el('div', 'ed-item-note', n.n));
      frag.append(item);
    }
    if (!notes.length) frag.append(el('div', 'empty', '还没有批注。点一下聊天里的气泡就可以添加。'));
    panelList.replaceChildren(frag);
  }

  renderPanel();
  V.rerender();
  V.toast('编辑模式：点一下气泡即可添加批注');
})();
