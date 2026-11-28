// Shared rule for masking the 魔女2 (unreleased sequel) work conversations in data.js.
// Used by tools/redact-sequel.mjs (writes data.js) and tools/check-privacy.mjs (verifies it).
//
// Inside a masked message every non-empty text field becomes the mask. Ids, dates, senders, kinds and
// media placeholders (image sizes, already-redacted file names, call records) are kept, so the timeline,
// counts and events stay intact while what was said is gone.

export const TEXT_KINDS = new Set(['text', 'reply', 'mixed', 'forward', 'legacy_forward']);

export const inRanges = (ranges, id) => ranges.some(([a, b]) => id >= a && id <= b);

// Visit every maskable text field of one message: fn(path, value, set).
export function eachMaskable(message, fn) {
  const at = (obj, key, path) => {
    if (typeof obj?.[key] === 'string' && obj[key] !== '') fn(path, obj[key], v => { obj[key] = v; });
  };
  // "[引用回复]" alone is an export placeholder with no content (the viewer drops such replies): leave it
  if (TEXT_KINDS.has(message.k) && message.x !== '[引用回复]') at(message, 'x', 'x');
  if (message.rp) at(message.rp, 't', 'rp.t');
  if (Array.isArray(message.seg)) message.seg.forEach((s, k) => { if (s?.t === 'text') at(s, 'x', `seg.${k}.x`); });
  if (message.fw) {
    at(message.fw, 't', 'fw.t');
    if (Array.isArray(message.fw.it)) message.fw.it.forEach((_, k) => at(message.fw.it, k, `fw.it.${k}`));
  }
}

// Apply the mask in place; returns the masked field paths (e.g. "x", "seg.1.x").
export function maskMessage(message, mask) {
  const changed = [];
  eachMaskable(message, (path, value, set) => { if (value !== mask) { set(mask); } changed.push(path); });
  return changed;
}
