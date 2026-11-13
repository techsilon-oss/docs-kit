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

test('every finding the skill explains is a message the check prints', () => {
  const s = text(SKILL);
  const table = s.slice(s.indexOf('| Finding |'), s.indexOf('Then read the "Found:" lines'));
  const phrases = [...table.matchAll(/^\| ([^|]+) \|/gm)].slice(1).flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
  assert.ok(phrases.length >= 8, phrases.join(', '));
  const sources = text('scripts/lib/check.mjs') + text('scripts/lib/roles.mjs');
  for (const p of phrases) assert.ok(sources.includes(p), `"${p}" is not in the check's messages`);
});

// /pin (DESIGN §6.4): project-neutral, calls docs-kit, and its how-to template passes the check.
const PIN = 'skills/docs-kit-pin/SKILL.md';

test('/pin: front matter, and only docs-kit commands the CLI has', () => {
  const s = text(PIN);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^name: docs-kit-pin$/m);
  assert.match(fm[1], /^description: .{40,}$/m);
  const cli = text('scripts/docs-kit.mjs');
  const cmds = new Set([...s.matchAll(/DOCS_KIT (\w+)/g)].map((m) => m[1]));
  assert.ok(cmds.has('print') && cmds.has('index') && cmds.has('check'), [...cmds].join(', '));
  for (const c of cmds) assert.ok(cli.includes(`cmd === '${c}'`), `docs-kit ${c}`);
  for (const opt of [...s.matchAll(/DOCS_KIT print[^`]*?(--[a-z-]+)/g)].map((m) => m[1])) {
    assert.ok(cli.includes(`takeValue(args, '${opt}')`) || cli.includes(`takeFlag(args, '${opt}')`), `print ${opt}`);
  }
});

test('/docs-kit-pin: project-neutral, prints through docs-kit print', () => {
  assert.doesNotMatch(text(PIN), /scripts\/docs-print|\.py\b/, 'no project script: printing goes through docs-kit print');
});

test('/pin: a how-to written from its template passes the check and is indexed by role', async () => {
  const { check } = await import('../scripts/lib/check.mjs');
  const { loadConfig } = await import('../scripts/lib/config.mjs');
  const { cleanup, makeFixture } = await import('./helpers/fixture.mjs');
  const s = text(PIN).replace(/\r\n/g, '\n');
  const block = /## `\/docs-kit-pin --howto[\s\S]*?```yaml\n([\s\S]*?)```/.exec(s)[1].replace(/^ {3}/gm, '');
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


// The techsilon-oss kit standard (KIT-STANDARD.md, "Plugin kits"), for every skill.
const { readdirSync } = await import('node:fs');
const skills = readdirSync(at('skills')).map((dir) => {
  const body = text(`skills/${dir}/SKILL.md`).replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(body)[1];
  const field = (k) => (new RegExp(`^${k}: (.*)$`, 'm').exec(fm) || [])[1];
  return { dir, body, name: field('name'), description: field('description') || '', tools: field('allowed-tools') || '' };
});

test('kit standard: every skill name starts with docs-kit-, except a dated alias for a renamed skill', () => {
  for (const s of skills) {
    assert.equal(s.name, s.dir, `${s.dir}: the name matches the folder`);
    if (s.name.startsWith('docs-kit-')) continue;
    const m = /^Renamed to \/(docs-kit-[a-z-]+) in docs-kit [\d.]+\. This alias runs it, and is removed in the first release on or after (\d{4}-\d{2}-\d{2})\.$/.exec(s.description);
    assert.ok(m, `${s.dir}: a bare name is allowed only as a dated alias`);
    assert.ok(skills.some((t) => t.name === m[1]), `${s.dir}: the alias points at /${m[1]}, which exists`);
    assert.ok(new Date() < new Date(m[2]), `${s.dir}: the alias was due for removal on ${m[2]}; remove it`);
  }
});

test('kit standard: allowed-tools pre-approves only the plugin\'s own scripts, and read-only tools', () => {
  for (const s of skills) {
    for (const t of s.tools.match(/Bash\([^)]*\)|\S+/g) || []) {
      if (['Read', 'Glob', 'Grep'].includes(t)) continue;
      assert.match(t, /^Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[a-z-]+\.mjs" [^*\s]/, `${s.dir}: "${t}" is not one of the plugin's own scripts`);
    }
  }
});

test('kit standard: a read-only /docs-kit-help, and a plugin description that ends with it', () => {
  const help = skills.find((s) => s.name === 'docs-kit-help');
  assert.ok(help, '/docs-kit-help exists');
  assert.equal(help.tools.trim(), 'Read Grep Glob', 'it reads, and runs nothing');
  for (const p of ['docs/FAQ.md', 'docs/UPGRADING.md', 'docs/reference/COMMANDS.md', 'docs/guides/howto']) {
    assert.ok(help.body.includes(p) && existsSync(at(p)), `it answers from ${p}, which ships`);
  }
  assert.match(json('.claude-plugin/plugin.json').description, / Help: \/docs-kit-help$/);
});

test('kit standard: Apache-2.0 with a NOTICE, in every manifest, and shipped with the package', () => {
  assert.match(text('LICENSE'), /Apache License\s+Version 2\.0, January 2004/);
  assert.match(text('NOTICE').replace(/\r\n/g, '\n'), /^docs-kit\nCopyright \d{4} Techsilon LLC\n/);
  assert.equal(json('package.json').license, 'Apache-2.0');
  assert.equal(json('.claude-plugin/plugin.json').license, 'Apache-2.0');
  for (const f of ['LICENSE', 'NOTICE', 'docs/']) assert.ok(json('package.json').files.includes(f), `package.json files has ${f}`);
  assert.equal(json('.claude-plugin/plugin.json').author.name, 'Techsilon LLC');
});

test('kit standard: package.json names Techsilon LLC and the org email', () => {
  assert.equal(json('package.json').author, 'Techsilon LLC <oss@techsilon.com>');
});
