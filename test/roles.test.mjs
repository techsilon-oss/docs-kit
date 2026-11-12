// How-tos by role (DESIGN §4.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/lib/check.mjs';
import { loadConfig } from '../scripts/lib/config.mjs';
import { frontMatter, firstHeading } from '../scripts/lib/frontmatter.mjs';
import { move } from '../scripts/lib/move.mjs';
import { END, START, renderIndex } from '../scripts/lib/roles.mjs';
import { FILES, ROLE_INDEX, TODAY, cleanup, makeFixture, read } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../scripts/docs-kit.mjs', import.meta.url));
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const withFixture = (opts, fn) => async () => {
  const root = makeFixture(opts);
  try { await fn(root, loadConfig(root)); } finally { cleanup(root); }
};
const errorsOf = (root, cfg) => check(root, cfg, { today: TODAY }).errors;
const has = (list, s) => list.some((e) => e.includes(s));

const README_WITHOUT_INDEX = FILES['docs/README.md'].replace(`\n${ROLE_INDEX}\n`, '');

test('front matter: flow lists, block lists, quotes and comments', () => {
  assert.deepEqual(frontMatter('---\nroles: [customer, "support"]\n---\n').roles, ['customer', 'support']);
  assert.deepEqual(frontMatter('---\nroles:\n  - customer\n  - \'admin\'\ntitle: T # note\n---\n'), { roles: ['customer', 'admin'], title: 'T' });
  assert.deepEqual(frontMatter('---\r\nroles: [a]\r\n---\r\nbody'), { roles: ['a'] });
  assert.deepEqual(frontMatter('no front matter'), {});
  assert.equal(firstHeading('---\ntitle: x\n---\n\n# The heading #\n'), 'The heading');
});

test('the generated index lists each how-to under every role it names, sorted by title', () => {
  const block = renderIndex(['customer', 'admin', 'guest'], [
    { rel: 'b/howto/HOWTO-z.md', title: 'Zeta', roles: ['customer'] },
    { rel: 'a/howto/HOWTO-a.md', title: 'Alpha [beta]', roles: ['customer', 'admin'] },
  ]);
  assert.ok(block.startsWith(START) && block.endsWith(END));
  assert.match(block, /### customer\n\n- \[Alpha \\\[beta\\\]\]\(a\/howto\/HOWTO-a\.md\)\n- \[Zeta\]\(b\/howto\/HOWTO-z\.md\)\n/);
  assert.match(block, /### admin\n\n- \[Alpha/);
  assert.match(block, /### guest\n\n_No how-tos yet\._\n/);
});

test('the fixture front door matches the generated index', withFixture({}, (root, cfg) => {
  assert.deepEqual(errorsOf(root, cfg), []);
}));

test('a how-to with no roles fails', withFixture({
  extra: { 'docs/operations/howto/HOWTO-restore.md': '---\nlast_checked: 2026-10-30\n---\n' },
}, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'HOWTO-restore.md: no roles: in the front matter'));
}));

test('a how-to naming a role not in config fails', withFixture({
  extra: { 'docs/operations/howto/HOWTO-restore.md': '---\nlast_checked: 2026-10-30\nroles: [admin, auditor]\n---\n' },
}, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'HOWTO-restore.md: role "auditor" is not in docs-kit.json "roles"'));
}));

test('an index that disagrees with the front matter fails', withFixture({
  extra: { 'docs/README.md': FILES['docs/README.md'].replace('### admin\n\n- [Deploy example-app](operations/howto/HOWTO-deploy.md)', '### admin\n\n_No how-tos yet._') },
}, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'does not match the how-tos\' front matter; run docs-kit index'));
}));

test('a front door with no index fails', withFixture({ extra: { 'docs/README.md': README_WITHOUT_INDEX } }, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), 'docs/README.md: no "## How-tos by role" section; run docs-kit index'));
}));

test('H10: roles configured but no how-tos fails', withFixture({
  omit: ['docs/operations/howto/HOWTO-deploy.md', 'docs/product/howto/HOWTO-reset-password.md'],
}, (root, cfg) => {
  assert.ok(has(errorsOf(root, cfg), '"roles" is configured but no how-tos were found'));
}));

test('archived how-tos are not indexed', withFixture({
  extra: { 'docs/archive/operations/howto/HOWTO-old.md': '# old, no roles\n' },
}, (root, cfg) => {
  assert.deepEqual(errorsOf(root, cfg), []);
}));

test('docs-kit index adds the section, then refreshes it in place', withFixture({ extra: { 'docs/README.md': README_WITHOUT_INDEX } }, (root) => {
  const first = run(root, 'index');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /added/);
  assert.equal(read(root, 'docs/README.md'), FILES['docs/README.md']);
  assert.equal(run(root, 'check', '--today', '2026-11-01').status, 0);

  writeFileSync(join(root, 'docs/operations/howto/HOWTO-deploy.md'), '---\ntitle: Deploy example-app\nlast_checked: 2026-10-15\nroles: [admin, support]\n---\n');
  assert.equal(run(root, 'check', '--today', '2026-11-01').status, 1);
  const again = run(root, 'index');
  assert.match(again.stdout, /updated/);
  assert.match(read(root, 'docs/README.md'), /### support\n\n- \[Deploy example-app\]\(operations\/howto\/HOWTO-deploy\.md\)\n- \[Reset a password\]/);
  assert.equal(run(root, 'check', '--today', '2026-11-01').status, 0);
  assert.match(run(root, 'index').stdout, /up to date/);
}));

test('docs-kit index keeps CRLF line endings', withFixture({ extra: { 'docs/README.md': README_WITHOUT_INDEX.replace(/\n/g, '\r\n') } }, (root, cfg) => {
  assert.equal(run(root, 'index').status, 0);
  const text = read(root, 'docs/README.md');
  assert.ok(!/[^\r]\n/.test(text), 'every line ends in CRLF');
  assert.deepEqual(errorsOf(root, cfg), []);
}));

test('docs-kit index without roles in config is a configuration error', withFixture({}, (root) => {
  const cfgText = read(root, 'docs-kit.json').replace(/\n {2}"roles": .*\n/, '\n');
  writeFileSync(join(root, 'docs-kit.json'), cfgText);
  const r = run(root, 'index');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no "roles" list/);
}));

test('after a how-to moves, the index links follow it and the check still passes', withFixture({}, (root, cfg) => {
  move(root, [['docs/product/howto/HOWTO-reset-password.md', 'docs/operations/howto/HOWTO-reset-password.md']], { cfg });
  assert.match(read(root, 'docs/README.md'), /\(operations\/howto\/HOWTO-reset-password\.md\)/);
  assert.deepEqual(errorsOf(root, cfg), []);
}));
