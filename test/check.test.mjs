import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { check, parseDate, selectPath } from '../scripts/lib/check.mjs';
import { loadConfig } from '../scripts/lib/config.mjs';
import { TODAY, cleanup, makeFixture } from './helpers/fixture.mjs';

const withFixture = (opts, fn) => async () => {
  const root = makeFixture(opts);
  try { await fn(root, loadConfig(root)); } finally { cleanup(root); }
};
const errorsOf = (root, cfg) => check(root, cfg, { today: TODAY }).errors;
const warningsOf = (root, cfg) => check(root, cfg, { today: TODAY }).warnings;
const has = (list, s) => list.some((e) => e.includes(s));

test('rule 1: a stray file or folder at the docs root fails', withFixture({
  extra: { 'docs/SESSION-NOTES.md': 'x', 'docs/random/README.md': 'x' },
}, (root, cfg) => {
  const e = errorsOf(root, cfg);
  assert.ok(has(e, 'docs/SESSION-NOTES.md: not allowed'), e.join('\n'));
  assert.ok(has(e, 'docs/random/: folder is not a configured subject'), e.join('\n'));
}));

test('rule 1: the front door is required', withFixture({ omit: ['docs/README.md'] }, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'docs/README.md: missing'));
}));

test('rule 2: every subject folder has a README.md', withFixture({ omit: ['docs/legal/README.md'] }, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'docs/legal/README.md: missing'));
}));

test('a configured subject with no folder is a warning', withFixture({}, (root, cfg) => {
  assert.ok(has(warningsOf(root, { ...cfg, subjects: [...cfg.subjects, 'money'] }), 'docs/money/: configured subject has no files yet'));
}));

test('rule 4: no exports/ tree (archive excepted)', withFixture({
  extra: { 'docs/legal/exports/LEGAL_2026-01-01.md': 'x', 'docs/archive/legal/exports/OLD.md': 'x' },
}, (root, cfg) => {
  const e = errorsOf(root, cfg);
  assert.ok(has(e, 'docs/legal/exports/: an exports/ folder is not allowed'), e.join('\n'));
  assert.ok(!has(e, 'archive/legal/exports'), e.join('\n'));
}));

test('rule 5: print copies beside their source, newest only', withFixture({
  extra: {
    'docs/legal/TERMS_v1.0_2026-09-01.pdf': 'x',
    'docs/legal/TERMS_v1.1_2026-10-01.pdf': 'x',
    'docs/legal/ORPHAN_v1.0_2026-10-01.docx': 'x',
  },
}, (root, cfg) => {
  const w = warningsOf(root, cfg);
  assert.ok(has(w, 'docs/legal/TERMS: 2 .pdf print copies'), w.join('\n'));
  assert.ok(has(w, 'ORPHAN_v1.0_2026-10-01.docx: print copy has no source'), w.join('\n'));
}));

test('rule 6: archive mirrors the live tree', withFixture({
  extra: { 'docs/archive/LOOSE.md': 'x', 'docs/archive/misc/OLD.md': 'x' },
}, (root, cfg) => {
  const w = warningsOf(root, cfg);
  assert.ok(has(w, 'docs/archive/LOOSE.md: archive files go under archive/<subject>/'), w.join('\n'));
  assert.ok(has(w, 'docs/archive/misc/: not a configured subject'), w.join('\n'));
}));

test('how-tos: stale, missing last_checked, and naming are warnings', withFixture({
  extra: {
    'docs/operations/howto/HOWTO-restore.md': '---\nlast_checked: 2026-01-01\n---\n',
    'docs/operations/howto/HOWTO-rotate.md': '# no front matter\n',
    'docs/operations/howto/restart.md': 'x',
  },
}, (root, cfg) => {
  // Roles off here: role rules have their own tests in roles.test.mjs.
  const r = check(root, { ...cfg, roles: [] }, { today: TODAY });
  assert.ok(r.ok, 'how-to findings are warnings only');
  assert.ok(has(r.warnings, 'HOWTO-restore.md: last_checked 2026-01-01 is 304 days old (limit 90)'), r.warnings.join('\n'));
  assert.ok(has(r.warnings, 'HOWTO-rotate.md: no valid last_checked'), r.warnings.join('\n'));
  assert.ok(has(r.warnings, 'restart.md: how-tos are named HOWTO-<task>.md'), r.warnings.join('\n'));
  assert.ok(!has(r.warnings, 'HOWTO-deploy.md: last_checked'), r.warnings.join('\n'));
  assert.ok(has(r.warnings, 'HOWTO-deploy.md: names roles, but docs-kit.json has no "roles" list'), r.warnings.join('\n'));
}));

test('ignored files under docs/ are not part of the layout', withFixture({}, (root, cfg) => {
  // The fixture has ignored contracts under docs/legal/contracts/; they are not flagged.
  assert.deepEqual(errorsOf(root, cfg), []);
}));

test('a doc map file that is missing fails', withFixture({}, (root, cfg) => {
  rmSync(join(root, 'scripts/source-doc-map.json'));
  assert.ok(has(errorsOf(root, cfg), 'scripts/source-doc-map.json: doc map file not found'));
}));

test('selectPath walks keys and arrays', () => {
  const data = { mappings: [{ docs: ['a', 'b'] }, { docs: ['c'] }, { other: 1 }], list: [['x'], ['y']] };
  assert.deepEqual(selectPath(data, 'mappings[].docs[]'), ['a', 'b', 'c']);
  assert.deepEqual(selectPath(data, 'list[][]'), ['x', 'y']);
  assert.deepEqual(selectPath([{ d: 'z' }], '[].d'), ['z']);
  assert.deepEqual(selectPath(data, 'missing[]'), []);
});

test('parseDate rejects dates that do not exist', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-2-3'), null);
  assert.equal(parseDate('2026-02-28'), Date.UTC(2026, 1, 28));
});
