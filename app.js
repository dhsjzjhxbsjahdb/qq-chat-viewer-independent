(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const svg = (paths, cls = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = paths; // static, trusted markup only
  return s;
};
const ICON = {
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.5"/>',
  play: '<path d="M9 7.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
  phone: '<path d="M6.6 4.5h2.6l1.3 3.6-1.8 1.2a10 10 0 0 0 6 6l1.2-1.8 3.6 1.3v2.6a1.8 1.8 0 0 1-2 1.8A15 15 0 0 1 4.8 6.5a1.8 1.8 0 0 1 1.8-2Z"/>',
  user: '<circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>',
};

const data = window.__CHAT__;
if (!data?.msgs?.length) {
  $('chat').replaceChildren(el('div', 'empty', '记录加载失败，请刷新重试。'));
  return;
}
const PEER = data.meta?.friend?.name || '纸蝶';
const SELF = data.meta?.self_name || '音';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = n => String(n).padStart(2, '0');
const tsOf = d => new Date(d.replace(' ', 'T')).getTime();
const fmtDate = d => `${d.slice(0, 4)}年${+d.slice(5, 7)}月${+d.slice(8, 10)}日`;
const weekOf = d => WEEK[new Date(d + 'T00:00:00').getDay()];
const hm = m => m.d.slice(11, 16);
const nameOf = m => (m.s ? SELF : PEER);

/* ---------- normalise data ---------- */
// Hide messages that carry no content (unknown type markers) and duplicated call records.
// Also hide "contact cards" recommending the sender themself: they sit right before file sends, mid-sentence,
// 43 times — an export misparse of some other message type, not a real card (the original content is lost).
const msgs = [];
for (const m of [...data.msgs].sort((a, b) => a.d.localeCompare(b.d) || a.i - b.i)) {
  if (m.k === 'unknown') continue;
  if (m.k === 'contact' && m.ct?.n === nameOf(m)) continue;
  // A reply whose own text is just "[引用回复]" carries nothing: either a typo'd message recalled and re-sent
  // right after (its quote holds the typo, e.g. 「好羞的修改再发新需求」 → 「后续的修改再发新需求」), or empty.
  if (m.k === 'reply' && m.x === '[引用回复]') continue;
  m.t = tsOf(m.d);
  if (m.k === 'call') {
    const p = msgs.at(-1);
    if (p && p.k === 'call' && p.s === m.s && m.t - p.t < 15000 && p.x.startsWith('通话时长') && m.x.startsWith('通话时长')) continue;
  }
  msgs.push(m);
}
const posOfId = new Map(msgs.map((m, i) => [m.i, i]));
// Resolve an original message id to the nearest visible message position.
const resolvePos = id => {
  if (posOfId.has(id)) return posOfId.get(id);
  const p = msgs.findIndex(m => m.i >= id);
  return p < 0 ? msgs.length - 1 : p;
};
const days = new Map();
for (const m of msgs) {
  const d = m.d.slice(0, 10);
  if (!days.has(d)) days.set(d, []);
  days.get(d).push(m);
}
const dates = [...days.keys()];

// Hand-picked moments; ids refer to original message ids.
const PINNED = [
  { a: 5, b: 79, title: '初遇：「我30一组试一试，不满意不要钱」', note: '音报的预算是单个 50~100，纸蝶主动开价 30 一组试稿。试稿验收后，音主动提价到 40/组，一天两组按 50/组结算' },
  { a: 3156, b: 3168, title: '「我挑明了说吧」', note: '深夜摊牌，谈待遇和保障' },
  { a: 5008, b: 5045, title: '「我只是希望我的声音还是能被更重视一点」', note: '凌晨开麦，通话 3 小时' },
  { a: 9080, b: 9084, title: '「我就是舔狗，付出了没回报还要被踢一脚」' },
  { a: 10423, b: 10470, title: '9.30 凌晨：人天统计引发争执' },
  { a: 10471, b: 10499, title: '「想把我替了可以直说」', note: '纸蝶连发，音不回' },
  { a: 10522, b: 10599, title: '9.30 凌晨：纸蝶一个人连发 78 条', note: '音说「我不会再回」之后，一直发到「可以的话能说声晚安吗，求你了」' },
  { a: 10605, b: 10636, title: '「思来想去实在睡不着」', note: '早上 9 点起又连发 32 条，无人回复' },
  { a: 10679, b: 10682, title: '「音音可不可以不要把我删了」' },
  { a: 11346, b: 11392, title: '「我是真心的，但你有真心对过我吗」', note: '最后一次争执，音说再聊就拉黑' },
];

// Masked text is masked in data.js itself (privacy-report.json) and reads "*******". masks.js, generated from the
// report, says which id ranges are which kind:
//   sequel   – 魔女2 talk and whole redacted days such as 2026-09-14: work, folded for good
//   business – private commercial details: only those lines are sealed; their exchange still opens
// (A plain "***" is an older link / name redaction and is left alone.)
const MASKS = window.__MASKS__ || { mask: '*******', sequel: [], business: [] };
const MASK = MASKS.mask;
const TEXTUAL = new Set(['text', 'reply', 'mixed', 'forward', 'legacy_forward']);
// the text a message shows (a mixed message shows its text parts, not its copied caption)
const ownText = m => m.k === 'mixed' ? (m.seg || []).filter(s => s.t === 'text').map(s => s.x) : TEXTUAL.has(m.k) ? [m.x] : [];
const inIdRanges = (R, i) => R.some(([a, b]) => i >= a && i <= b);
for (const m of msgs) if (ownText(m).some(x => x === MASK)) m.mk = inIdRanges(MASKS.business, m.i) && !inIdRanges(MASKS.sequel, m.i) ? 'business' : 'sequel';
const isMasked = m => m.mk === 'sequel';
const MASK_REASON = { sequel: '魔女2未公开内容', business: '商务敏感内容' };
// Masked lines of either kind — with the images / files sent in between them — are sealed: never shown, never
// opened. Where they would be on screen, each run of them becomes one line "已隐去 N 条 · reason".
const sealRuns = [];
{
  // same breaks as the exchanges below (30 min, new day), so a run is wholly inside or outside a folded exchange
  const joined = k => msgs[k].t - msgs[k - 1].t <= 30 * 60e3 && msgs[k].d.slice(0, 10) === msgs[k - 1].d.slice(0, 10);
  for (let i = 0; i < msgs.length; i++) {
    const kind = msgs[i].mk;
    if (!kind) continue;
    // extend over masked lines of the same kind and the media between them; it ends on a masked line
    let j = i;
    for (let k = i + 1; k < msgs.length && joined(k) && (msgs[k].mk === kind || !ownText(msgs[k]).some(Boolean)); k++) if (msgs[k].mk === kind) j = k;
    sealRuns.push({ pa: i, pb: j, kind });
    i = j;
  }
  sealRuns.forEach((r, k) => { r.id = k + 1; r.n = r.pb - r.pa + 1; for (let i = r.pa; i <= r.pb; i++) msgs[i].seal = r.id; });
}
const topicSegs = [];
const expandedTopics = new Set(); // Work / daily exchanges start collapsed on every visit.
// a folded exchange holding 魔女2 lines can never be opened
const openable = id => id && !topicSegs[id - 1].sequel;
const visible = m => !m.seal && (!m.topic || (expandedTopics.has(m.topic) && openable(m.topic)));
const dateIdx = new Map(dates.map((d, i) => [d, i]));
const LAST = dates.length - 1;
const textOf = m => {
  switch (m.k) {
    case 'image': return m.im?.fb === '[动画表情]' ? '[动画表情]' : '[图片]';
    case 'file': return '[文件] ' + (m.fi?.n || '');
    case 'video': return '[视频]';
    case 'contact': return '[名片] ' + (m.ct?.n || '');
    case 'forward': case 'legacy_forward': return '[聊天记录] ' + (m.fw?.t || '');
    case 'mixed': return (m.seg || []).map(s => (s.t === 'image' ? '[图片]' : s.x || '')).join('');
    default: return m.x || '';
  }
};

/* ---------- message rendering ---------- */
let highlight = '';          // search keyword to mark in rendered text
let markRange = null;        // [startId, endId] of the selected event

function richText(s, cls = 'text') {
  const e = el('div', cls);
  s = String(s || '');
  if (!highlight) { e.textContent = s; return e; }
  const low = s.toLowerCase(), q = highlight.toLowerCase();
  let p = 0, j;
  while ((j = low.indexOf(q, p)) !== -1) {
    e.append(document.createTextNode(s.slice(p, j)), el('mark', '', s.slice(j, j + q.length)));
    p = j + q.length;
  }
  e.append(document.createTextNode(s.slice(p)));
  return e;
}

function imageBox(w, h, max = 200) {
  let W = 180, H = 135;
  if (w > 0 && h > 0) {
    const r = Math.min(max / w, max / h, 1);
    W = Math.max(64, Math.round(w * r));
    H = Math.max(64, Math.round(h * r));
  }
  const box = el('div', 'img-ph');
  box.style.width = W + 'px';
  box.style.height = H + 'px';
  box.append(svg(ICON.image));
  return box;
}

const FILE_COLORS = { rar: '#8e6be8', zip: '#8e6be8', '7z': '#8e6be8', png: '#2bb673', jpg: '#2bb673', jpeg: '#2bb673', gif: '#2bb673', psd: '#2f7cf6', mp4: '#ff8a34', mov: '#ff8a34', pdf: '#f2533e', doc: '#2f7cf6', docx: '#2f7cf6', xls: '#21a366', xlsx: '#21a366', txt: '#8a94a6' };
function fileCard(name, size) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const c = el('div', 'file-card');
  const info = el('div', 'file-info');
  info.append(richText(name || '文件', 'file-name'), el('div', 'file-size', size || ''));
  const icon = el('div', 'file-icon', ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE');
  icon.style.background = FILE_COLORS[ext] || '#8a94a6';
  c.append(info, icon);
  return c;
}

function content(m) {
  const k = m.k;
  // media-only messages render without a bubble, like QQ
  if (k === 'image') {
    const x = m.im || {};
    if (x.fb === '[动画表情]') return el('div', 'sticker-ph', '动画表情');
    const b = imageBox(x.w, x.h);
    b.title = [x.w && x.h ? x.w + '×' + x.h : '', x.z].filter(Boolean).join(' · ');
    return b;
  }
  if (k === 'video') {
    const b = imageBox(16, 9, 220);
    b.classList.add('video');
    b.replaceChildren(svg(ICON.play, 'play'));
    if (m.vd?.dur) b.append(el('span', 'dur', m.vd.dur + '″'));
    return b;
  }
  if (k === 'file') return fileCard(m.fi?.n || '文件', m.fi?.z);
  if (k === 'contact') {
    const c = el('div', 'contact-card');
    const top = el('div', 'contact-top');
    const av = el('div', 'contact-av');
    av.append(svg(ICON.user));
    top.append(av, el('strong', '', m.ct?.n || '联系人'));
    c.append(top, el('div', 'card-foot', '推荐联系人'));
    return c;
  }
  if (k === 'forward' || k === 'legacy_forward') {
    const c = el('div', 'forward-card');
    c.append(richText(m.fw?.t || '聊天记录', 'fw-title'));
    for (const s of (m.fw?.it || []).slice(0, 4)) c.append(richText(s, 'fw-item'));
    c.append(el('div', 'card-foot', m.fw?.n ? `查看 ${m.fw.n} 条转发消息` : '聊天记录'));
    return c;
  }
  if (k === 'sys') return el('div', 'face-ph', m.x || '[表情]');

  const b = el('div', 'bubble');
  if (k === 'call') {
    b.classList.add('call');
    b.append(svg(ICON.phone), el('span', '', m.x || '语音通话'));
    return b;
  }
  if (m.rp?.t) {
    const q = el('div', 'quote');
    const n = m.rp.n && m.rp.n !== '***' ? m.rp.n : '';
    q.textContent = (n ? n + '：' : '') + m.rp.t;
    b.append(q);
  } else if (m.rp) {
    // the export lost what was quoted; only mark that this message answered an earlier one
    const q = el('div', 'quote-lost', '↩ 回复');
    q.title = '这条是回复，被引用的原文没有导出';
    b.append(q);
  }
  if (k === 'mixed' && m.seg?.length) {
    for (const s of m.seg) {
      if (s.t === 'image') b.append(imageBox(s.w, s.h, 180));
      else if (s.x) b.append(richText(s.x));
    }
    return b;
  }
  const x = m.x || '';
  if (x === '[动画表情]') return el('div', 'sticker-ph', '动画表情');
  b.append(richText(x));
  return b;
}

/* ---------- annotations ----------
 * notes.js defines window.__NOTES__ = [{ i: messageId, n: noteText, u: updatedAt }].
 * It is written by the local editor (tools/annotate.mjs); the published page only reads it.
 */
let noteOf = new Map();
function loadNotes(list) {
  noteOf = new Map();
  for (const n of Array.isArray(list) ? list : []) {
    if (n && Number.isInteger(n.i) && typeof n.n === 'string' && n.n.trim()) noteOf.set(n.i, n);
  }
}
loadNotes(window.__NOTES__);
const hooks = {};  // filled by the editor page only

function renderMsg(m) {
  const row = el('div', 'msg ' + (m.s ? 'self' : 'other'));
  row.dataset.id = m.i;
  if (markRange && m.i >= markRange[0] && m.i <= markRange[1]) row.classList.add('marked');
  const av = el('img', 'avatar');
  av.src = m.s ? 'avatars/me.jpg' : 'avatars/peer.jpg';
  av.alt = nameOf(m);
  av.loading = 'lazy';
  const body = el('div', 'msg-body');
  const c = content(m);
  c.classList.add('msg-content');
  body.append(c);
  if (noteOf.has(m.i)) {
    row.classList.add('noted');
    // text bubbles show a dashed underline; media without text gets a small tag instead
    if (!c.querySelector('.text,.fw-title,.file-name')) body.append(el('span', 'anno-tag', '批注'));
  }
  row.append(av, body);
  hooks.decorateRow?.(row, m);
  return row;
}

const segRange = g => {
  const a = msgs[g.pa].d, b = msgs[g.pb].d;
  return `${a.slice(5, 16).replace('-', '/')}–${(a.slice(0, 10) === b.slice(0, 10) ? b.slice(11, 16) : b.slice(5, 16).replace('-', '/'))}`;
};
// Expand one folded work / daily exchange (never one holding 魔女2 lines).
function revealTopic(id) {
  if (openable(id)) expandedTopics.add(id);
}
// Explicit links (#m…, the editor) open the message itself, expanding its exchange if it is folded.
function openMessage(id, opts = {}) {
  const m = msgs[resolvePos(id)];
  revealTopic(m.topic);
  openAt(dateIdx.get(m.d.slice(0, 10)), { id: m.i, flash: true, ...opts });
}
function topicMarker(g) {
  const locked = !openable(g.id), open = !locked && expandedTopics.has(g.id);
  const b = el(locked ? 'div' : 'button', 'topic-marker' + (locked ? ' locked' : ''));
  if (!locked) b.type = 'button';
  b.dataset.topic = g.id;
  b.dataset.hid = msgs[g.pa].i;
  b.style.setProperty('--c', TYPES[g.type].color);
  // the count and why it is folded; what the exchange says stays out of sight until it is opened
  const reason = g.type === 'daily' ? '日常闲聊' : g.sequel ? '工作交接 · 含魔女2未公开内容' : '工作交接';
  b.append(el('span', 'topic-summary', `${open ? '收起' : '折叠了'} ${g.n} 条`), el('span', 'topic-reason', reason));
  if (locked) { b.setAttribute('aria-label', `折叠了 ${g.n} 条，原因：${reason}，不可展开`); return b; }
  b.setAttribute('aria-expanded', String(open));
  b.setAttribute('aria-label', `${open ? '收起' : '展开'} ${g.n} 条，折叠原因：${reason}`);
  if (!open) b.append(el('span', 'topic-action', '展开'));
  b.onclick = () => {
    if (open) expandedTopics.delete(g.id);
    else revealTopic(g.id);
    openAt(dateIdx.get(msgs[g.pa].d.slice(0, 10)), { id: msgs[g.pa].i, topic: g.id });
  };
  return b;
}

function renderDay(di) {
  const d = dates[di], list = days.get(d);
  const sec = el('section', 'day');
  sec.dataset.di = di;
  if (di > 0) {
    const prev = days.get(dates[di - 1]).at(-1);
    const gap = Math.floor((list[0].t - prev.t) / 864e5);
    if (gap >= 3) sec.append(el('div', 'gap-note', `相隔 ${gap} 天`));
  }
  sec.append(el('div', 'time-div', `${fmtDate(d)} ${weekOf(d)} ${hm(list[0])}`));
  // time dividers follow the visible messages only, so a folded exchange leaves no empty dividers behind
  let last = list[0].t, topic = 0, seal = 0;
  for (const m of list) {
    if ((m.topic || 0) !== topic) {
      topic = m.topic || 0;
      if (topic) sec.append(topicMarker(topicSegs[topic - 1]));
    }
    // sealed lines where they would be on screen (no folded exchange, or an opened one): one line, nothing to open
    const onScreen = !m.topic || (expandedTopics.has(m.topic) && openable(m.topic));
    if (onScreen && (m.seal || 0) !== seal) {
      seal = m.seal || 0;
      if (seal) {
        const r = sealRuns[seal - 1], n = el('div', 'seal-note');
        n.dataset.seal = seal;
        n.dataset.hid = msgs[r.pa].i;
        if (r.kind === 'business') n.style.setProperty('--c', '#8a6d1f');
        n.append(el('span', 'topic-summary', `已隐去 ${r.n} 条`), el('span', 'topic-reason', MASK_REASON[r.kind]));
        sec.append(n);
      }
    } else if (!onScreen) seal = 0;
    if (!visible(m)) continue;
    if (m.t - last > 5 * 60e3) sec.append(el('div', 'time-div', hm(m)));
    last = m.t;
    sec.append(renderMsg(m));
  }
  return sec;
}


/* ---------- continuous timeline ---------- */
const chat = $('chat'), wrap = $('chatWrap');
let lo = 0, hi = -1, current = -1;
const MAX_RENDERED = 1400;   // keep DOM light; far-away days are dropped
const EDGE = 900;            // px from an edge that triggers loading the neighbour day
const secOf = di => chat.querySelector(`section[data-di="${di}"]`);
const renderedCount = () => { let n = 0; for (let i = lo; i <= hi; i++) n += days.get(dates[i]).length; return n; };

function appendNext() {
  if (hi >= LAST) return false;
  chat.append(renderDay(++hi));
  return true;
}
function prependPrev() {
  if (lo <= 0) return false;
  const before = wrap.scrollHeight;
  chat.prepend(renderDay(--lo));
  wrap.scrollTop += wrap.scrollHeight - before;
  return true;
}
function trim(side) {
  while (renderedCount() > MAX_RENDERED && hi - lo > 1) {
    if (side === 'top') {
      const s = chat.firstElementChild;
      if (s.offsetTop + s.offsetHeight > wrap.scrollTop - EDGE) break;
      const h = s.offsetHeight;
      s.remove(); lo++;
      wrap.scrollTop -= h;
    } else {
      const s = chat.lastElementChild;
      if (s.offsetTop < wrap.scrollTop + wrap.clientHeight + EDGE) break;
      s.remove(); hi--;
    }
  }
}
function fill() {
  let guard = 0;
  while (guard++ < 30 && wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < EDGE && appendNext()) trim('top');
  guard = 0;
  while (guard++ < 30 && wrap.scrollTop < EDGE && prependPrev()) trim('bottom');
}

function clearMarks() {
  for (const e of chat.querySelectorAll('.marked')) e.classList.remove('marked');
}

/**
 * Rebuild the timeline around a day.
 * opts.id     – message id to bring into view
 * opts.bottom – scroll to the very end
 * opts.range  – [startId, endId] to mark as the selected event
 */
function openAt(di, opts = {}) {
  quietUntil = performance.now() + 250;
  navPos = null;
  di = Math.max(0, Math.min(LAST, di));
  markRange = opts.range || null;
  chat.replaceChildren(renderDay(di));
  lo = hi = di;
  const anchor = secOf(di);
  let guard = 0;
  while (guard++ < 30 && anchor.offsetTop < EDGE * 1.5 && lo > 0) chat.prepend(renderDay(--lo));
  guard = 0;
  while (guard++ < 30 && chat.scrollHeight - anchor.offsetTop - anchor.offsetHeight < EDGE * 1.5 && hi < LAST) chat.append(renderDay(++hi));

  if (opts.bottom) wrap.scrollTop = wrap.scrollHeight;
  else if (opts.id != null) {
    // a hidden message is represented by its segment's marker
    const tm = msgs[resolvePos(opts.id)];
    let t = opts.topic ? chat.querySelector(`[data-topic="${opts.topic}"]`)
      : !visible(tm) && tm.seal && chat.querySelector(`[data-seal="${tm.seal}"]`) ? chat.querySelector(`[data-seal="${tm.seal}"]`)
      : !visible(tm) && tm.topic ? chat.querySelector(`[data-topic="${tm.topic}"]`)
      : chat.querySelector(`[data-id="${opts.id}"]`);
    if (!t) t = [...chat.querySelectorAll('.msg,.topic-marker,.seal-note')].find(e => +(e.dataset.id ?? e.dataset.hid) >= opts.id);
    if (t) {
      wrap.scrollTop = t.offsetTop - (opts.center ? (wrap.clientHeight - t.offsetHeight) / 2 : 70);
      if (opts.flash) { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
    }
  } else wrap.scrollTop = anchor.offsetTop;
  fill();
  syncView(true);
  setDrawer(false);
}

/* which day is at the top of the viewport */
let pillTimer, saveTimer, quietUntil = 0;
function syncView(force) {
  const y = wrap.scrollTop + 48;
  let di = lo;
  for (const s of chat.children) {
    if (s.offsetTop <= y) di = +s.dataset.di; else break;
  }
  if (di !== current || force) {
    current = di;
    const d = dates[di];
    $('headerDate').textContent = `${fmtDate(d)} ${weekOf(d)} · ${days.get(d).length} 条`;
    $('datePill').textContent = `${+d.slice(5, 7)}月${+d.slice(8, 10)}日 ${weekOf(d)}`;
    $('jumpDate').value = d;
    markActiveDay(d);
  }
  syncNextBtn();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePos, 500);
}
function savePos() {
  const y = wrap.scrollTop;
  const sec = secOf(current);
  if (!sec) return;
  for (const e of sec.querySelectorAll('.msg,.topic-marker,.seal-note')) {
    if (e.offsetTop + e.offsetHeight >= y) { try { localStorage.setItem(POS_KEY, e.dataset.id ?? e.dataset.hid); } catch {} return; }
  }
}

let ticking = false;
wrap.addEventListener('scroll', () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      fill();
      syncView(false);
    });
  }
  if (performance.now() < quietUntil) return;
  navPos = null; // the reader scrolled on their own; "next" now counts from what is on screen
  const pill = $('datePill');
  pill.classList.remove('hidden');
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => pill.classList.add('hidden'), 900);
}, { passive: true });


/* ---------- annotation popover ---------- */
const pop = el('div', 'anno-pop hidden');
pop.setAttribute('role', 'dialog');
document.body.append(pop);
let popTarget = null;
const popCloseGuards = [];  // editor can veto closing (e.g. unsaved text)
function placePop() {
  if (!popTarget || !popTarget.isConnected) { hidePop(true); return; }
  const r = popTarget.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let top = r.bottom + 8;
  if (top + h > vh - 8 && r.top - h - 8 >= 8) top = r.top - h - 8;
  pop.style.left = Math.round(Math.max(8, Math.min(vw - w - 8, r.left))) + 'px';
  pop.style.top = Math.round(Math.max(8, Math.min(vh - h - 8, top))) + 'px';
}
function showPop(target, nodes) {
  popTarget = target;
  pop.replaceChildren(...nodes);
  pop.classList.remove('hidden');
  placePop();
}
function hidePop(force) {
  if (pop.classList.contains('hidden')) return true;
  if (!force && popCloseGuards.some(g => !g())) return false;
  pop.classList.add('hidden');
  pop.replaceChildren();
  popTarget = null;
  hooks.popClosed?.();
  return true;
}
function showNote(row, m) {
  const n = noteOf.get(m.i);
  if (!n) return;
  const head = el('div', 'anno-head');
  head.append(el('strong', '', '批注'), el('span', '', `${nameOf(m)} · ${m.d.slice(0, 16).replace(/-/g, '/')}`));
  showPop(row.querySelector('.msg-content'), [head, el('p', 'anno-text', n.n)]);
}
// clicking a bubble opens its annotation (the editor page takes over this click)
chat.addEventListener('click', e => {
  const row = e.target.closest('.msg');
  if (!row || !e.target.closest('.msg-content,.anno-tag')) return;
  if (!getSelection().isCollapsed) return;  // the reader was selecting text to copy
  const m = msgs[posOfId.get(+row.dataset.id)];
  if (hooks.bubbleClick) hooks.bubbleClick(row, m);
  else if (row.classList.contains('noted')) showNote(row, m);
});
document.addEventListener('pointerdown', e => {
  if (pop.contains(e.target) || (popTarget && e.target.closest('.msg') === popTarget.closest('.msg'))) return;
  hidePop();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });
wrap.addEventListener('scroll', () => { if (popTarget) placePop(); }, { passive: true });
addEventListener('resize', () => { if (popTarget) placePop(); });

/* re-render the loaded days in place, keeping the scroll position */
function rerender() {
  const st = wrap.scrollTop;
  for (let di = lo; di <= hi; di++) secOf(di)?.replaceWith(renderDay(di));
  wrap.scrollTop = st;
}

/* ---------- date navigation ---------- */
const dayButtons = new Map(), monthNodes = new Map();
const maxPerDay = Math.max(...dates.map(d => days.get(d).length));
{
  const months = new Map();
  for (const d of dates) {
    const ym = d.slice(0, 7);
    if (!months.has(ym)) months.set(ym, []);
    months.get(ym).push(d);
  }
  const frag = document.createDocumentFragment();
  for (const [ym, ds] of [...months].reverse()) {
    const sec = el('details', 'month');
    const head = el('summary', 'month-head');
    head.append(el('span', '', `${ym.slice(0, 4)}年${+ym.slice(5)}月`), el('span', 'month-n', ds.reduce((n, d) => n + days.get(d).length, 0)));
    sec.append(head);
    for (const d of [...ds].reverse()) {
      const n = days.get(d).length;
      const b = el('button', 'day-item');
      b.type = 'button';
      const bar = el('span', 'heat'), fillBar = el('i');
      fillBar.style.width = Math.max(4, Math.round(Math.sqrt(n / maxPerDay) * 100)) + '%';
      bar.append(fillBar);
      b.append(el('span', 'day-d', `${+d.slice(8)}日`), el('span', 'day-w', weekOf(d)), bar, el('span', 'day-n', n));
      b.onclick = () => openAt(dateIdx.get(d));
      sec.append(b);
      dayButtons.set(d, b);
    }
    monthNodes.set(ym, sec);
    frag.append(sec);
  }
  $('dateList').append(frag);
}
let activeBtn = null;
function markActiveDay(d) {
  activeBtn?.classList.remove('active');
  activeBtn = dayButtons.get(d);
  if (!activeBtn) return;
  activeBtn.classList.add('active');
  const month = monthNodes.get(d.slice(0, 7));
  if (!month.open) month.open = true;
  if (!$('panelDates').classList.contains('hidden')) activeBtn.scrollIntoView({ block: 'nearest' });
}

$('jumpDate').min = dates[0];
$('jumpDate').max = dates[LAST];
$('jumpDate').addEventListener('change', () => {
  const d = $('jumpDate').value;
  if (!d) return;
  const target = dates.find(x => x >= d) || dates[LAST];
  openAt(dateIdx.get(target));
  if (target !== d) toast(`${+d.slice(5, 7)}月${+d.slice(8)}日 没有消息，已跳到 ${+target.slice(5, 7)}月${+target.slice(8)}日`);
});

/* ---------- events ---------- */
const TYPES = {
  pin: { label: '重点', color: '#f5455c' },
  burst: { label: '连发', color: '#ff8a34' },
  night: { label: '深夜', color: '#6b5cf6' },
  mood: { label: '情绪', color: '#e8458b' },
  silence: { label: '沉默', color: '#8a94a6' },
  call: { label: '通话', color: '#21a366' },
  peak: { label: '高峰', color: '#0099ff' },
  pay: { label: '报价', color: '#c98a00' },
  work: { label: '工作', color: '#7b5cf0', folded: true },
  daily: { label: '日常', color: '#588a7a', folded: true },
};

function rangeStats(pa, pb) {
  let p = 0, s = 0;
  for (let i = pa; i <= pb; i++) (msgs[i].s ? s++ : p++);
  return { p, s };
}
function firstText(pa, pb) {
  for (let i = pa; i <= pb; i++) {
    const x = textOf(msgs[i]).trim();
    if (!msgs[i].s && !isMasked(msgs[i]) && x.length >= 4 && !x.startsWith('[')) return x;
  }
  return textOf(msgs[pa]);
}
let events = [];
// Every event starts on one of the peer's messages; ranges opened by SELF are moved forward.
function mkEvent(type, pa, pb, title, extra = {}) {
  while (pa <= pb && msgs[pa].s) pa++;
  if (pa > pb) return;
  const a = msgs[pa], b = msgs[pb];
  events.push({ type, pa, pb, a: a.i, b: b.i, t: a.t, date: a.d.slice(0, 10), title, ...extra });
}
for (const p of PINNED) {
  const pa = resolvePos(p.a), pb = resolvePos(p.b);
  const st = rangeStats(pa, pb);
  mkEvent('pin', pa, pb, p.title, { note: p.note, meta: `${hm(msgs[pa])}–${hm(msgs[pb])} · ${PEER} ${st.p} 条 / ${SELF} ${st.s} 条` });
}
// consecutive peer messages without any reply
{
  let st = 0;
  for (let i = 1; i <= msgs.length; i++) {
    if (i === msgs.length || msgs[i].s !== msgs[st].s || msgs[i].t - msgs[i - 1].t > 30 * 60e3) {
      const n = i - st;
      if (msgs[st].s === 0 && n >= 12) {
        const mins = Math.round((msgs[i - 1].t - msgs[st].t) / 60e3);
        mkEvent('burst', st, i - 1, `${PEER}连发 ${n} 条`, { size: n, snippet: firstText(st, i - 1), meta: `${hm(msgs[st])}–${hm(msgs[i - 1])} · ${mins >= 60 ? Math.floor(mins / 60) + ' 小时 ' + (mins % 60) + ' 分' : mins + ' 分钟'}内没有回复` });
      }
      st = i;
    }
  }
}
// late-night sessions (00:00–06:00) dominated by the peer
for (const d of dates) {
  const night = days.get(d).filter(m => +m.d.slice(11, 13) < 6);
  if (!night.length) continue;
  const p = night.filter(m => !m.s).length, s = night.length - p;
  if (p >= 20 && p >= s * 1.5) {
    const pa = posOfId.get(night[0].i), pb = posOfId.get(night.at(-1).i);
    mkEvent('night', pa, pb, `凌晨 ${hm(night[0])}–${hm(night.at(-1))}`, { size: p, snippet: firstText(pa, pb), meta: `${PEER} ${p} 条 / ${SELF} ${s} 条` });
  }
}
// emotionally loaded lines
{
  const re = /舔狗|求你了|把我删|拉黑|真的累|好累|伤心|傻逼|恶心我|恶心人|逃避|说话啊|又不说话|当我死了|被t|踢一脚|没人在乎|尽力了|不甘心|可悲/;
  msgs.forEach((m, i) => {
    if (m.s || (m.k !== 'text' && m.k !== 'reply')) return;
    if (re.test(m.x || '')) mkEvent('mood', i, i, m.x, { meta: hm(m) });
  });
}
// long silences
for (let i = 1; i < msgs.length; i++) {
  const g = (msgs[i].t - msgs[i - 1].t) / 864e5;
  if (g >= 5) mkEvent('silence', i, i, `沉默 ${Math.floor(g)} 天`, { size: g, snippet: textOf(msgs[i]) || textOf(msgs[i - 1]), meta: `${msgs[i - 1].d.slice(5, 10)} → ${msgs[i].d.slice(5, 10)} · ${nameOf(msgs[i])}先开口` });
}
// long calls
msgs.forEach((m, i) => {
  if (m.k !== 'call') return;
  const mt = /通话时长\s*(?:(\d+):)?(\d+):(\d+)/.exec(m.x || '');
  if (!mt) return;
  const sec = (+mt[1] || 0) * 3600 + +mt[2] * 60 + +mt[3];
  if (sec < 3600) return;
  const start = new Date(m.t - sec * 1000);
  let pa = i;
  while (pa > 0 && msgs[pa - 1].t >= start.getTime()) pa--;
  mkEvent('call', pa, i, `语音通话 ${Math.floor(sec / 3600)} 小时 ${Math.floor(sec % 3600 / 60)} 分`, { size: sec, meta: `${pad(start.getHours())}:${pad(start.getMinutes())}–${hm(m)} 结束` });
});
// busiest days
[...dates].sort((x, y) => days.get(y).length - days.get(x).length).slice(0, 12).forEach(d => {
  const l = days.get(d), p = l.filter(m => !m.s).length;
  // A daily total is a point marker, not a range covering every conversation that day.
  const firstPeer = l.find(m => !m.s);
  if (firstPeer) mkEvent('peak', posOfId.get(firstPeer.i), posOfId.get(firstPeer.i), `单日 ${l.length} 条`, { size: l.length, meta: `${PEER} ${p} 条 / ${SELF} ${l.length - p} 条` });
});
// Combine intersecting detections into one entry, retaining every tag and noteworthy title.
// In particular, a mood line inside a pinned exchange must not become a second jump.
// The highest ranked detection names the merged entry; folded kinds come last, so a silence or a busy day that
// falls inside a work / daily exchange still names it and keeps it in the 全部 list.
const EVENT_ORDER = ['pin', 'pay', 'mood', 'burst', 'night', 'call', 'silence', 'peak', 'work', 'daily'];
const rankOf = type => EVENT_ORDER.indexOf(type);
// Merging is idempotent: an already merged entry carries its tags, details, notes, sizes and exchange along.
function mergeEvents(input) {
  const groups = [];
  for (const ev of [...input].sort((a, b) => a.pa - b.pa || a.pb - b.pb)) {
    const previous = groups.at(-1);
    if (previous && ev.pa <= previous.pb) {
      previous.pb = Math.max(previous.pb, ev.pb);
      previous.items.push(ev);
    } else groups.push({ pa: ev.pa, pb: ev.pb, items: [ev] });
  }
  return groups.map(({ pa, pb, items }) => {
    if (items.length === 1 && items[0].tags) return items[0];
    const ranked = [...items].sort((a, b) => rankOf(a.type) - rankOf(b.type) || a.pa - b.pa);
    const primary = ranked[0], a = msgs[pa], b = msgs[pb], stats = rangeStats(pa, pb);
    const tags = [...new Set(items.flatMap(e => e.tags || [e.type]))].sort((x, y) => rankOf(x) - rankOf(y));
    // exchanges are whole sessions kept clear of every range event, so at most one ends up here
    const topic = items.find(e => e.topic)?.topic;
    return { ...primary, pa, pb, a: a.i, b: b.i, t: a.t, date: a.d.slice(0, 10), tags, topic,
      details: [...new Set(ranked.flatMap((e, i) => [...(i ? [`${TYPES[e.type].label} · ${e.title}`] : []), ...(e.details || [])]))],
      note: [...new Set(ranked.map(e => e.note).filter(Boolean))].join('；'),
      meta: items.length === 1 ? primary.meta : `${segRange({ pa, pb })} · ${PEER} ${stats.p} 条 / ${SELF} ${stats.s} 条`,
      sizes: Object.fromEntries(tags.map(tag => [tag, Math.max(0, ...items.map(e => e.sizes?.[tag] || (e.type === tag ? e.size || 0 : 0)))])),
    };
  });
}
events = mergeEvents(events);

// Classify exchanges. Inside each session (no pause over 30 min, same day) only the lines that matter stay
// open: marked events, annotated lines, talk about pay (its own 报价 event) and about the falling-out.
// The stretches between them are classified on their own as work / daily and folded.
// Matched against the same text search looks at: the message, the quote it answers and forwarded lines.
const msgText = m => [textOf(m), m.rp?.t, ...(m.fw?.it || [])].filter(Boolean).join(' ');
// pay, prices, contracts — "30一组" counts as a price too
const PAY = /待遇|工资|稿费|稿酬|报酬|酬劳|薪资|薪水|薪酬|月薪|底薪|人天|外包|分红|入股|股份|股东|报价|价格|价钱|多少钱|不用钱|要钱|给钱|付钱|花钱|拿钱|赚钱|钱的问题|预算|结算|结款|收款|打款|付款|转账|红包|报销|发票|税|抵扣|核算|欠款|合同|保障|月结|\d+\s*(元|块|rmb|\/组|一组|每组)/i;
// the falling-out and feelings
const FEEL = /辞职|离职|决策权|替代|替了|踢|拉黑|删了|把我删|求你|舔狗|伤心|难过|难受|生气|不满|不爽|失望|无语|吵架|画饼|pua|不合理|凭什么|过分|委屈|心情|抑郁|bpd|医院|生病|真心|尽力|不甘心|对不起|道歉|抱歉/i;
// no folded line ever holds one of these words
const TOPIC_KEEP = new RegExp(`${PAY.source}|${FEEL.source}`, 'i');
{
  const WORK = /动画|特效|原画|策划|程序|实装|导出|画布|像素|图层|帧|需求|美术|素材|场景|技能|待机|角色|版本|测试|bug|修复|源文件|打包|压缩包|psd|aseprite|tilemap|godot|魔女|魔旅|项目|地编|武器|子弹|枪|看板娘|画|改|幅度|效果|动作|节奏|速率|调整|优化|逐帧|骨骼|spine|立绘|变身|翅膀|光效|有没有要|行不|可以不/i;
  const DAILY = /早安|晚安|睡觉|睡了|睡醒|起床|吃饭|恰饭|吃了|午饭|晚饭|早饭|好吃|外卖|奶茶|猫|喵|出门|回家|打游戏|玩游戏|周末|天气|下雨|哈哈|可爱|摸摸|抱抱|生日|休息/;
  const FOLD_MIN = 2; // a single line on its own stays as it is
  const NEIGHBOUR_MAX = 6; // an unclear stretch this short, right next to work, is part of that work
  const noted = new Set((window.__NOTES__ || []).map(n => n.i));
  const kept = new Uint8Array(msgs.length);
  for (const e of events) if (e.tags.some(t => !['peak', 'silence'].includes(t))) kept.fill(1, e.pa, e.pb + 1);
  msgs.forEach((m, i) => { if (noted.has(m.i)) kept[i] = 1; });
  // hits a few lines apart are one talk; it takes in the lines that ask and answer around it
  const clusters = (idx, gap) => {
    const out = [];
    for (const k of idx) { const c = out.at(-1); if (c && k - c[1] <= gap) c[1] = k; else out.push([k, k]); }
    return out;
  };
  for (let pa = 0; pa < msgs.length;) {
    let pb = pa;
    while (pb + 1 < msgs.length && msgs[pb + 1].t - msgs[pb].t <= 30 * 60e3 && msgs[pb + 1].d.slice(0, 10) === msgs[pa].d.slice(0, 10)) pb++;
    const texts = msgs.slice(pa, pb + 1).map(msgText);
    const hits = re => texts.flatMap((t, k) => re.test(t) ? [pa + k] : []);
    for (const [a, b] of clusters(hits(PAY), 6)) {
      const x = Math.max(pa, a - 2), y = Math.min(pb, b + 3);
      kept.fill(1, x, y + 1);
      const first = msgs[a], st = rangeStats(x, y), t = msgText(first).replace(/\s+/g, ' ').trim();
      events.push({ type: 'pay', pa: x, pb: y, a: msgs[x].i, b: msgs[y].i, t: msgs[x].t, date: msgs[x].d.slice(0, 10), size: y - x + 1,
        title: t.length > 36 ? t.slice(0, 36) + '…' : t, meta: `${segRange({ pa: x, pb: y })} · ${PEER} ${st.p} 条 / ${SELF} ${st.s} 条` });
    }
    for (const [a, b] of clusters(hits(FEEL), 4)) kept.fill(1, Math.max(pa, a - 1), Math.min(pb, b + 1) + 1);
    pa = pb + 1;
  }
  // a sealed 魔女2 run is never split between an open part and a folded one
  for (const r of sealRuns) if (kept.subarray(r.pa, r.pb + 1).some(Boolean)) kept.fill(1, r.pa, r.pb + 1);
  // 1. every stretch of not-kept lines inside a session, classified on its own
  const pieces = [];
  for (let pa = 0; pa < msgs.length;) {
    let pb = pa;
    while (pb + 1 < msgs.length && msgs[pb + 1].t - msgs[pb].t <= 30 * 60e3 && msgs[pb + 1].d.slice(0, 10) === msgs[pa].d.slice(0, 10)) pb++;
    for (let x = pa; x <= pb;) {
      if (kept[x]) { x++; continue; }
      let y = x;
      while (y + 1 <= pb && !kept[y + 1]) y++;
      const stretch = msgs.slice(x, y + 1), texts = stretch.map(msgText);
      const work = texts.filter(s => WORK.test(s)).length;
      const daily = texts.filter(s => DAILY.test(s)).length;
      const sequel = stretch.some(isMasked);
      // files and videos are deliveries: work. A long chat that only touches on work now and then stays open.
      const type = sequel || stretch.some(m => m.k === 'file' || m.k === 'video') || (work >= 2 && work >= stretch.length * 0.15) || (work && stretch.length <= 3) ? 'work'
        : !work && (daily >= 2 || (daily && stretch.length <= 10)) ? 'daily' : null;
      pieces.push({ pa: x, pb: y, type, sequel });
      x = y + 1;
    }
    pa = pb + 1;
  }
  const touching = (a, b) => b.pa === a.pb + 1 && msgs[b.pa].d.slice(0, 10) === msgs[a.pb].d.slice(0, 10);
  // 2. a short unclear stretch right next to work (nothing shown between) is part of that work
  pieces.forEach((g, k) => {
    if (g.type || g.pb - g.pa + 1 > NEIGHBOUR_MAX) return;
    const prev = pieces[k - 1], next = pieces[k + 1];
    if ((prev?.type === 'work' && touching(prev, g)) || (next?.type === 'work' && touching(g, next))) g.type = 'work';
  });
  // 3. back-to-back stretches of the same kind on one day are one exchange (no stack of bars)
  const merged = [];
  for (const g of pieces) {
    const p = merged.at(-1);
    if (p && g.type && p.type === g.type && p.sequel === g.sequel && touching(p, g)) p.pb = g.pb;
    else merged.push({ ...g });
  }
  for (const { pa: x, pb: y, type, sequel } of merged) {
    if (!type || (y - x + 1 < FOLD_MIN && !sequel)) continue;
    const g = { id: topicSegs.length + 1, type, pa: x, pb: y, n: y - x + 1, sequel };
    topicSegs.push(g);
    for (let i = x; i <= y; i++) msgs[i].topic = g.id;
    const a = msgs[x], b = msgs[y], stats = rangeStats(x, y);
    events.push({ type, topic: g.id, pa: x, pb: y, a: a.i, b: b.i, t: a.t, date: a.d.slice(0, 10), size: g.n,
      title: `${TYPES[type].label}对话 ${g.n} 条`, meta: `${segRange(g)} · ${PEER} ${stats.p} 条 / ${SELF} ${stats.s} 条` });
  }
}
events = mergeEvents(events);
// 全部 lists every entry carrying a noteworthy tag; plain work / daily exchanges only appear under their own chip.
const listedInAll = e => e.tags.some(t => !TYPES[t].folded);
const eventsFor = filter => events.filter(e => (filter === 'all' ? listedInAll(e) : e.tags.includes(filter)));
// Entries never overlap, so reading order is simply by start.
const readingOrder = list => [...list].sort((x, y) => x.pa - y.pa);
// The entry after the last arrow jump `from` when it is still listed, otherwise the first starting after message position `ref`.
function nextIn(list, from, ref) {
  const k = from ? list.indexOf(from) : -1;
  return k >= 0 ? list[k + 1] : list.find(e => e.pa > ref);
}

let evFilter = 'all', activeEv = null, navPos = null;
const evButtons = new Map();
function renderEvents() {
  let list = eventsFor(evFilter);
  if (['burst', 'peak', 'night'].includes(evFilter)) list.sort((x, y) => y.sizes[evFilter] - x.sizes[evFilter] || x.t - y.t);
  else list.sort((x, y) => (evFilter === 'all' ? (y.type === 'pin') - (x.type === 'pin') : 0) || x.t - y.t);
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'event-hint', evFilter === 'all' ? '相交标记已合并 · 工作、日常请点分类查看' : TYPES[evFilter].folded ? '对话默认折叠，点击事件展开原文' : '同一段对话的标记合并展示'));
  evButtons.clear();
  for (const ev of list) {
    const ty = TYPES[ev.type];
    const b = el('button', 'event');
    evButtons.set(ev, b);
    b.type = 'button';
    b.dataset.start = ev.a;
    b.dataset.end = ev.b;
    b.dataset.tags = ev.tags.join(' ');
    b.style.setProperty('--c', ty.color);
    if (activeEv === ev) b.classList.add('active');
    const tags = el('div', 'ev-tags');
    for (const tag of ev.tags) {
      const badge = el('span', 'ev-tag', TYPES[tag].label);
      badge.style.setProperty('--c', TYPES[tag].color);
      tags.append(badge);
    }
    const top = el('div', 'ev-top');
    top.append(el('strong', 'ev-title', ev.title), el('time', 'ev-date', ev.date.slice(2).replace(/-/g, '/')));
    b.append(tags, top);
    if (ev.note) b.append(el('p', 'ev-note', ev.note));
    if (ev.snippet && !ev.topic) b.append(el('p', 'ev-snip', ev.snippet));
    if (ev.details.length) {
      const related = el('ul', 'ev-related');
      for (const title of ev.details.slice(0, 3)) related.append(el('li', '', title));
      if (ev.details.length > 3) related.append(el('li', '', `另 ${ev.details.length - 3} 处标记，已合并到本段`));
      b.append(related);
    }
    if (ev.meta) b.append(el('div', 'ev-meta', ev.meta));
    b.onclick = () => gotoEvent(ev);
    frag.append(b);
  }
  if (!list.length) frag.append(el('div', 'empty', '没有事件'));
  $('eventList').replaceChildren(frag);
  $('eventList').scrollTop = 0;
}
function setActiveEvent(ev) {
  activeEv = ev;
  for (const x of $('eventList').querySelectorAll('.event.active')) x.classList.remove('active');
  const b = evButtons.get(ev);
  if (b) {
    b.classList.add('active');
    if (!$('panelEvents').classList.contains('hidden')) b.scrollIntoView({ block: 'nearest' });
  }
}
function gotoEvent(ev) {
  highlight = '';
  revealTopic(ev.topic);
  setActiveEvent(ev);
  openAt(dateIdx.get(ev.date), { id: ev.a, range: ev.pa === ev.pb ? null : [ev.a, ev.b], flash: true, center: ev.pa === ev.pb });
  navPos = ev; // "next" continues from this event even if it sits low on screen
  syncNextBtn();
  try { history.replaceState(null, '', '#m' + ev.a); } catch {}
}

/* ---------- next-event arrow ---------- */
// Events in reading order, following the event-type filter chosen in the sidebar.
const navList = () => readingOrder(eventsFor(evFilter));
// Message position at the reading line near the top of the viewport.
function readingPos() {
  const y = wrap.scrollTop + 80;
  for (const e of chat.querySelectorAll('.msg,.topic-marker,.seal-note')) {
    if (e.offsetTop + e.offsetHeight <= y) continue;
    if (e.dataset.topic) {
      const g = topicSegs[e.dataset.topic - 1];
      return visible(msgs[g.pa]) ? g.pa : g.pb;
    }
    if (e.dataset.seal) return sealRuns[e.dataset.seal - 1].pb;
    return resolvePos(+e.dataset.id);
  }
  return msgs.length - 1;
}
function nextEvent() {
  // right after an arrow jump: the event that follows it, even if it sits low on screen
  return nextIn(navList(), navPos, navPos ? navPos.pa : readingPos());
}
function syncNextBtn() {
  const ev = nextEvent(), b = $('nextEv');
  b.classList.toggle('hidden', !ev);
  if (ev) b.title = `下一个${evFilter === 'all' ? '' : '「' + TYPES[evFilter].label + '」'}事件：${TYPES[ev.type].label} · ${ev.title}（${ev.date.slice(5).replace('-', '/')}）`;
}
$('nextEv').onclick = () => {
  const ev = nextEvent();
  if (!ev) { toast('后面没有事件了'); return; }
  gotoEvent(ev);
  toast(`${TYPES[ev.type].label} · ${ev.title}`);
};
function renderChips() {
  // counted with the same filter the list and the arrow use
  const counts = Object.fromEntries(['all', ...Object.keys(TYPES)].map(k => [k, eventsFor(k).length]));
  if (!counts[evFilter]) evFilter = 'all';
  const frag = document.createDocumentFragment();
  for (const [k, label] of [['all', '全部'], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])]) {
    if (!counts[k]) continue;
    const folded = TYPES[k]?.folded;
    const c = el('button', 'chip' + (k === evFilter ? ' active' : '') + (folded ? ' folded' : ''), label);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(k === evFilter));
    if (folded) c.title = '默认折叠，点击查看此类事件，再点事件展开对话';
    c.append(el('small', '', counts[k]));
    c.onclick = () => {
      evFilter = k;
      navPos = null;
      for (const x of $('eventFilters').children) {
        x.classList.toggle('active', x === c);
        x.setAttribute('aria-pressed', String(x === c));
      }
      renderEvents();
      syncNextBtn();
    };
    frag.append(c);
  }
  $('eventFilters').replaceChildren(frag);
  renderEvents();
}
renderChips();

/* ---------- tabs & drawer ---------- */
function setTab(tab) {
  for (const b of document.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle(b.classList.contains('tab') ? 'active' : 'selected', on);
    if (b.classList.contains('tab')) b.setAttribute('aria-selected', String(on));
  }
  $('panelDates').classList.toggle('hidden', tab !== 'dates');
  $('panelEvents').classList.toggle('hidden', tab !== 'events');
  if (tab === 'dates') activeBtn?.scrollIntoView({ block: 'center' });
}
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => {
  setTab(b.dataset.tab);
  if (b.classList.contains('rail-btn') && matchMedia('(max-width: 760px)').matches) setDrawer(true);
});
function setDrawer(open) {
  $('sidebar').classList.toggle('open', open);
  $('backdrop').classList.toggle('hidden', !open);
}
$('menuBtn').onclick = () => setDrawer(true);
$('backdrop').onclick = () => setDrawer(false);

/* ---------- search ---------- */
const hay = msgs.map(msgText);
const hayLow = hay.map(s => s.toLowerCase());
let searchTimer, who = 'all';
function openSearch() {
  $('searchPanel').classList.remove('hidden');
  document.querySelector('.chat-area').classList.add('searching');
  $('searchInput').focus();
  $('searchInput').select();
}
function closeSearch() {
  $('searchPanel').classList.add('hidden');
  document.querySelector('.chat-area').classList.remove('searching');
  if (highlight) {
    highlight = '';
    for (const m of chat.querySelectorAll('mark')) m.replaceWith(document.createTextNode(m.textContent));
  }
}
function runSearch() {
  const q = $('searchInput').value.trim();
  const box = $('searchResults');
  if (!q) { $('searchCount').textContent = ''; box.replaceChildren(); return; }
  const ql = q.toLowerCase(), found = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (who !== 'all' && String(msgs[i].s) !== who) continue;
    // searching explicitly can discover folded exchanges; opening a result reveals only its exchange.
    // Sealed 魔女2 lines are not results.
    if (msgs[i].seal || (msgs[i].topic && !openable(msgs[i].topic))) continue;
    if (hayLow[i].includes(ql)) found.push(i);
  }
  $('searchCount').textContent = found.length ? `${found.length} 条` : '';
  const frag = document.createDocumentFragment();
  const prevHl = highlight;
  highlight = q;
  for (const i of found.slice(0, 300)) {
    const m = msgs[i];
    const r = el('button', 'result');
    r.type = 'button';
    const av = el('img', 'avatar');
    av.src = m.s ? 'avatars/me.jpg' : 'avatars/peer.jpg';
    av.alt = '';
    av.loading = 'lazy';
    const body = el('div', 'result-body');
    const head = el('div', 'result-head');
    head.append(el('span', '', nameOf(m)), el('time', '', m.d.slice(0, 16).replace(/-/g, '/')));
    const p = hayLow[i].indexOf(ql);
    body.append(head, richText((p > 24 ? '…' : '') + hay[i].slice(Math.max(0, p - 24), p + q.length + 80), 'result-snip'));
    r.append(av, body);
    r.onclick = () => {
      highlight = q;
      revealTopic(m.topic);
      openAt(dateIdx.get(m.d.slice(0, 10)), { id: m.i, center: true, flash: true });
      if (matchMedia('(max-width: 760px)').matches) { $('searchPanel').classList.add('hidden'); document.querySelector('.chat-area').classList.remove('searching'); }
    };
    frag.append(r);
  }
  highlight = prevHl;
  if (!found.length) frag.append(el('div', 'empty', '没有找到相关聊天记录'));
  else if (found.length > 300) frag.append(el('div', 'empty', '只显示最近 300 条，可以换个更具体的关键词'));
  box.replaceChildren(frag);
  box.scrollTop = 0;
}
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 150); });
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); } });
for (const c of document.querySelectorAll('.search-filter .chip')) c.onclick = () => {
  who = c.dataset.who;
  for (const x of document.querySelectorAll('.search-filter .chip')) x.classList.toggle('active', x === c);
  runSearch();
};
$('searchBtn').onclick = openSearch;
$('railSearch').onclick = openSearch;
$('closeSearch').onclick = closeSearch;

/* ---------- misc ---------- */
let toastTimer;
function toast(s) {
  clearTimeout(toastTimer);
  $('toast').textContent = s;
  $('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3000);
}

document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
  if (e.key === 'Escape') { closeSearch(); setDrawer(false); }
  if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
});

{
  const last = msgs.findLast(m => m.k === 'text') || msgs.at(-1);
  $('lastMsg').textContent = textOf(last);
  $('lastTime').textContent = last.d.slice(2, 10).replace(/-/g, '/');
  document.querySelector('.conv').onclick = () => openAt(LAST, { bottom: true });
}
$('peerName').textContent = PEER;
$('headerPeer').textContent = PEER;
document.title = PEER;

/* ---------- initial position ---------- */
// v3: positions saved by older versions mostly pointed at the newest messages; everyone starts from the beginning once
const POS_KEY = 'qq-viewer.pos.v3';
{
  let id = null;
  const h = /^#m(\d+)$/.exec(location.hash);
  if (h) id = +h[1];
  else { try { const s = localStorage.getItem(POS_KEY); if (s) id = +s; } catch {} }
  if (id != null && id >= 0 && id <= msgs.at(-1).i) {
    const ev = h && events.find(e => e.a === id && e.pa !== e.pb);
    if (ev) gotoEvent(ev);
    else if (h) openMessage(id);
    else {
      // a saved reading position does not unfold anything: a folded message is shown by its marker
      const m = msgs[resolvePos(id)];
      openAt(dateIdx.get(m.d.slice(0, 10)), { id: m.i });
    }
  } else openAt(0); // first visit: start from the very first message
  window.addEventListener('hashchange', () => {
    const x = /^#m(\d+)$/.exec(location.hash);
    if (x) openMessage(+x[1]);
  });
}

/* Small surface for the local annotation editor (tools/editor.js); unused on the published page. */
window.__VIEWER__ = {
  msgs, hooks, popCloseGuards, nameOf, textOf, toast, showPop, hidePop, placePop,
  getNotes: () => [...noteOf.values()],
  setNotes(list) { loadNotes(list); rerender(); },
  rerender,
  openAtId(id) { openMessage(id, { center: true }); },
};
})();
