import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, parseConfig, stripJsonComments } from '../scripts/lib/config.mjs';
import { cleanup, git, makeFixture } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('config: comments and trailing commas are allowed', () => {
  const text = '// top\n{\n  "docsRoot": "docs/", /* inline */\n  "subjects": ["a", "b",],\n  "protected": { "./docs/x/": "a // not a comment" },\n}\n';
  assert.equal(stripJsonComments('{"a": "http://x"}'), '{"a": "http://x"}');
  const cfg = parseConfig(text);
  assert.equal(cfg.docsRoot, 'docs');
  assert.deepEqual(cfg.subjects, ['a', 'b']);
  assert.deepEqual(cfg.protected, { 'docs/x': 'a // not a comment' });
  assert.equal(cfg.howtoStaleDays, 90);
});

test('config: the shipped example parses', () => {
  const text = readFileSync(fileURLToPath(new URL('../examples/docs-kit.json', import.meta.url)), 'utf8');
  assert.equal(parseConfig(text).docsRoot, 'docs');
});

test('config: wrong types are reported', () => {
  assert.throws(() => parseConfig('{"subjects": "product"}'), (e) => e instanceof ConfigError && /subjects must be an array/.test(e.message));
  assert.throws(() => parseConfig('{"docMaps": [{"file": 1}]}'), /docMaps/);
  assert.throws(() => parseConfig('[]'), /must be a JSON object/);
  assert.throws(() => parseConfig('{'), /not valid JSON/);
});

test('cli: --version, --help and unknown commands', () => {
  const v = run(process.cwd(), '--version');
  assert.equal(v.status, 0);
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(run(process.cwd(), '--help').status, 0);
  assert.equal(run(process.cwd()).status, 2);
  assert.equal(run(process.cwd(), 'frobnicate').status, 2);
  assert.equal(run(process.cwd(), 'print', 'x.md').status, 2);
});

test('cli: check exits 0 on the fixture and 1 when the rule breaks', () => {
  const root = makeFixture();
  try {
    const ok = run(join(root, 'docs/legal'), 'check', '--today', '2026-11-01');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /docs-kit check: OK/);
    const json = JSON.parse(run(root, 'check', '--json', '--today', '2026-11-01').stdout);
    assert.equal(json.ok, true);
    writeFileSync(join(root, 'docs/STRAY.md'), 'x');
    const bad = run(root, 'check', '--today', '2026-11-01');
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /ERROR {3}docs\/STRAY\.md: not allowed/);
    assert.equal(run(root, 'check', '--today', '2026-13-01').status, 2);
  } finally { cleanup(root); }
});

test('cli: check without docs-kit.json is a configuration error', () => {
  const root = makeFixture({ omit: ['docs-kit.json'] });
  try {
    const r = run(root, 'check');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /docs-kit\.json not found/);
  } finally { cleanup(root); }
});

test('cli: move prints changes, git status and the check; refusals exit 2', () => {
  const root = makeFixture();
  try {
    const dry = run(root, 'move', 'docs/legal/TERMS.md', 'docs/product/TERMS.md', '--dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /DRY RUN/);
    assert.equal(git(root, 'status', '--porcelain'), '');

    const r = run(root, 'move', 'docs/legal/TERMS.md', 'docs/product/TERMS.md');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Stage every changed file/);
    assert.match(r.stdout, /scripts\/build-legal\.mjs/);
    assert.match(r.stdout, /REVIEW: /);
    assert.match(r.stdout, /docs-kit check: OK/);

    const refused = run(root, 'move', 'docs/support', 'docs/help');
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /protected/);
    assert.equal(run(root, 'move', 'docs/a.md').status, 2);
  } finally { cleanup(root); }
});

test('cli: move exits 1 when an ignored file becomes visible (H4)', () => {
  const root = makeFixture();
  try {
    appendFileSync(join(root, '.git/info/exclude'), 'docs/notes/README.md.secret\n');
    writeFileSync(join(root, 'docs/notes/README.md.secret'), 'confidential');
    const r = run(root, 'move', 'docs/notes', 'docs/pins');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /DANGER: 1 file\(s\) that were ignored are no longer ignored/);
  } finally { cleanup(root); }
});

