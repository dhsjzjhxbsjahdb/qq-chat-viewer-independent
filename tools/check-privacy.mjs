#!/usr/bin/env node
// Verify the public download and preservation of every field outside the reviewed redaction.
// Usage: node tools/check-privacy.mjs [--baseline-ref <pre-review git revision>]
// Original personal information is read into memory only; diagnostics never print its values.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inRanges, eachMaskable, TEXT_KINDS } from './sequel-mask.mjs';
import { eachSensitive, sensitiveSelector } from './sensitive-mask.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_ID = 10920;
const EXPECTED_TEXT = '[姓名已隐藏] *** 湖北省武汉市[详细地址已隐藏]';
const OMITTED_TEXT = '[reviewed shipping text]';

function check(condition, code) {
  if (!condition) throw new Error(code);
}

function parseData(raw) {
  const match = /^window\.__CHAT__=(\{[\s\S]*\});\s*$/.exec(raw);
  check(match, 'data_assignment_format');
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error('data_json_invalid');
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectStrings(value, path = '$', output = []) {
  if (typeof value === 'string') output.push({ path, value });
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, `${path}.${key}`, output);
    }
  }
  return output;
}

// Normalize every reviewed field so unchanged metadata and unrelated conversations keep the same digest.
function preservedDigest(data, sequel, sensitive) {
  const copy = structuredClone(data);
  const message = copy.msgs.find(item => item.i === TARGET_ID);
  check(message, 'reviewed_message_exists');
  message.x = OMITTED_TEXT;
  for (const m of copy.msgs) if (inRanges(sequel.ranges, m.i)) eachMaskable(m, (path, value, set) => set(sequel.mask));
  eachSensitive(copy, sensitive, (message, path, value, set) => set(sensitive.mask));
  return digest(copy);
}

function privateFragments(text) {
  const match = /^(\p{Script=Han}{2,4})\s+\*{3}\s+(湖北省武汉市)(.+)$/u.exec(text);
  check(match, 'baseline_shipping_format');
  const detail = match[3].trim();
  const fragments = [match[1], detail, ...detail.split(/\s+/)];
  for (const [run] of detail.matchAll(/\p{Script=Han}{3,}/gu)) {
    for (let index = 0; index <= run.length - 3; index++) {
      fragments.push(run.slice(index, index + 3));
    }
  }
  return [...new Set(fragments.filter(Boolean))];
}

try {
  const args = process.argv.slice(2);
  check(args.length === 0 || (args.length === 2 && args[0] === '--baseline-ref'), 'usage');
  const data = parseData(readFileSync(resolve(ROOT, 'data.js'), 'utf8'));
  const report = JSON.parse(readFileSync(resolve(ROOT, 'privacy-report.json'), 'utf8'));
  const review = report.supplemental_review;
  check(review?.version === 1, 'supplemental_report_version');
  const sequel = report.sequel_review;
  check(sequel?.version === 1 && typeof sequel.mask === 'string' && Array.isArray(sequel.ranges), 'sequel_report_version');
  const sensitive = report.sensitive_review;
  check(sensitive?.version === 1 && sensitive.mask === '***' && Array.isArray(sensitive.ranges), 'sensitive_report_version');
  const isSensitive = sensitiveSelector(sensitive);
  check(JSON.stringify(sensitive.dates) === '["2026-09-14"]', 'sensitive_dates');
  for (const date of sensitive.dates) {
    check(data.msgs.filter(m => m.d.startsWith(date)).every(m => inRanges(sensitive.ranges, m.i)), 'sensitive_date_covered');
  }
  check(Array.isArray(data.msgs) && data.msgs.length === 11395, 'message_count');
  check(data.meta.count === data.msgs.length && report.messages === data.msgs.length, 'reported_count');
  check(new Set(data.msgs.map(message => message.i)).size === data.msgs.length, 'unique_message_ids');
  const target = data.msgs.find(message => message.i === TARGET_ID);
  check(target?.x === EXPECTED_TEXT, 'reviewed_message_redacted');
  check(target?.d === '2026-10-04 16:17:03', 'reviewed_message_date');

  const strings = collectStrings(data);
  const nestedStrings = collectStrings(data.msgs).filter(({ path }) => path.split('.').length > 3);
  check(strings.length === review.strings_checked, 'checked_string_count');
  check(nestedStrings.length === review.nested_strings_checked, 'checked_nested_string_count');
  check(review.strings_changed === 1 && review.messages_changed === 1, 'review_change_counts');
  check(JSON.stringify(review.changed_message_ids) === '[10920]', 'review_changed_ids');
  check(preservedDigest(data, sequel, sensitive) === review.validation.preserved_content_sha256, 'unrelated_data_preserved');
  // every text field inside the 魔女2 ranges is the mask
  let maskedMessages = 0, maskedFields = 0, unmasked = 0;
  for (const m of data.msgs) {
    if (!inRanges(sequel.ranges, m.i)) continue;
    let n = 0;
    eachMaskable(m, (path, value) => { n++; if (value !== (isSensitive(m.i, path) ? sensitive.mask : sequel.mask)) unmasked++; });
    if (n) { maskedMessages++; maskedFields += n; }
  }
  check(unmasked === 0, 'sequel_text_masked');
  check(maskedMessages === sequel.messages_masked && maskedFields === sequel.fields_masked, 'sequel_mask_counts');
  const sensitiveMessages = new Set();
  let sensitiveFields = 0;
  eachSensitive(data, sensitive, (message, path, value) => {
    check(value === sensitive.mask, 'sensitive_text_masked');
    sensitiveMessages.add(message.i);
    sensitiveFields++;
  });
  check(sensitiveMessages.size === sensitive.messages_masked && sensitiveFields === sensitive.fields_masked, 'sensitive_mask_counts');
  check(digest(data.msgs.map(({ i, d }) => [i, d])) === review.validation.ids_dates_sha256, 'ids_dates_preserved');
  check(digest(data.meta) === review.validation.metadata_sha256, 'metadata_preserved');

  let baselineChecked = false;
  if (args.length) {
    check(/^[\w./-]+$/.test(args[1]) && !args[1].startsWith('-'), 'baseline_revision_format');
    let raw;
    try {
      raw = execFileSync('git', ['show', `${args[1]}:data.js`], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error('baseline_revision_unavailable');
    }
    const before = parseData(raw);
    check(preservedDigest(before, sequel, sensitive) === preservedDigest(data, sequel, sensitive), 'baseline_unrelated_data_preserved');
    const original = before.msgs.find(message => message.i === TARGET_ID)?.x;
    check(typeof original === 'string', 'baseline_shipping_exists');
    const shippingChanged = original !== EXPECTED_TEXT;
    if (shippingChanged) {
      const fragments = privateFragments(original);
      check(!strings.some(({ value }) => fragments.some(fragment => value.includes(fragment))), 'confirmed_private_fragments_absent');
    }
    const oldStrings = collectStrings(before);
    check(oldStrings.length === strings.length, 'baseline_string_count');
    const changed = oldStrings.filter((entry, index) => entry.path !== strings[index].path || entry.value !== strings[index].value);
    const indexOf = new Map(data.msgs.map((m, index) => [m.i, index]));
    const allowed = new Set([`$.msgs.${indexOf.get(TARGET_ID)}.x`]);
    data.msgs.forEach((m, index) => { if (inRanges(sequel.ranges, m.i)) eachMaskable(m, path => allowed.add(`$.msgs.${index}.${path}`)); });
    eachSensitive(data, sensitive, (m, path) => allowed.add(`$.msgs.${indexOf.get(m.i)}.${path}`));
    check(changed.every(entry => allowed.has(entry.path)), 'baseline_exact_change_scope');
    if (shippingChanged) {
      const nameMatch = /^(\p{Script=Han}{2,4})(\s+\*{3}\s+)(湖北省武汉市)(.+)$/u.exec(original);
      check(nameMatch, 'baseline_shipping_format');
      check(`[姓名已隐藏]${nameMatch[2]}${nameMatch[3]}[详细地址已隐藏]` === target.x, 'baseline_only_private_spans_changed');
    }
    // Long reviewed originals must not survive in a quote, forward or another public data field.
    const originals = new Set();
    eachSensitive(before, sensitive, (m, path, value) => {
      if ((TEXT_KINDS.has(m.k) || (path !== 'x' && path !== 'cl.desc')) && value.length >= 8 && !/^\*+$/.test(value)) originals.add(value);
    });
    check(!strings.some(({ value }) => [...originals].some(text => value.includes(text))), 'sensitive_originals_absent');
    baselineChecked = true;
  }

  console.log(JSON.stringify({
    ok: true,
    messages: data.msgs.length,
    strings_checked: strings.length,
    nested_strings_checked: nestedStrings.length,
    strings_changed: review.strings_changed,
    sequel_messages_masked: maskedMessages,
    sequel_fields_masked: maskedFields,
    sensitive_messages_masked: sensitiveMessages.size,
    sensitive_fields_masked: sensitiveFields,
    baseline_checked: baselineChecked,
    preserved: ['message_ids', 'message_dates', 'metadata', 'structure', 'all_other_values'],
  }, null, 2));
} catch (error) {
  // Fixed check codes keep assertion diagnostics from echoing private chat content.
  const code = /^[a-z_]+$/.test(error?.message) ? error.message : 'input_or_validation_error';
  console.error(`Privacy check failed: ${code}`);
  process.exitCode = 1;
}
