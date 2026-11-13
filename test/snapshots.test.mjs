// Snapshot routing (DESIGN §6.6): one place per topic, dated names, older ones archived,
// and topics git ignores are local-only, not missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/lib/check.mjs';
import { loadConfig } from '../scripts/lib/config.mjs';
import { SnapshotError, archiveOlder, snapshotName, snapshotPath, topicDir } from '../scripts/lib/snapshots.mjs';
import { TODAY, cleanup, exists, git, makeFixture } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const withFixture = (fn) => async () => {
  const root = makeFixture();
  try { await fn(root, loadConfig(root)); } finally { cleanup(root); }
};

const SNAP = 'docs/platform/snapshots/architecture';
const put = (root, rel, text = 'x\n') => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };

test('snapshot path: the configured topic folder and a dated name; an unknown topic is an error', withFixture((root, cfg) => {
  assert.equal(topicDir(cfg, 'architecture'), SNAP);
  assert.equal(snapshotName('launch-readiness', '2026-11-13'), 'LAUNCH-READINESS_2026-11-13.md');
  assert.equal(snapshotPath(cfg, 'architecture', { date: '2026-11-13', ext: 'pdf' }), `${SNAP}/ARCHITECTURE_2026-11-13.pdf`);
  assert.throws(() => topicDir(cfg, 'status'), /unknown snapshot topic "status"; add it to "snapshotTopics"/);
  assert.throws(() => topicDir(cfg, '../x'), SnapshotError);
  const r = run(root, 'snapshot', 'path', 'architecture', '--date', '2026-11-13');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), `${SNAP}/ARCHITECTURE_2026-11-13.md`);
  assert.equal(run(root, 'snapshot', 'path', 'nope').status, 2);
  assert.equal(run(root, 'snapshot', 'path', 'architecture', '--date', '2026-13-01').status, 2);
}));

test('snapshot archive: keeps the newest date, moves older ones to archive/<subject>/snapshots/<topic>/', withFixture((root, cfg) => {
  put(root, `${SNAP}/ARCHITECTURE_2026-09-01.md`);
  put(root, `${SNAP}/ARCHITECTURE_2026-11-13.md`);
  put(root, `${SNAP}/ARCHITECTURE_2026-11-13.pdf`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'snapshots');
  const before = run(root, 'snapshot', 'archive', 'architecture', '--dry-run');
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /DRY RUN/);
  const r = run(root, 'snapshot', 'archive', 'architecture');
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['ARCHITECTURE_2026-11-13.md', 'ARCHITECTURE_2026-11-13.pdf']) assert.ok(exists(root, `${SNAP}/${f}`), `keeps ${f}`);
  assert.ok(!exists(root, `${SNAP}/ARCHITECTURE_2026-10-20.md`), 'the fixture\'s older snapshot left the topic folder');
  assert.ok(exists(root, 'docs/archive/platform/snapshots/architecture/ARCHITECTURE_2026-10-20.md'), 'and is in the archive');
  assert.ok(exists(root, 'docs/archive/platform/snapshots/architecture/ARCHITECTURE_2026-09-01.md'));
  assert.match(git(root, 'status', '--porcelain'), /^R {2}docs\/platform\/snapshots\/architecture\/ARCHITECTURE_2026-09-01\.md -> docs\/archive\/platform/m, 'a tracked snapshot moves with git mv');
  assert.ok(check(root, cfg, { today: new Date('2026-11-14') }).ok, 'the layout still holds');
}));

test('H1: the archive helper refuses any folder that is not a configured snapshots/<topic>/ folder', withFixture((root, cfg) => {
  for (const dir of ['docs/platform', 'docs/legal', 'docs/platform/snapshots', 'docs/archive/platform/snapshots/architecture', 'docs/legal/snapshots/architecture']) {
    assert.throws(() => archiveOlder(root, cfg, dir), /refusing to archive .*hazard H1/, dir);
  }
  const canonical = 'docs/platform/ARCHITECTURE.md';
  assert.ok(exists(root, canonical));
  archiveOlder(root, cfg, SNAP);
  assert.ok(exists(root, canonical), 'a canonical doc is never archived');
}));

test('snapshot archive leaves a file that is not a dated snapshot where it is', withFixture((root, cfg) => {
  put(root, `${SNAP}/notes.txt`);
  put(root, `${SNAP}/ARCHITECTURE_2026-01-01.md`);
  const r = archiveOlder(root, cfg, SNAP);
  assert.deepEqual(r.skipped, [`${SNAP}/notes.txt`]);
  assert.ok(exists(root, `${SNAP}/notes.txt`));
  assert.ok(exists(root, 'docs/archive/platform/snapshots/architecture/ARCHITECTURE_2026-01-01.md'));
}));

test('H4: an ignored snapshot that is visible after archiving is reported, and the command exits 1', withFixture((root, cfg) => {
  // The topic folder is ignored; the archive folder is not.
  appendFileSync(join(root, '.gitignore'), `\n${SNAP}/*.pdf\n`);
  git(root, 'add', '.gitignore');
  git(root, 'commit', '-q', '-m', 'ignore pdfs');
  put(root, `${SNAP}/ARCHITECTURE_2026-01-01.pdf`, 'confidential');
  put(root, `${SNAP}/ARCHITECTURE_2026-11-13.pdf`, 'confidential');
  const r = run(root, 'snapshot', 'archive', 'architecture');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /DANGER: 1 file\(s\) that were ignored are no longer ignored in the archive/);
  assert.match(r.stdout, /docs\/archive\/platform\/snapshots\/architecture\/ARCHITECTURE_2026-01-01\.pdf/);
}));

test('a snapshot topic whose folder git ignores is local-only: the check does not fail it as missing (H10 still holds otherwise)', withFixture((root, cfg) => {
  const cfg2 = { ...cfg, snapshotTopics: { ...cfg.snapshotTopics, status: 'operations', briefing: 'operations' } };
  appendFileSync(join(root, '.gitignore'), '\ndocs/operations/snapshots/status/\n');
  const r = check(root, cfg2, { today: TODAY });
  assert.ok(!r.errors.some((e) => e.includes('"status"')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('snapshot topic "briefing" is configured but has no dated snapshots')), 'a topic that is not ignored still fails when empty');
  assert.deepEqual(r.stats.localOnlyTopics, ['status']);
}));
