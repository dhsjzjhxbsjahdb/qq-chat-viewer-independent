// Fixed, reviewed scopes for date-wide and business redactions. The manifest contains ids and field
// paths only; original private text is never copied into scripts, reports or diagnostics.
import { eachMaskable, inRanges, TEXT_KINDS } from './sequel-mask.mjs';

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
  return { messages_masked: messages.size, fields_masked: fields };
}
