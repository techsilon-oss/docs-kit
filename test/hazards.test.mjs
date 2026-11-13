// One test (or more) per hazard in DESIGN §7. Each reproduces the hazard on
// the fixture repo and shows the guard stops it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../scripts/lib/check.mjs';
import { loadConfig } from '../scripts/lib/config.mjs';
import { move, planMoves, MoveError } from '../scripts/lib/move.mjs';
import { TODAY, cleanup, exists, git, makeFixture, read } from './helpers/fixture.mjs';

const withFixture = (opts, fn) => async () => {
  const root = makeFixture(opts);
  try { await fn(root, loadConfig(root)); } finally { cleanup(root); }
};

test('fixture passes the layout check as built', withFixture({}, (root, cfg) => {
  const r = check(root, cfg, { today: TODAY });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.ok);
}));

test('H1: a canonical doc inside a snapshots/<topic>/ folder fails the check', withFixture({
  extra: { 'docs/platform/snapshots/architecture/ARCHITECTURE.md': '# canonical doc in the wrong place\n' },
}, (root, cfg) => {
  const r = check(root, cfg, { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('snapshots/architecture/ARCHITECTURE.md') && e.includes('not a dated snapshot')), r.errors.join('\n'));
}));

test('H1: a snapshot directly in snapshots/ (no topic folder) fails the check', withFixture({
  extra: { 'docs/platform/snapshots/ARCHITECTURE_2026-10-21.md': '# no topic\n' },
}, (root, cfg) => {
  const r = check(root, cfg, { today: TODAY });
  assert.ok(r.errors.some((e) => e.includes('snapshots go in')), r.errors.join('\n'));
}));

test('H2: the mover refuses a protected path, a path inside it and a folder holding it', withFixture({}, (root, cfg) => {
  for (const [from, to] of [
    ['docs/support', 'docs/help'],
    ['docs/support/README.md', 'docs/notes/SUPPORT.md'],
    ['docs', 'documentation'],
  ]) {
    assert.throws(() => move(root, [[from, to]], { cfg }), (e) => e instanceof MoveError && /protected \(path is a key in a production database\)/.test(e.message));
  }
  assert.ok(exists(root, 'docs/support/README.md'));
  assert.equal(git(root, 'status', '--porcelain'), '');
}));

test('H3: an immutable file that names the moved path is left byte for byte', withFixture({}, (root, cfg) => {
  const before = read(root, 'db/migrations/001_seed.sql');
  const r = move(root, [['docs/legal/TERMS.md', 'docs/legal/TERMS-OF-USE.md']], { cfg });
  assert.equal(read(root, 'db/migrations/001_seed.sql'), before);
  assert.deepEqual(r.immutableHits, ['db/migrations/001_seed.sql']);
  assert.ok(!r.rewritten.includes('db/migrations/001_seed.sql'));
  // The mover also refuses to move an immutable file.
  assert.throws(() => move(root, [['db/migrations/001_seed.sql', 'db/001_seed.sql']], { cfg }), /immutable/);
}));

test('H11: the proposal that records a move is left as written once it is immutable', withFixture({}, (root, cfg) => {
  const note = 'docs/notes/2026-01-01-reorganisation.md';
  const table = '| Old | New |\n|---|---|\n| `docs/legal/TERMS.md` | `docs/legal/TERMS-OF-USE.md` |\n';
  writeFileSync(join(root, note), `# Proposal\n\n${table}`);
  git(root, 'add', note);
  git(root, 'commit', '-q', '-m', 'proposal');
  const pair = [['docs/legal/TERMS.md', 'docs/legal/TERMS-OF-USE.md']];
  // The hazard: without the guard, the dry run rewrites the record's "old" column.
  const unguarded = move(root, pair, { cfg, dryRun: true });
  assert.ok(unguarded.rewritten.includes(note), 'the hazard reproduces');
  // The guard: the proposal note goes in immutablePrefixes when it is written (L10).
  const guarded = { ...cfg, immutablePrefixes: [...cfg.immutablePrefixes, note] };
  const before = read(root, note);
  const r = move(root, pair, { cfg: guarded });
  assert.equal(read(root, note), before, 'the record still shows the old path');
  assert.ok(r.immutableHits.includes(note));
}));

test('H4: gitignore rules follow the move, so confidential files stay ignored', withFixture({}, (root, cfg) => {
  const r = move(root, [['docs/legal', 'docs/money/legal']], { cfg: { ...cfg, subjects: [...cfg.subjects, 'money'] } });
  const gi = read(root, '.gitignore');
  assert.match(gi, /^docs\/money\/legal\/contracts\/\*\.pdf$/m);
  assert.match(gi, /^\/docs\/money\/legal\/contracts\/signed\/$/m);
  assert.ok(exists(root, 'docs/money/legal/contracts/client-a.pdf'), 'ignored files move with their folder');
  assert.ok(exists(root, 'docs/money/legal/contracts/signed/client-b.md'));
  assert.equal(r.ignoredMoves.length, 2);
  assert.deepEqual(r.newlyVisible, []);
  assert.doesNotMatch(git(root, 'status', '--porcelain', '--untracked-files=all'), /client-/);
}));

test('H4: a rule the mover cannot rewrite is reported, and the move exits as a hazard', withFixture({}, (root, cfg) => {
  // A rule outside any tracked file: the mover cannot follow it.
  appendFileSync(join(root, '.git/info/exclude'), 'docs/notes/private/\n');
  writeFileSync(join(root, 'docs/notes/private-note.md'), 'x');
  git(root, 'add', 'docs/notes/private-note.md');
  git(root, 'commit', '-q', '-m', 'note');
  mkdirSync(join(root, 'docs/notes/private'), { recursive: true });
  writeFileSync(join(root, 'docs/notes/private/secret.md'), 'confidential');
  const r = move(root, [['docs/notes', 'docs/pins']], { cfg });
  assert.deepEqual(r.newlyVisible, ['docs/pins/private/secret.md']);
  assert.match(git(root, 'status', '--porcelain', '--untracked-files=all'), /docs\/pins\/private\/secret\.md/);
}));

test('H5: a folder moves file by file, never as one folder rename', withFixture({}, (root, cfg) => {
  const plan = planMoves(root, [['docs/legal', 'docs/money/legal']], cfg);
  assert.ok(plan.filePairs.length > 1);
  for (const p of plan.filePairs) assert.ok(statSync(join(root, p.from)).isFile(), `${p.from} is a file`);
}));

test('H5: moving into a folder that already exists merges instead of nesting', withFixture({
  extra: { 'docs/operations/legal/NOTES.md': '# already here\n' },
}, (root, cfg) => {
  // A whole-folder `git mv docs/legal docs/operations/legal` would nest it as docs/operations/legal/legal.
  move(root, [['docs/legal', 'docs/operations/legal']], { cfg });
  assert.ok(exists(root, 'docs/operations/legal/TERMS.md'));
  assert.ok(exists(root, 'docs/operations/legal/NOTES.md'));
  assert.ok(!exists(root, 'docs/operations/legal/legal'));
  assert.ok(!exists(root, 'docs/legal'), 'the emptied source folder is removed');
}));

test('H6: snapshot freshness comes from the file name, not contents or modification time', withFixture({
  extra: {
    // Stale by name, but the contents and mtime say "today".
    'docs/platform/snapshots/architecture/ARCHITECTURE_2026-10-20.md': '# Architecture snapshot\n\nGenerated: 2026-11-01\n',
  },
}, (root, cfg) => {
  const stale = 'docs/platform/snapshots/architecture/ARCHITECTURE_2026-10-20.md';
  const now = TODAY.getTime() / 1000;
  utimesSync(join(root, stale), now, now);
  const r = check(root, { ...cfg, snapshotStaleDays: 5 }, { today: TODAY });
  assert.ok(r.warnings.some((w) => w.includes('snapshots/architecture/') && w.includes('12 days old')), r.warnings.join('\n'));

  // Fresh by name (12 days, limit 30), with a 1970 modification time: no warning.
  const r2 = check(root, { ...cfg, snapshotStaleDays: 30 }, { today: TODAY });
  utimesSync(join(root, stale), 0, 0);
  assert.ok(!r2.warnings.some((w) => w.includes('snapshots')), r2.warnings.join('\n'));
  const r3 = check(root, { ...cfg, snapshotStaleDays: 30 }, { today: TODAY });
  assert.ok(!r3.warnings.some((w) => w.includes('snapshots')), r3.warnings.join('\n'));
}));

test('H7: a path built in pieces is listed for review and not rewritten', withFixture({}, (root, cfg) => {
  const r = move(root, [['docs/legal', 'docs/money/legal']], { cfg: { ...cfg, subjects: [...cfg.subjects, 'money'] } });
  const hit = r.piecedHits.find((h) => h.file === 'scripts/build-legal.mjs');
  assert.ok(hit, JSON.stringify(r.piecedHits));
  assert.equal(hit.line, 4);
  assert.ok(hit.paths.includes('docs/legal'));
  const src = read(root, 'scripts/build-legal.mjs');
  assert.match(src, /join\(root, "docs", "legal"\)/, 'pieces are not rewritten');
  assert.match(src, /'docs\/money\/legal\/TERMS\.md'/, 'the whole path is rewritten');
}));

test('H8: a path followed by a full stop or other punctuation is rewritten', withFixture({}, (root, cfg) => {
  move(root, [['docs/legal/TERMS.md', 'docs/legal/TERMS-OF-USE.md']], { cfg });
  assert.match(read(root, 'docs/README.md'), /the terms are in docs\/legal\/TERMS-OF-USE\.md\.$/m);
  assert.match(read(root, 'CLAUDE.md'), /`docs\/legal\/TERMS-OF-USE\.md`\./);
}));

test('H9: every changed file is reported, including files outside docs/, and git status ends the report', withFixture({}, (root, cfg) => {
  const r = move(root, [['docs/legal/TERMS.md', 'docs/legal/TERMS-OF-USE.md']], { cfg });
  for (const f of ['.github/workflows/docs.yml', 'scripts/build-legal.mjs', 'scripts/source-doc-map.json', 'CLAUDE.md', 'docs/README.md']) {
    assert.ok(r.rewritten.includes(f), `${f} reported`);
    assert.match(r.status, new RegExp(`^ ?M  ?${f.replace(/[./]/g, '\\$&')}$`, 'm'), `${f} in git status`);
  }
  assert.match(read(root, '.github/workflows/docs.yml'), /docs\/legal\/TERMS-OF-USE\.md/);
  assert.deepEqual(JSON.parse(read(root, 'scripts/source-doc-map.json')).mappings[0].docs[0], 'docs/legal/TERMS-OF-USE.md');
  // After the move the layout check (and so the doc map) still holds.
  assert.deepEqual(check(root, cfg, { today: TODAY }).errors, []);
}));

test('H10: a doc map whose path selects nothing fails instead of passing', withFixture({}, (root, cfg) => {
  const r = check(root, { ...cfg, docMaps: [{ file: 'scripts/source-doc-map.json', path: 'mapping[].docs[]' }] }, { today: TODAY });
  assert.ok(r.errors.some((e) => e.includes('selects no doc paths')), r.errors.join('\n'));
}));

test('H10: an empty or missing docs root fails instead of passing', withFixture({}, (root, cfg) => {
  assert.ok(check(root, { ...cfg, docsRoot: 'documentation' }, { today: TODAY }).errors.some((e) => e.includes('does not exist')));
  mkdirSync(join(root, 'empty-docs'));
  assert.ok(check(root, { ...cfg, docsRoot: 'empty-docs' }, { today: TODAY }).errors.some((e) => e.includes('no files found')));
}));

test('H10: a configured snapshot topic with no snapshots fails', withFixture({
  omit: ['docs/platform/snapshots/architecture/ARCHITECTURE_2026-10-20.md'],
}, (root, cfg) => {
  const r = check(root, cfg, { today: TODAY });
  assert.ok(r.errors.some((e) => e.includes('snapshot topic "architecture" is configured but has no dated snapshots')), r.errors.join('\n'));
}));

test('H10: a doc map naming a doc that moved without the map fails', withFixture({}, (root, cfg) => {
  git(root, 'mv', 'docs/legal/TERMS.md', 'docs/legal/TERMS-OF-USE.md');
  const r = check(root, cfg, { today: TODAY });
  assert.ok(r.errors.some((e) => e.includes('names "docs/legal/TERMS.md", which does not exist')), r.errors.join('\n'));
}));

