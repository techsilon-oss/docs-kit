// The Claude Code plugin (DESIGN §8): its manifests and the /docs-kit-init skill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../scripts/docs-kit.mjs';

const at = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const text = (rel) => readFileSync(at(rel), 'utf8');
const json = (rel) => JSON.parse(text(rel));

const SKILL = 'skills/docs-kit-init/SKILL.md';

test('one version everywhere: package.json, the CLI, the plugin and the marketplace', () => {
  const pkg = json('package.json');
  const plugin = json('.claude-plugin/plugin.json');
  const market = json('.claude-plugin/marketplace.json');
  assert.equal(VERSION, pkg.version);
  assert.equal(plugin.version, pkg.version);
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].version, pkg.version);
  assert.equal(plugin.name, 'docs-kit');
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source, './');
  assert.equal(market.plugins[0].description, plugin.description);
});

test('the skill has a name, a description and the tools it needs', () => {
  const s = text(SKILL);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^name: docs-kit-init$/m);
  assert.match(fm[1], /^description: .{40,}$/m);
  assert.match(fm[1], /^allowed-tools: .*Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/docs-kit\.mjs" init\*\)/m);
  assert.ok(existsSync(at('scripts/docs-kit.mjs')), 'the CLI the skill runs is in the plugin');
});

test('the skill only uses init options the CLI has', () => {
  const s = text(SKILL);
  const used = new Set([...s.matchAll(/\binit((?: --[a-z-]+(?: <[^>]+>)?)+)/g)].flatMap((m) => m[1].match(/--[a-z-]+/g)));
  const cli = text('scripts/docs-kit.mjs');
  for (const opt of used) assert.ok(cli.includes(`takeFlag(args, '${opt}')`) || cli.includes(`takeValue(args, '${opt}')`), `init ${opt}`);
  assert.ok(used.has('--dry-run') && used.has('--test'));
  const named = [...s.matchAll(/`(--[a-z-]+)`/g)].map((m) => m[1]);
  assert.ok(named.includes('--no-package'), 'the skill offers --no-package');
  for (const opt of named) assert.ok(cli.includes(`takeFlag(args, '${opt}')`) || cli.includes(`takeValue(args, '${opt}')`), opt);
});

test('the skill pre-approves only reads: committing, pushing and installing go through the owner', () => {
  const tools = /^allowed-tools: (.*)$/m.exec(text(SKILL).replace(/\r\n/g, '\n'))[1];
  for (const bad of ['git commit', 'git push', 'git add', 'git switch', 'npm install', 'npm i ', 'Write', 'Edit']) {
    assert.ok(!tools.includes(bad), `allowed-tools pre-approves "${bad}"`);
  }
});

test('every finding the skill explains is a message the check prints', () => {
  const s = text(SKILL);
  const table = s.slice(s.indexOf('| Finding |'), s.indexOf('Then read the "Found:" lines'));
  const phrases = [...table.matchAll(/^\| ([^|]+) \|/gm)].slice(1).flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
  assert.ok(phrases.length >= 8, phrases.join(', '));
  const sources = text('scripts/lib/check.mjs') + text('scripts/lib/roles.mjs');
  for (const p of phrases) assert.ok(sources.includes(p), `"${p}" is not in the check's messages`);
});

// /pin (DESIGN §6.4): project-neutral, calls docs-kit, and its how-to template passes the check.
const PIN = 'skills/pin/SKILL.md';

test('/pin: front matter, and only docs-kit commands the CLI has', () => {
  const s = text(PIN);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^name: pin$/m);
  assert.match(fm[1], /^description: .{40,}$/m);
  const cli = text('scripts/docs-kit.mjs');
  const cmds = new Set([...s.matchAll(/DOCS_KIT (\w+)/g)].map((m) => m[1]));
  assert.ok(cmds.has('print') && cmds.has('index') && cmds.has('check'), [...cmds].join(', '));
  for (const c of cmds) assert.ok(cli.includes(`cmd === '${c}'`), `docs-kit ${c}`);
  for (const opt of [...s.matchAll(/DOCS_KIT print[^`]*?(--[a-z-]+)/g)].map((m) => m[1])) {
    assert.ok(cli.includes(`takeValue(args, '${opt}')`) || cli.includes(`takeFlag(args, '${opt}')`), `print ${opt}`);
  }
});

test('/pin: project-neutral, and pre-approves no commit, push or install', () => {
  const s = text(PIN);
  assert.doesNotMatch(s, /scripts\/docs-print|\.py\b/, 'no project script: printing goes through docs-kit print');
  const tools = /^allowed-tools: (.*)$/m.exec(s.replace(/\r\n/g, '\n'))[1];
  for (const bad of ['git commit', 'git push', 'git add', 'npm install', 'Bash(git *)', 'Bash(pandoc']) {
    assert.ok(!tools.includes(bad), `allowed-tools pre-approves "${bad}"`);
  }
});

test('/pin: a how-to written from its template passes the check and is indexed by role', async () => {
  const { check } = await import('../scripts/lib/check.mjs');
  const { loadConfig } = await import('../scripts/lib/config.mjs');
  const { cleanup, makeFixture } = await import('./helpers/fixture.mjs');
  const s = text(PIN).replace(/\r\n/g, '\n');
  const block = /## `\/pin --howto[\s\S]*?```yaml\n([\s\S]*?)```/.exec(s)[1].replace(/^ {3}/gm, '');
  const fm = block
    .replace('How to <task>', 'How to rotate a key')
    .replace('<YYYY-MM-DD>', '2026-11-01')
    .replace('[<role>, ...]', '[support, admin]')
    .replace('<subject>', 'operations');
  const howto = `${fm}\n# How to rotate a key\n\n1. Open the console.\n`;
  const root = makeFixture({ extra: { 'docs/operations/howto/HOWTO-rotate-a-key.md': howto } });
  try {
    const cli = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
    const { spawnSync } = await import('node:child_process');
    const idx = spawnSync(process.execPath, [cli, 'index'], { cwd: root, encoding: 'utf8' });
    assert.equal(idx.status, 0, idx.stderr);
    const r = check(root, loadConfig(root), { today: new Date('2026-11-02') });
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    assert.match(readFileSync(`${root}/docs/README.md`, 'utf8'), /### admin\n\n(?:- .*\n)*- \[How to rotate a key\]\(operations\/howto\/HOWTO-rotate-a-key\.md\)/);
  } finally { cleanup(root); }
});
