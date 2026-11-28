#!/usr/bin/env node
// Replay date-wide and business redactions without retaining any original sensitive content.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskSensitive } from './sensitive-mask.mjs';
import { maskNotesSource, maskPinnedSource } from './public-notes-mask.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const filename = resolve(root, 'data.js');
const raw = readFileSync(filename, 'utf8');
const match = /^window\.__CHAT__=(\{[\s\S]*\});\s*$/.exec(raw);
if (!match) throw new Error('data_assignment_format');
const data = JSON.parse(match[1]);
const review = JSON.parse(readFileSync(resolve(root, 'privacy-report.json'), 'utf8')).sensitive_review;
if (review?.version !== 1 || review.mask !== '*******' || !Array.isArray(review.ranges)) throw new Error('sensitive_report_format');
const counts = maskSensitive(data, review);
if (counts.messages_masked !== review.messages_masked || counts.fields_masked !== review.fields_masked) {
  throw new Error('sensitive_scope_counts');
}
const out = 'window.__CHAT__=' + JSON.stringify(data).replace(/[<>\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + ';\n';
const notesFile = resolve(root, 'notes.js');
const appFile = resolve(root, 'app.js');
const notes = maskNotesSource(readFileSync(notesFile, 'utf8'), review);
const app = maskPinnedSource(readFileSync(appFile, 'utf8'), review);
writeFileSync(filename, out);
writeFileSync(notesFile, notes);
writeFileSync(appFile, app);
console.log(JSON.stringify({ ok: true, ...counts, annotations_masked: (review.annotation_ids || []).length }));
