// docs-kit print (DESIGN §6.5): print copies beside the source, newest only; no pandoc means skipped, not an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/lib/check.mjs';
import { DEFAULTS } from '../scripts/lib/config.mjs';
import { findPandoc, formatPrint, planPrint, print, wideTables } from '../scripts/lib/print.mjs';
import { cleanup, exists, makeFixture } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
const TODAY = new Date('2026-11-13T00:00:00Z');
const PANDOC = { cmd: 'pandoc', version: 'pandoc 3.0' };

const withRepo = (files, fn) => async () => {
  const root = makeFixture({ files: { 'docs/README.md': '# Docs\n', 'docs/legal/README.md': '# Legal\n', ...files }, ignored: {} });
  try { await fn(root); } finally { cleanup(root); }
};

// A stand-in for pandoc: writes the output file it is asked for, unless that format should fail.
const fakePandoc = (calls, { fail = [] } = {}) => (cmd, args, opts) => {
  calls.push({ cmd, args, cwd: opts.cwd });
  const out = args[args.indexOf('-o') + 1];
  if (fail.some((f) => out.endsWith(`.${f}`))) return { status: 43, stderr: 'pdflatex not found. Please select a different --pdf-engine\n' };
  writeFileSync(join(opts.cwd, out), 'copy');
  return { status: 0, stdout: '', stderr: '' };
};

test('print: makes .docx and .pdf beside the source with the naming rule, run from the source folder', withRepo({ 'docs/legal/TERMS.md': '# Terms\n' }, (root) => {
  const calls = [];
  const r = print(root, 'docs/legal/TERMS.md', { today: TODAY, pandoc: PANDOC, run: fakePandoc(calls) });
  assert.deepEqual(r.made.map((o) => o.path), ['docs/legal/TERMS_v1.0_2026-11-13.docx', 'docs/legal/TERMS_v1.0_2026-11-13.pdf']);
  assert.ok(exists(root, 'docs/legal/TERMS_v1.0_2026-11-13.pdf'));
  assert.deepEqual(calls[0].args, ['TERMS.md', '-o', 'TERMS_v1.0_2026-11-13.docx', '--resource-path=.']);
  assert.equal(calls[0].cwd, join(root, 'docs/legal'), 'relative images resolve from the source folder');
  const res = check(root, { ...DEFAULTS, subjects: ['legal'] });
  assert.ok(!res.warnings.some((w) => w.includes('print cop')), res.warnings.join('\n'));
}));

test('print: the next version is one minor up, and only the newest print copy stays', withRepo({
  'docs/legal/TERMS.md': '# Terms\n',
  'docs/legal/TERMS_v1.2_2026-10-01.docx': 'old',
  'docs/legal/TERMS_v1.2_2026-10-01.pdf': 'old',
  'docs/legal/TERMS-OF-SALE_v3.0_2026-10-01.pdf': 'another doc',
}, (root) => {
  const r = print(root, 'docs/legal/TERMS.md', { today: TODAY, pandoc: PANDOC, run: fakePandoc([]) });
  assert.equal(r.version, '1.3');
  assert.deepEqual(r.removed.sort(), ['docs/legal/TERMS_v1.2_2026-10-01.docx', 'docs/legal/TERMS_v1.2_2026-10-01.pdf']);
  assert.ok(!exists(root, 'docs/legal/TERMS_v1.2_2026-10-01.pdf'));
  assert.ok(exists(root, 'docs/legal/TERMS-OF-SALE_v3.0_2026-10-01.pdf'), 'another doc\'s copies are not touched');
  assert.equal(planPrint(root, 'docs/legal/TERMS.md', { version: '2.0', today: TODAY }).version, '2.0', '--version wins');
}));

test('print: a format pandoc cannot make keeps its older copy and says why', withRepo({
  'docs/legal/TERMS.md': '# Terms\n',
  'docs/legal/TERMS_v1.0_2026-10-01.pdf': 'old',
}, (root) => {
  const r = print(root, 'docs/legal/TERMS.md', { today: TODAY, pandoc: PANDOC, run: fakePandoc([], { fail: ['pdf'] }) });
  assert.deepEqual(r.made.map((o) => o.format), ['docx']);
  assert.equal(r.failed[0].format, 'pdf');
  assert.ok(exists(root, 'docs/legal/TERMS_v1.0_2026-10-01.pdf'), 'the older pdf stays when no new one was made');
  assert.match(formatPrint(r), /FAILED {3}docs\/legal\/TERMS_v1\.1_2026-11-13\.pdf {2}\(pdflatex not found.*PDF engine/);
}));

test('print: without pandoc it is skipped with a message, exits 0 and writes nothing', withRepo({ 'docs/legal/TERMS.md': '# Terms\n' }, (root) => {
  assert.equal(findPandoc({ DOCS_KIT_PANDOC: join(root, 'no-such-pandoc') }), null);
  const r = spawnSync(process.execPath, [CLI, 'print', 'docs/legal/TERMS.md'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DOCS_KIT_PANDOC: join(root, 'no-such-pandoc') },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skipped, pandoc is not installed\. Nothing was printed/);
  assert.match(r.stdout, /It would make: docs\/legal\/TERMS_v1\.0_\d{4}-\d{2}-\d{2}\.docx/);
  assert.ok(!exists(root, 'docs/legal/TERMS_v1.0_2026-11-13.docx'));
}));

test('print: a path from a subfolder is taken from where you are', withRepo({ 'docs/legal/TERMS.md': '# Terms\n' }, (root) => {
  const r = spawnSync(process.execPath, [CLI, 'print', 'TERMS.md', '--today', '2026-11-13'], {
    cwd: join(root, 'docs/legal'), encoding: 'utf8', env: { ...process.env, DOCS_KIT_PANDOC: join(root, 'no-such-pandoc') },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /It would make: docs\/legal\/TERMS_v1\.0_2026-11-13\.docx/);
}));

test('print: wrong arguments exit 2 and print nothing', withRepo({ 'docs/legal/TERMS.md': '# Terms\n' }, (root) => {
  for (const args of [['docs/legal/NOPE.md'], ['docs/legal/README.txt'], ['docs/legal/TERMS.md', '--version', 'v1'], [], ['a.md', 'b.md'], ['docs/legal/TERMS.md', '--bogus']]) {
    const r = spawnSync(process.execPath, [CLI, 'print', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
}));

test('print: warns about a table with too many columns for a page, not about long prose', () => {
  const wide = '| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 |\n';
  const prose = `| a | b |\n|---|---|\n| ${'long words '.repeat(30)} | x |\n`;
  const fenced = '```\n| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n```\n';
  assert.deepEqual(wideTables(`# T\n\n${wide}\n${prose}\n${fenced}`), [{ line: 3, columns: 6 }]);
});
