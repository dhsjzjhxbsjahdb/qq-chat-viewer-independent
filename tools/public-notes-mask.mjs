// Redact duplicate business details in annotations and hand-picked event summaries as well as data.js.
import vm from 'node:vm';

export function parseNotes(source) {
  const match = /window\.__NOTES__\s*=\s*(\[[\s\S]*\]);\s*$/.exec(source);
  if (!match) throw new Error('notes_assignment_format');
  return vm.runInNewContext('(' + match[1] + ')', {}, { timeout: 1000 });
}

export function maskNotesSource(source, review) {
  const ids = new Set(review.annotation_ids || []);
  return source.replace(/("i"\s*:\s*(\d+)\s*,\s*"n"\s*:\s*)("(?:[^"\\]|\\.)*")/g,
    (match, prefix, id) => ids.has(Number(id)) ? prefix + JSON.stringify(review.mask) : match);
}

const pinnedPattern = /const PINNED = (\[[\s\S]*?\n\]);/;
export function parsePinned(source) {
  const match = pinnedPattern.exec(source);
  if (!match) throw new Error('pinned_assignment_format');
  return vm.runInNewContext('(' + match[1] + ')', {}, { timeout: 1000 });
}

export function maskPinnedSource(source, review) {
  const fields = review.pinned_fields || [];
  if (!fields.length) return source;
  const pinned = parsePinned(source);
  for (const { id, fields: names } of fields) {
    const entry = pinned.find(p => p.a === id);
    if (!entry) throw new Error('pinned_scope_exists');
    for (const name of names) {
      if (!['title', 'note'].includes(name) || typeof entry[name] !== 'string') throw new Error('pinned_field_exists');
      entry[name] = review.mask;
    }
  }
  const replacement = 'const PINNED = [\n' + pinned.map(p => '  ' + JSON.stringify(p) + ',').join('\n') + '\n];';
  return source.replace(pinnedPattern, () => replacement);
}
