#!/usr/bin/env node
// Mask the 魔女2 work conversations listed in privacy-report.json (sequel_review.ranges) in data.js.
// Idempotent: running it again changes nothing. Verify afterwards with: node tools/check-privacy.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inRanges, maskMessage } from './sequel-mask.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'data.js');

const raw = readFileSync(DATA, 'utf8');
const match = /^window\.__CHAT__=(\{[\s\S]*\});\s*$/.exec(raw);
if (!match) throw new Error('data.js: unexpected format');
const data = JSON.parse(match[1]);
const { mask, ranges } = JSON.parse(readFileSync(resolve(ROOT, 'privacy-report.json'), 'utf8')).sequel_review;

let messages = 0, fields = 0;
for (const m of data.msgs) {
  if (!inRanges(ranges, m.i)) continue;
  const changed = maskMessage(m, mask);
  if (changed.length) { messages++; fields += changed.length; }
}

// Same serialisation as the original export: plain JSON with < and > escaped.
const out = 'window.__CHAT__=' + JSON.stringify(data).replace(/[<>\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + ';\n';
writeFileSync(DATA + '.tmp', out);
renameSync(DATA + '.tmp', DATA);
console.log(JSON.stringify({ ok: true, ranges: ranges.length, messages_masked: messages, fields_masked: fields }));
