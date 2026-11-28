#!/usr/bin/env node
// Exercise the viewer's actual event pipeline on the real data, without a browser, third-party packages or
// copied detection rules: the setup and event sections of app.js are cut out of the source and run in a VM.
//
//   node tools/check-events.mjs            compare with the pre-merge viewer (git BASELINE_REF) when available
//   node tools/check-events.mjs --no-baseline
//
// Only counts and message ids are printed, never message text.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const BASELINE_REF = '974142f'; // last viewer with overlapping, unmerged event markers
const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [source, dataJs, notesJs] = await Promise.all([read('app.js'), read('data.js'), read('notes.js')]);

// `to` may list alternatives: the first one found after `from` ends the section (older app.js versions differ).
function cut(src, from, to) {
  const a = src.indexOf(from);
  const b = Math.min(...[to].flat().map(t => src.indexOf(t, a)).filter(i => i > a));
  assert.ok(a >= 0 && Number.isFinite(b), `app.js section "${from}" … "${to}" not found`);
  return src.slice(a, b);
}
// Run the setup + event pipeline of one app.js version; `expose` lists the locals handed back.
function load(src, expose) {
  const context = vm.createContext({ window: {}, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(dataJs, context);
  vm.runInContext(notesJs, context); // the classifier keeps annotated exchanges open
  const setup = cut(src, 'const data =', '/* ---------- message rendering');
  const helpers = cut(src, 'const segRange =', ['// Marker where', '// Expand one folded']);
  const pipeline = cut(src, 'const TYPES =', "let evFilter = 'all'");
  vm.runInContext(`(() => { ${setup}\n${helpers}\n${pipeline}\nwindow.result = { ${expose} }; })();`, context);
  return context.window.result;
}
const overlapPairs = list => {
  const ordered = [...list].sort((a, b) => a.pa - b.pa || a.pb - b.pb);
  let n = 0, first = null;
  for (let i = 1; i < ordered.length; i++) {
    for (let j = i - 1; j >= 0; j--) if (ordered[j].pb >= ordered[i].pa) { n++; first ??= [ordered[j].a, ordered[i].a]; }
  }
  return { n, first };
};

const cur = load(source, `events, msgs, topicSegs, PINNED, TYPES, EVENT_ORDER, TOPIC_KEEP, msgText, mergeEvents,
  eventsFor, readingOrder, nextIn, visible, expandedTopics, notes: window.__NOTES__, MASK, isMasked, sealRuns, openable`);
const { events, msgs, topicSegs, TYPES } = cur;
const FOLDED = Object.keys(TYPES).filter(t => TYPES[t].folded);
const label = t => TYPES[t].label;
const traced = (ev, type, title) => ev.tags.includes(type) && (ev.title === title || ev.details.includes(`${label(type)} · ${title}`));
const covering = (pa, pb) => events.filter(e => e.pa <= pb && e.pb >= pa);

/* ---------- 1. disjoint, well-formed entries ---------- */
const ov = overlapPairs(events);
console.log(`Merged: ${events.length} entries, overlapping pairs: ${ov.n}`);
assert.equal(ov.n, 0, `overlapping entries, first at message ids ${JSON.stringify(ov.first)}`);
for (const ev of events) {
  assert.ok(ev.pa <= ev.pb && msgs[ev.pa].i === ev.a && msgs[ev.pb].i === ev.b && ev.t === msgs[ev.pa].t && ev.date === msgs[ev.pa].d.slice(0, 10), `bad range ${ev.a}`);
  assert.ok(ev.tags.length && ev.tags.every(t => TYPES[t]), `unknown tag at ${ev.a}`);
  assert.equal(ev.tags[0], ev.type, `entry ${ev.a} is not named after its highest ranked tag`);
  assert.deepEqual(Object.keys(ev.sizes).sort(), [...ev.tags].sort(), `sizes / tags differ at ${ev.a}`);
  assert.ok(Array.isArray(ev.details) && typeof ev.note === 'string');
}
// merging again changes nothing
assert.deepEqual(JSON.parse(JSON.stringify(cur.mergeEvents(events))), JSON.parse(JSON.stringify(events)), 'mergeEvents is not idempotent');
// merging already merged entries keeps everything both carried (as the second pass does)
{
  const multi = events.find(e => e.tags.length >= 3 && !e.topic), next = events.find(e => e.topic && e.pa > multi.pb);
  const [m] = cur.mergeEvents([{ ...multi, pb: next.pa }, next]);
  assert.deepEqual(new Set(m.tags), new Set([...multi.tags, ...next.tags]));
  assert.equal(m.title, multi.title);
  assert.equal(m.topic, next.topic);
  assert.equal(m.note, multi.note);
  for (const d of [...multi.details, `${label(next.type)} · ${next.title}`]) assert.ok(m.details.includes(d), 'detail lost when re-merging');
  for (const t of multi.tags) assert.equal(m.sizes[t], multi.sizes[t]);
}
console.log('Entries are disjoint, point to valid messages, and re-merging keeps tags, titles, notes and sizes.');

/* ---------- 2. every pinned moment and every old marker is still traceable ---------- */
for (const p of cur.PINNED) {
  const hits = events.filter(e => traced(e, 'pin', p.title));
  assert.equal(hits.length, 1, `pinned moment at ${p.a} not traceable`);
  if (p.note) assert.ok(hits[0].note.split('；').includes(p.note), `pinned note at ${p.a} lost`);
}
let baseline = null;
if (!process.argv.includes('--no-baseline')) {
  try {
    const old = execFileSync('git', ['show', `${BASELINE_REF}:app.js`], { cwd: fileURLToPath(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    baseline = load(old, 'events, msgs');
  } catch {
    console.log(`Baseline ${BASELINE_REF} not available (shallow clone?); skipping the comparison with the old markers.`);
  }
}
if (baseline) {
  const bo = overlapPairs(baseline.events);
  console.log(`Baseline ${BASELINE_REF}: ${baseline.events.length} markers, overlapping pairs: ${bo.n}`);
  assert.deepEqual([...baseline.msgs.map(m => m.i)], [...msgs.map(m => m.i)], 'message lists differ from the baseline');
  const perType = {};
  for (const old of baseline.events) {
    const row = perType[old.type] ??= { before: 0, traced: 0 };
    row.before++;
    let ok;
    if (old.type === 'w2') {
      // the (now masked) sequel segment is either still on screen or inside folded work exchanges
      ok = true;
      for (let i = old.pa; i <= old.pb; i++) {
        const g = msgs[i].topic && topicSegs[msgs[i].topic - 1];
        if (g && !(g.type === 'work' && g.sequel)) ok = false;
      }
    } else if (old.type === 'peak') {
      // the busy day is now a point marker on its first line from the peer
      // (merged into whatever covers that line, which may have started the evening before)
      const p = msgs.findIndex(m => !m.s && m.d.startsWith(old.date));
      ok = covering(p, p).some(e => traced(e, 'peak', old.title));
    } else if (old.type === 'burst') {
      // Bursts are now also broken by a pause over 30 minutes. Every piece still long enough (12+) must be
      // marked; a "burst" spread over hours or days with no such piece is no longer one, and is only counted.
      const pieces = [];
      for (let i = old.pa, st = old.pa; i <= old.pb; i++) {
        if (i === old.pb || msgs[i + 1].t - msgs[i].t > 30 * 60e3) { pieces.push([st, i]); st = i + 1; }
      }
      const long = pieces.filter(([a, b]) => b - a + 1 >= 12);
      ok = long.every(([a, b]) => events.some(e => e.pa <= a && e.pb >= b && e.tags.includes('burst')));
      if (!long.length) {
        assert.ok(pieces.length > 1);
        row.split = (row.split || 0) + 1;
      }
    } else {
      ok = covering(old.pa, old.pb).some(e => e.pa <= old.pa && e.pb >= old.pb && traced(e, old.type, old.title) && (!old.note || e.note.includes(old.note)));
    }
    assert.ok(ok, `old ${old.type} marker at message ${old.a} is not traceable`);
    row.traced++;
  }
  const now = {};
  for (const e of events) for (const t of e.tags) now[t] = (now[t] || 0) + 1;
  console.log('Old markers traced (type: before → entries tagged now):',
    Object.entries(perType).map(([t, r]) => `${t} ${r.traced}/${r.before}${r.split ? ` (${r.split} spread over long pauses, no longer bursts)` : ''} → ${now[t === 'w2' ? 'work' : t] ?? 0}`).join(', '));
}

/* ---------- 3. work / daily exchanges ---------- */
const byType = t => topicSegs.filter(g => g.type === t);
assert.ok(byType('work').length > 0 && byType('daily').length > 0, 'work and daily must both be found');
const KEPT_TAGS = new Set([...FOLDED, 'peak', 'silence']); // point markers that may sit inside a folded exchange
const noted = new Set(cur.notes.map(n => n.i));
for (const g of topicSegs) {
  const own = events.filter(e => e.topic === g.id);
  assert.equal(own.length, 1, `exchange ${g.id} has ${own.length} entries`);
  assert.ok(own[0].pa === g.pa && own[0].pb === g.pb && own[0].tags.includes(g.type), `exchange ${g.id} entry does not match it`);
  assert.equal(msgs[g.pa].d.slice(0, 10), msgs[g.pb].d.slice(0, 10), `exchange ${g.id} spans two days`);
  for (const e of covering(g.pa, g.pb)) assert.ok(e.tags.every(t => KEPT_TAGS.has(t)), `exchange ${g.id} hides a ${e.tags.join('/')} event`);
  for (let i = g.pa; i <= g.pb; i++) {
    assert.equal(msgs[i].topic, g.id);
    assert.ok(!noted.has(msgs[i].i), `annotated message ${msgs[i].i} is folded`);
    assert.ok(!cur.TOPIC_KEEP.test(cur.msgText(msgs[i])), `message ${msgs[i].i} about pay / the dispute is folded`);
  }
}
assert.equal(msgs.filter(m => m.topic).length, topicSegs.reduce((n, g) => n + g.n, 0));
// masked 魔女2 lines never sit in a daily exchange
for (const g of byType('daily')) for (let i = g.pa; i <= g.pb; i++) assert.ok(!cur.isMasked(msgs[i]), `masked line ${msgs[i].i} folded as daily`);
console.log(`Folded exchanges: ${byType('work').length} work (${byType('work').filter(g => g.sequel).length} with masked 魔女2 lines), ${byType('daily').length} daily, `
  + `${topicSegs.reduce((n, g) => n + g.n, 0)} of ${msgs.length} messages; none holds an annotation, pay / dispute words or a marked event.`);

/* ---------- 4. folded by default, one exchange opens at a time, 魔女2 never ---------- */
cur.expandedTopics.clear();
const shown = () => msgs.reduce((n, m) => n + cur.visible(m), 0);
const base = shown();
assert.ok(msgs.every(m => !cur.isMasked(m) || m.seal), 'a masked line is not sealed');
for (const r of cur.sealRuns) {
  const t = msgs[r.pa].topic;
  for (let i = r.pa; i <= r.pb; i++) assert.equal(msgs[i].topic, t, `sealed run ${msgs[r.pa].i} straddles an exchange edge`);
}
assert.ok(msgs.every(m => cur.visible(m) === (!m.topic && !m.seal)), 'exactly the folded exchanges and sealed lines are hidden by default');
let locked = 0;
for (const g of topicSegs) {
  cur.expandedTopics.add(g.id); // even forced open, an exchange holding 魔女2 lines shows nothing
  if (g.sequel) { assert.equal(shown(), base, `exchange ${g.id} holding 魔女2 lines can be opened`); locked++; }
  else {
    assert.equal(shown(), base + g.n, `expanding ${g.id} shows other messages too`);
    for (let i = g.pa; i <= g.pb; i++) assert.ok(cur.visible(msgs[i]));
  }
  cur.expandedTopics.delete(g.id);
}
assert.equal(shown(), base);
const sealedOutside = cur.sealRuns.filter(r => !msgs[r.pa].topic);
console.log(`Default view hides ${msgs.length - base} messages; expanding an exchange shows exactly its own lines; `
  + `${locked} exchanges with 魔女2 lines and ${sealedOutside.length} sealed runs (${sealedOutside.reduce((n, r) => n + r.n, 0)} lines) outside them cannot be opened.`);

/* ---------- 5. chips, lists and the next arrow ---------- */
{
  const counts = {};
  const reachable = new Set();
  for (const f of ['all', ...Object.keys(TYPES)]) {
    const list = cur.eventsFor(f), order = cur.readingOrder(list);
    counts[f] = list.length;
    if (f === 'all') assert.ok(list.every(e => e.tags.some(t => !FOLDED.includes(t))), '全部 lists a plain work / daily exchange');
    else assert.ok(list.every(e => e.tags.includes(f)));
    if (f === 'all' || FOLDED.includes(f)) for (const e of list) reachable.add(e);
    // arrow jumps from the start visit every entry once, in reading order
    const seen = [];
    for (let e = cur.nextIn(order, null, -1); e; e = cur.nextIn(order, e, -1)) {
      assert.ok(!seen.includes(e), `"${f}" arrow repeats an entry`);
      seen.push(e);
    }
    assert.deepEqual(seen, [...order], `"${f}" arrow does not walk the list in order`);
    // after scrolling (no arrow jump), reading at an entry's start or past a folded exchange moves on to the next one
    order.forEach((e, k) => {
      assert.equal(cur.nextIn(order, null, e.pa), order[k + 1], `"${f}" arrow stays on entry ${e.a}`);
      if (e.topic) assert.equal(cur.nextIn(order, null, e.pb), order[k + 1]);
    });
  }
  // every entry can be found from 全部 or from the work / daily chips
  for (const e of events) assert.ok(reachable.has(e), `entry ${e.a} cannot be listed`);
  console.log('Chips:', Object.entries(counts).filter(([, n]) => n).map(([f, n]) => `${f === 'all' ? '全部' : label(f)} ${n}`).join(', '));
}
console.log('Every chip list and the next arrow visit each entry exactly once.');
