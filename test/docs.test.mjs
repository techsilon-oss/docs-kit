// docs-kit's own docs (KIT-STANDARD.md, "Documentation"): they follow the layout,
// every command they show runs, the version they pin is this one, and every link
// and anchor resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/lib/check.mjs';
import { loadConfig } from '../scripts/lib/config.mjs';
import { VERSION } from '../scripts/docs-kit.mjs';
import { cleanup, makeFixture } from './helpers/fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'scripts/docs-kit.mjs');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function mdFiles(dir) {
  const out = [];
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = posix.join(dir, n);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...mdFiles(rel));
    else if (n.endsWith('.md')) out.push(rel);
  }
  return out;
}
const DOCS = ['README.md', ...mdFiles('docs')];
const HOWTOS = DOCS.filter((f) => f.startsWith('docs/guides/howto/'));

// The lines of every ```sh block, with the file and line they come from.
function shellLines(file) {
  const lines = read(file).split('\n');
  const out = [];
  let inSh = false;
  lines.forEach((l, i) => {
    const fence = /^\s*```(\w*)/.exec(l);
    if (fence) { inSh = !inSh && fence[1] === 'sh'; return; }
    if (inSh && l.trim() && !l.trim().startsWith('#')) out.push({ file, line: i + 1, text: l.trim() });
  });
  return out;
}

test('docs-kit\'s own docs/ follows the docs-kit layout', () => {
  const r = check(ROOT, loadConfig(ROOT));
  assert.deepEqual(r.errors, [], r.errors.join('\n'));
  assert.deepEqual(r.warnings, [], r.warnings.join('\n'));
  assert.ok(HOWTOS.length >= 3, 'the standard asks for how-tos to adopt, upgrade and remove');
  for (const t of ['adopt', 'upgrade', 'remove']) assert.ok(HOWTOS.some((f) => f.includes(`HOWTO-${t}-`)), `a how-to to ${t}`);
});

test('every docs-kit command the README and the how-tos show runs, on a fixture repo', () => {
  // Other commands a reader runs; docs-kit does not test them.
  const OTHER = /^(npm|git|claude|winget|brew)\b/;
  const lines = ['README.md', ...HOWTOS].flatMap(shellLines);
  const ours = [];
  for (const l of lines) {
    if (/#\s*example:/.test(l.text)) continue;
    const m = /^npx (?:github:techsilon-oss\/docs-kit#v[\d.]+|docs-kit) (.+)$/.exec(l.text);
    if (m) ours.push({ ...l, args: m[1].split(/\s+/) });
    else assert.match(l.text, OTHER, `${l.file}:${l.line}: "${l.text}" is not a docs-kit command, a known tool, or marked "# example:"`);
  }
  assert.ok(ours.length >= 5, ours.map((o) => o.text).join('\n'));
  for (const o of ours) {
    const root = makeFixture();
    try {
      const r = spawnSync(process.execPath, [CLI, ...o.args], {
        cwd: root, encoding: 'utf8', env: { ...process.env, DOCS_KIT_PANDOC: join(root, 'no-such-pandoc') },
      });
      assert.equal(r.status, 0, `${o.file}:${o.line}: ${o.text}\n${r.stdout}${r.stderr}`);
    } finally { cleanup(root); }
  }
});

test('the docs pin this release, so a reader who copies a command gets this version', () => {
  for (const f of DOCS) {
    for (const m of read(f).matchAll(/docs-kit#v(\d+\.\d+\.\d+)/g)) {
      assert.equal(m[1], VERSION, `${f}: pins v${m[1]}; this release is ${VERSION}`);
    }
  }
});

// GitHub's heading anchors: lower case, punctuation dropped, each space a hyphen.
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const anchors = (file) => {
  let fence = false;
  const out = new Set();
  for (const l of read(file).split('\n')) {
    if (/^\s*```/.test(l)) { fence = !fence; continue; }
    const h = !fence && /^#{1,6}\s+(.+?)\s*#*$/.exec(l);
    if (h) out.add(slug(h[1].replace(/`/g, '')));
  }
  return out;
};

test('every relative link in the docs resolves, and so does every anchor', () => {
  const broken = [];
  for (const f of [...DOCS, 'CHANGELOG.md']) {
    let fence = false;
    read(f).split('\n').forEach((l, i) => {
      if (/^\s*```/.test(l)) { fence = !fence; return; }
      if (fence) return;
      for (const m of l.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
        const dest = m[1];
        if (/^[a-z]+:/i.test(dest)) continue;
        const [path, anchor] = dest.split('#');
        const target = path ? posix.normalize(posix.join(posix.dirname(f), path)) : f;
        if (!existsSync(join(ROOT, target))) { broken.push(`${f}:${i + 1}: ${dest} (no such file)`); continue; }
        if (anchor && target.endsWith('.md') && !anchors(target).has(anchor)) broken.push(`${f}:${i + 1}: ${dest} (no such heading)`);
      }
    });
  }
  assert.deepEqual(broken, []);
});

test('the generator snippets in the how-to run, in Python and in Node', async (t) => {
  const { cpSync, writeFileSync: write } = await import('node:fs');
  const body = read('docs/guides/howto/HOWTO-route-generated-docs.md');
  const block = (lang) => new RegExp('```' + lang + '\n([\\s\\S]*?)```').exec(body)[1].replace(/^ {3}/gm, '');
  const root = makeFixture();
  try {
    cpSync(join(ROOT, 'scripts'), join(root, 'node_modules/docs-kit/scripts'), { recursive: true });
    const want = /^docs\/platform\/snapshots\/architecture\/ARCHITECTURE_\d{4}-\d{2}-\d{2}\.pdf$/;

    write(join(root, 'gen.mjs'), `${block('js')}\nconsole.log(snapshotPath('architecture', 'pdf'));\n`);
    const node = spawnSync(process.execPath, ['gen.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(node.status, 0, node.stderr);
    assert.match(node.stdout.trim(), want);

    const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
    if (!py) { t.diagnostic('no Python on this machine: the Python snippet was not run'); return; }
    write(join(root, 'gen.py'), `${block('python')}\nprint(snapshot_path("architecture", "pdf"))\n`);
    const r = spawnSync(py, ['gen.py'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.trim(), want);
  } finally { cleanup(root); }
});
