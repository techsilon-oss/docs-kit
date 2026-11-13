// docs-kit init (DESIGN §6.7): one-step setup, never overwrites, same result every run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseConfig } from '../scripts/lib/config.mjs';
import { check } from '../scripts/lib/check.mjs';
import { detectConfig, planInit, renderConfig } from '../scripts/lib/init.mjs';
import { cleanup, exists, git, makeFixture, read } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const VERSION = run(process.cwd(), '--version').stdout.trim();

// An invented app whose docs/ does not follow the layout yet, and which uses govkit.
const MESSY = {
  'package.json': '{\n    "name": "example-app",\n    "scripts": {\n        "test": "vitest run"\n    },\n    "devDependencies": {\n        "typescript": "^5.0.0",\n        "vitest": "^3.0.0"\n    }\n}\n',
  'govkit.json': JSON.stringify({
    guardrails: {
      trackers: { description: 'CLAUDE.md + docs/HUB.md', expects: ['CLAUDE.md', 'docs/HUB.md', 'docs/ROADMAP.md'] },
      gate: { vendoredHere: 'scripts/gate.ts' },
      deep: { expects: ['docs/guides/x.md'] },
    },
    files: { 'scripts/sync-check.mjs': { version: '1.0.0', sha256: 'x' } },
  }, null, 2),
  'scripts/source-doc-map.json': JSON.stringify({ mappings: [{ source: 'src/', docs: ['docs/architecture/overview.md'] }] }),
  'scripts/gate.ts': '// vendored\n',
  'scripts/sync-check.mjs': "const HUB = 'docs/HUB.md';\n",
  'supabase/migrations/001_init.sql': "-- 'docs/guides/setup.md'\n",
  'docs/README.md': '# example-app docs\n',
  'docs/HUB.md': '# Hub\n',
  'docs/ROADMAP.md': '# Roadmap\n',
  'docs/ONBOARDING.md': '# Onboarding\n',
  'docs/architecture/overview.md': '# Overview\n',
  'docs/guides/setup.md': '# Setup\n',
  'docs/archive/old.md': '# Old\n',
  'docs/platform/snapshots/architecture/ARCHITECTURE_2026-10-01.md': '# Snapshot\n',
};

const withRepo = (files, fn) => async () => {
  const root = makeFixture({ files, ignored: {} });
  try { await fn(root); } finally { cleanup(root); }
};

const status = (root) => git(root, 'status', '--porcelain');

test('detect: subjects, bootstrap docs, doc maps, immutable files and snapshot topics come from the repo', withRepo(MESSY, (root) => {
  const { config, notes } = detectConfig(root);
  assert.deepEqual(config.subjects, ['architecture', 'guides', 'platform', 'archive'], 'today\'s folders, archive last');
  assert.deepEqual(config.rootAllowed, ['README.md', 'HUB.md', 'ROADMAP.md'], 'docs-root files the tool manifest names; not docs/guides/x.md');
  assert.deepEqual(config.docMaps, [{ file: 'scripts/source-doc-map.json', path: 'mappings[].docs[]' }]);
  assert.deepEqual(config.immutablePrefixes, ['supabase/migrations/', 'scripts/gate.ts', 'scripts/sync-check.mjs']);
  assert.deepEqual(config.snapshotTopics, { architecture: 'platform' });
  assert.deepEqual(config.protected, {});
  assert.deepEqual(config.roles, []);
  assert.ok(notes.some((n) => n.includes('docs/HUB.md stays at the docs root, because govkit.json names it')), notes.join('\n'));
}));

test('detect: a doc map that selects nothing is left out', withRepo({
  ...MESSY, 'scripts/source-doc-map.json': '{"mappings": []}',
}, (root) => {
  const { config, notes } = detectConfig(root);
  assert.deepEqual(config.docMaps, []);
  assert.ok(notes.some((n) => n.includes('selects no doc paths')), notes.join('\n'));
}));

test('the written docs-kit.json loads and holds what was detected', withRepo(MESSY, (root) => {
  const { config } = detectConfig(root);
  const loaded = parseConfig(renderConfig(config, VERSION));
  assert.deepEqual({ ...loaded }, { ...config });
}));

test('init on a messy repo: writes the config and package.json, the check fails, init still succeeds', withRepo(MESSY, (root) => {
  const r = run(root, 'init');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(loadConfig(root), 'docs-kit.json written');
  assert.match(r.stdout, /ERROR {3}docs\/ONBOARDING\.md: not allowed at the docs root/);
  assert.match(r.stdout, /docs-kit check: FAILED/);
  assert.match(r.stdout, /expected while docs\/ does not follow the layout yet/);
  assert.match(r.stdout, /Run npm install/);

  const pkg = read(root, 'package.json');
  assert.equal(JSON.parse(pkg).devDependencies['docs-kit'], `github:techsilon-oss/docs-kit#v${VERSION}`);
  assert.deepEqual(Object.keys(JSON.parse(pkg).devDependencies), ['docs-kit', 'typescript', 'vitest'], 'sorted keys stay sorted');
  assert.equal(JSON.parse(pkg).scripts['docs:check'], 'docs-kit check');
  assert.match(pkg, /^ {4}"name"/m, 'the file\'s 4-space indent is kept');
  assert.ok(pkg.endsWith('}\n'));
}));

// A docs folder that already follows the layout: the check passes.
const TIDY = {
  ...MESSY,
  'docs/architecture/README.md': '# Architecture\n',
  'docs/guides/README.md': '# Guides\n',
  'docs/platform/README.md': '# Platform\n',
  'docs/archive/README.md': '# Archive\n',
};
delete TIDY['docs/ONBOARDING.md'];

test('init twice: the second run changes nothing', withRepo(TIDY, (root) => {
  const first = run(root, 'init', '--test', 'tests/docs-layout.test.mjs');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /created {2}tests\/docs-layout\.test\.mjs/);
  const before = { cfg: read(root, 'docs-kit.json'), pkg: read(root, 'package.json'), t: read(root, 'tests/docs-layout.test.mjs'), st: status(root) };
  const again = run(root, 'init', '--test', 'tests/docs-layout.test.mjs');
  assert.equal(again.status, 0, again.stderr);
  assert.doesNotMatch(again.stdout, /created|updated/);
  assert.deepEqual({ cfg: read(root, 'docs-kit.json'), pkg: read(root, 'package.json'), t: read(root, 'tests/docs-layout.test.mjs'), st: status(root) }, before);
}));

test('init --test waits while the check fails: a failing test would block every commit', withRepo(MESSY, (root) => {
  const r = run(root, 'init', '--test', 'tests/docs-layout.test.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!exists(root, 'tests/docs-layout.test.mjs'), 'no failing test written');
  assert.ok(exists(root, 'docs-kit.json'), 'the rest of the setup is written');
  assert.match(r.stdout, /skip {5}tests\/docs-layout\.test\.mjs {2}\(not yet: the check fails/);
  assert.match(r.stdout, /Once the check passes, add it to your tests: docs-kit init --test tests\/docs-layout\.test\.mjs/);
}));

test('init never overwrites: an existing config, front door and test file are kept', withRepo({
  ...MESSY,
  'docs-kit.json': '{ "subjects": ["architecture"] } // mine\n',
  'tests/docs-layout.test.mjs': '// mine\n',
}, (root) => {
  const r = run(root, 'init', '--test', 'tests/docs-layout.test.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root, 'docs-kit.json'), '{ "subjects": ["architecture"] } // mine\n');
  assert.equal(read(root, 'docs/README.md'), '# example-app docs\n');
  assert.equal(read(root, 'tests/docs-layout.test.mjs'), '// mine\n');
  assert.match(r.stdout, /skip {5}docs-kit\.json {2}\(exists; init never overwrites it\)/);
}));

test('init --dry-run writes nothing', withRepo(MESSY, (root) => {
  const before = status(root);
  const r = run(root, 'init', '--dry-run', '--test', 'tests/docs-layout.test.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing written/);
  assert.match(r.stdout, /create {3}docs-kit\.json/);
  assert.equal(status(root), before);
  assert.ok(!exists(root, 'docs-kit.json'));
}));

test('init on a repo with no docs/: the front door is created and the check passes', withRepo({ 'src/app.js': 'x\n' }, (root) => {
  const r = run(root, 'init');
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(root, 'docs/README.md'), /^# Docs\n/);
  assert.match(r.stdout, /docs-kit package\.json|package\.json: none/);
  assert.match(r.stdout, /docs-kit check: OK/);
  assert.equal(run(root, 'check').status, 0);
}));

test('init --dry-run does not count the front door it would create as missing', withRepo({ 'src/app.js': 'x\n', 'docs/guide/README.md': '# Guide\n' }, (root) => {
  const r = run(root, 'init', '--dry-run');
  assert.doesNotMatch(r.stdout, /README\.md: missing \(the front door\)/);
  assert.match(r.stdout, /docs-kit check: OK/);
}));

test('the front door lists the subjects; check passes once each subject has a map', withRepo({ 'docs/guide/README.md': '# Guide\n', 'docs/archive/README.md': '# Archive\n', 'docs/archive/guide/x.md': 'x\n' }, (root) => {
  assert.equal(run(root, 'init').status, 0);
  assert.equal(read(root, 'docs/README.md'), '# Docs\n\nWhere to find things. Each subject folder has a README.md that maps it.\n\n- [guide](guide/README.md)\n');
  assert.ok(check(root, loadConfig(root)).ok);
}));

test('init --test: vitest and pytest files run the right copy from the repo root', withRepo(MESSY, (root) => {
  const plan = planInit(root, { version: VERSION, testFile: 'app/tests/docs.test.ts' });
  const t = plan.changes.find((c) => c.path === 'app/tests/docs.test.ts').content;
  assert.match(t, /from 'vitest'/);
  assert.match(t, /new URL\("\.\.\/\.\.\/", import\.meta\.url\)/, 'two folders up to the repo root');
  assert.match(t, /node_modules\/docs-kit\/scripts\/docs-kit\.mjs/, 'the devDependency init adds');

  const py = planInit(root, { version: VERSION, testFile: 'tests/test_docs.py' }).changes.find((c) => c.path === 'tests/test_docs.py').content;
  assert.match(py, /parents\[1\]/);
  assert.match(py, /def test_docs_follow_the_docs_kit_layout/);
}));

test('init --test without package.json runs the pinned release through npx', withRepo({ 'docs/README.md': '# d\n' }, (root) => {
  const py = planInit(root, { version: VERSION, testFile: 'test_docs.py' }).changes.find((c) => c.path === 'test_docs.py').content;
  assert.match(py, /parents\[0\]/);
  assert.ok(py.includes(`"npx", "--yes", "github:techsilon-oss/docs-kit#v${VERSION}", "check"`), py);
}));

test('init --no-package leaves package.json alone; the test runs the pinned release through npx', withRepo(MESSY, (root) => {
  const before = read(root, 'package.json');
  const r = run(root, 'init', '--no-package');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root, 'package.json'), before, 'package.json unchanged');
  assert.ok(exists(root, 'docs-kit.json'), 'the rest of the setup is written');
  assert.match(r.stdout, /skip {5}package\.json {2}\(left alone \(--no-package\)\)/);
  assert.ok(r.stdout.includes(`run docs-kit with npx github:techsilon-oss/docs-kit#v${VERSION}`), r.stdout);
  assert.doesNotMatch(r.stdout, /Run npm install/);
  const t = planInit(root, { version: VERSION, testFile: 'tests/docs.test.mjs', noPackage: true }).changes.find((c) => c.path === 'tests/docs.test.mjs').content;
  assert.ok(t.includes(`'npx', ['--yes', "github:techsilon-oss/docs-kit#v${VERSION}", 'check']`), t);
}));

test('init --no-package with docs-kit already a dependency: the test runs that copy', withRepo({
  'package.json': '{"name": "example-app", "devDependencies": {"docs-kit": "github:techsilon-oss/docs-kit#v0.2.0"}}\n', 'docs/README.md': '# d\n',
}, (root) => {
  const plan = planInit(root, { version: VERSION, testFile: 't.test.mjs', noPackage: true });
  assert.match(plan.changes.find((c) => c.path === 't.test.mjs').content, /node_modules\/docs-kit\/scripts\/docs-kit\.mjs/);
  assert.ok(!plan.notes.some((n) => n.includes('--no-package')), 'no npx advice when the dependency is there');
}));

test('init in docs-kit\'s own repo does not add itself as a dependency', withRepo({ 'package.json': '{"name": "docs-kit"}\n', 'docs/README.md': '# d\n' }, (root) => {
  const plan = planInit(root, { version: VERSION });
  assert.ok(!plan.changes.some((c) => c.path === 'package.json' && c.action === 'update'));
}));

test('package.json with CRLF line endings keeps them', withRepo({ ...MESSY, 'package.json': '{\r\n  "name": "example-app"\r\n}\r\n' }, (root) => {
  assert.equal(run(root, 'init').status, 0);
  const pkg = read(root, 'package.json');
  assert.ok(!/[^\r]\n/.test(pkg), 'every line ends in CRLF');
  assert.ok(JSON.parse(pkg).devDependencies['docs-kit']);
}));

test('init: bad arguments and places are refused, and nothing is written', withRepo(MESSY, (root) => {
  for (const args of [['--test', 'docs.test.rb'], ['--test', '../outside.test.mjs'], ['--docs-root', '../x'], ['extra']]) {
    const r = run(root, 'init', ...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  assert.ok(!exists(root, 'docs-kit.json'));
  writeFileSync(join(root, 'docs-kit.json'), '{"docsRoot": "docs"}');
  const r = run(root, 'init', '--docs-root', 'documentation');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /already sets docsRoot "docs"/);
}));

test('init outside a git repository is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-kit-nogit-'));
  try {
    const r = run(dir, 'init');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /inside a git repository/);
  } finally { cleanup(dir); }
});
