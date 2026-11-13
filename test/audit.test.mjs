// docs-kit audit (DESIGN §6.3 step 1): a read-only inventory that finds each hazard it can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../scripts/lib/audit.mjs';
import { DEFAULTS } from '../scripts/lib/config.mjs';
import { cleanup, git, makeFixture } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));

// An invented app before its reorganisation: loose root docs, a generator inside docs/,
// ignored outputs, a migration that cites a doc, agent instructions that name docs.
const MESSY = {
  'README.md': 'See docs/PRD.md and docs/support/. Everything else is under docs/.\n',
  'CLAUDE.md': 'Start at docs/ONBOARDING.md. History is in docs/status/.\n',
  '.gitignore': 'docs/exports/**\n!docs/exports/\n!docs/exports/README.md\n!docs/exports/_scripts/\n!docs/exports/_scripts/**\n',
  'db/migrations/001.sql': "-- spec: docs/architecture/payments.md\n",
  'scripts/build-legal.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/legal/TERMS.md', 'x');\n",
  'scripts/lint.mjs': "// reads docs/PRD.md, writes nothing\n",
  'test/docs.test.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/PRD.md', 'fixture');\n",
  'docs/README.md': '# Docs\n',
  'docs/PRD.md': '# PRD\n',
  'docs/ONBOARDING.md': '# Onboarding\n',
  'docs/architecture/payments.md': '# Payments\n',
  'docs/legal/TERMS.md': '# Terms\n',
  'docs/support/README.md': '# Support\n',
  'docs/support/incident-runbook.md': '# Incidents\n',
  'docs/status/2026-07-01.md': '# Status\n',
  'docs/exports/README.md': '# Exports\n',
  'docs/exports/_scripts/generate.py': "open('docs/exports/status/x.md', 'w')\n",
};

const withRepo = (fn) => async () => {
  const root = makeFixture({ files: MESSY, ignored: {} });
  writeFileSync(join(root, 'docs/exports/status-2026-07-13.md'), 'generated');
  try { await fn(root); } finally { cleanup(root); }
};

const CFG = { ...DEFAULTS, immutablePrefixes: ['db/migrations/'], configured: false };

test('audit: the docs root, its folders and their maps', withRepo((root) => {
  const a = audit(root, CFG);
  assert.deepEqual(a.root.allowed, ['README.md']);
  assert.deepEqual(a.root.notAllowed, ['ONBOARDING.md', 'PRD.md']);
  const f = Object.fromEntries(a.root.folders.map((x) => [x.name, x]));
  assert.equal(f.support.hasMap, true);
  assert.equal(f.legal.hasMap, false);
  assert.equal(f.status.historical, true, 'a folder named status may be history (L4)');
  assert.equal(f.legal.subject, false, 'no docs-kit.json yet, so no subjects');
}));

test('audit: exports trees, code inside docs, generators outside, ignored outputs, gitignore rules (H4)', withRepo((root) => {
  const a = audit(root, CFG);
  assert.deepEqual(a.exportsTrees, ['docs/exports/']);
  assert.deepEqual(a.codeInDocs, ['docs/exports/_scripts/generate.py']);
  assert.deepEqual(a.generators, ['scripts/build-legal.mjs'], 'writes and names a doc; a reader or a test is not a generator');
  assert.deepEqual(a.ignoredUnderDocs, [{ dir: 'docs/exports', files: 1 }]);
  assert.equal(a.gitignoreRules.length, 5);
  assert.deepEqual(a.gitignoreRules[0], { file: '.gitignore', line: 1, rule: 'docs/exports/**' });
}));

test('audit: docs that immutable files name (L3), agent instructions (L5), how-to look-alikes (L6), and every reference', withRepo((root) => {
  const a = audit(root, CFG);
  assert.deepEqual(Object.keys(a.namedByImmutable), ['docs/architecture/payments.md']);
  assert.deepEqual(a.agentFiles, ['CLAUDE.md']);
  assert.deepEqual(a.howtoCandidates, ['docs/support/incident-runbook.md']);
  const refs = Object.fromEntries(a.references.map((r) => [r.doc, r.files]));
  assert.deepEqual(refs['docs/PRD.md'], ['README.md', 'scripts/lint.mjs', 'test/docs.test.mjs']);
  assert.deepEqual(refs['docs/status/'], ['CLAUDE.md'], 'a folder named by path is a reference too');
  assert.ok(!('docs/' in refs), 'the docs root itself is not a reference');
}));

test('audit changes nothing, and --json is the same report', withRepo((root) => {
  const before = git(root, 'status', '--porcelain', '--ignored');
  const r = spawnSync(process.execPath, [CLI, 'audit', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.root.notAllowed, ['ONBOARDING.md', 'PRD.md']);
  const text = spawnSync(process.execPath, [CLI, 'audit'], { cwd: root, encoding: 'utf8' });
  assert.match(text.stdout, /Read-only: nothing was changed/);
  assert.match(text.stdout, /No docs-kit\.json: the audit used the defaults/);
  assert.equal(git(root, 'status', '--porcelain', '--ignored'), before);
}));
