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
});

test('every finding the skill explains is a message the check prints', () => {
  const s = text(SKILL);
  const table = s.slice(s.indexOf('| Finding |'), s.indexOf('Then read the "Found:" lines'));
  const phrases = [...table.matchAll(/^\| ([^|]+) \|/gm)].slice(1).flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
  assert.ok(phrases.length >= 8, phrases.join(', '));
  const sources = text('scripts/lib/check.mjs') + text('scripts/lib/roles.mjs');
  for (const p of phrases) assert.ok(sources.includes(p), `"${p}" is not in the check's messages`);
});
