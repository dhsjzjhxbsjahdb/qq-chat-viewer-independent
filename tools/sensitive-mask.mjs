// Fixed, reviewed scopes for date-wide and business redactions. The manifest contains ids and field
// paths only; original private text is never copied into scripts, reports or diagnostics.
import { createHash } from 'node:crypto';
import { eachMaskable, inRanges, TEXT_KINDS } from './sequel-mask.mjs';

export const textDigest = value => createHash('sha256').update(value).digest('hex');

// Mixed messages keep their personal pay/dispute text; only reviewed third-party spans are removed.
export function redactSpans(value, field, mask) {
  if (textDigest(value) === field.public_sha256) return value;
  if (textDigest(value) !== field.source_sha256) throw new Error('partial_source_mismatch');
  let end = 0, out = '';
  for (const [a, b] of field.spans) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < end || a >= b || b > value.length) throw new Error('partial_span_invalid');
    out += value.slice(end, a) + mask;
    end = b;
  }
  out += value.slice(end);
  if (textDigest(out) !== field.public_sha256) throw new Error('partial_result_mismatch');
  return out;
}

export function eachPartial(data, review, fn) {
  const fields = new Map((review.partial_fields || []).map(field => [`${field.id}:${field.path}`, field]));
  for (const message of data.msgs) eachSensitiveText(message, (path, value, set) => {
    const field = fields.get(`${message.i}:${path}`);
    if (field) fn(message, path, value, set, field);
  });
}

export function eachSensitiveText(message, fn) {
  eachMaskable(message, fn);
  // Date-wide redaction also covers captions, system text and call descriptions.
  if (!TEXT_KINDS.has(message.k) && typeof message.x === 'string' && message.x) {
    fn('x', message.x, value => { message.x = value; });
  }
  if (typeof message.cl?.desc === 'string' && message.cl.desc) {
    fn('cl.desc', message.cl.desc, value => { message.cl.desc = value; });
  }
}

export function sensitiveSelector(review) {
  const mirrors = new Set((review.mirrored_fields || []).map(({ id, path }) => `${id}:${path}`));
  return (id, path) => inRanges(review.ranges, id) || mirrors.has(`${id}:${path}`);
}

export function eachSensitive(data, review, fn) {
  const selected = sensitiveSelector(review);
  for (const message of data.msgs) {
    eachSensitiveText(message, (path, value, set) => {
      if (selected(message.i, path)) fn(message, path, value, set);
    });
  }
}

export function maskSensitive(data, review) {
  const messages = new Set();
  let fields = 0;
  eachSensitive(data, review, (message, path, value, set) => {
    set(review.mask);
    messages.add(message.i);
    fields++;
  });
  const fullyMasked = sensitiveSelector(review);
  eachPartial(data, review, (message, path, value, set, field) => {
    if (fullyMasked(message.i, path)) throw new Error('partial_scope_overlap');
    set(redactSpans(value, field, review.mask));
    messages.add(message.i);
    fields++;
  });
  return { messages_masked: messages.size, fields_masked: fields };
}
