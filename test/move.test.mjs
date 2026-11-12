import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/lib/config.mjs';
import { check } from '../scripts/lib/check.mjs';
import { move, MoveError } from '../scripts/lib/move.mjs';
import { TODAY, cleanup, exists, git, makeFixture, read } from './helpers/fixture.mjs';

const withFixture = (opts, fn) => async () => {
  const root = makeFixture(opts);
  try { await fn(root, loadConfig(root)); } finally { cleanup(root); }
};

const withMoney = (cfg) => ({ ...cfg, subjects: [...cfg.subjects, 'money'] });

test('folder move: relative links in moved files and in files that link to them', withFixture({}, (root, cfg) => {
  move(root, [['docs/legal', 'docs/money/legal']], { cfg: withMoney(cfg) });
  // A file that links into the moved folder.
  assert.match(read(root, 'docs/product/OVERVIEW.md'), /\[the terms\]\(\.\.\/money\/legal\/TERMS\.md\)/);
  assert.match(read(root, 'docs/product/OVERVIEW.md'), /\[legal\]\(\.\.\/money\/legal\/\)/);
  assert.match(read(root, 'docs/platform/ARCHITECTURE.md'), /^\[terms\]: \.\.\/money\/legal\/TERMS\.md "The terms"$/m);
  assert.match(read(root, 'docs/PROJECT-HUB.md'), /\(money\/legal\/TERMS\.md#scope\)/);
  assert.match(read(root, 'docs/README.md'), /\[Legal\]\(money\/legal\/README\.md\)/);
  // A moved file that links out of the moved folder, and to itself.
  const terms = read(root, 'docs/money/legal/TERMS.md');
  assert.match(terms, /\[overview\]\(\.\.\/\.\.\/product\/OVERVIEW\.md\)/);
  assert.match(terms, /\[self\]\(\.\/TERMS\.md\)/);
  // Links inside a code fence are left alone; the root path in it is rewritten.
  const ov = read(root, 'docs/product/OVERVIEW.md');
  assert.match(ov, /^cat docs\/money\/legal\/TERMS\.md$/m);
  assert.match(ov, /^\[not a link\]\(\.\.\/legal\/TERMS\.md\)$/m);
}));

test('archive content: only links into the moved path change; prose history stays', withFixture({}, (root, cfg) => {
  move(root, [['docs/legal', 'docs/money/legal']], { cfg: withMoney(cfg) });
  const old = read(root, 'docs/archive/product/OLD-OVERVIEW.md');
  assert.match(old, /then at docs\/legal\/TERMS\.md\./);
  assert.match(old, /\[terms\]\(\.\.\/\.\.\/money\/legal\/TERMS\.md\)/);
}));

test('a moved file keeps its history (git log --follow)', withFixture({}, (root, cfg) => {
  // git detects renames by similarity, so this uses a file whose links stay the same.
  move(root, [['docs/legal', 'docs/money/legal']], { cfg: withMoney(cfg) });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'move');
  const log = git(root, 'log', '--follow', '--oneline', '--', 'docs/money/legal/README.md').trim().split('\n');
  assert.equal(log.length, 2);
}));

test('several pairs in one call', withFixture({}, (root, cfg) => {
  const r = move(root, [
    ['docs/legal/TERMS.md', 'docs/product/TERMS.md'],
    ['docs/platform/ARCHITECTURE.md', 'docs/product/ARCHITECTURE.md'],
  ], { cfg });
  assert.equal(r.moves.length, 2);
  // ARCHITECTURE.md moved and its link target moved too.
  assert.match(read(root, 'docs/product/ARCHITECTURE.md'), /^\[terms\]: TERMS\.md "The terms"$/m);
  assert.deepEqual(JSON.parse(read(root, 'scripts/source-doc-map.json')).mappings[0].docs, ['docs/product/TERMS.md', 'docs/product/ARCHITECTURE.md']);
}));

test('dry run changes nothing and reports what would change', withFixture({}, (root, cfg) => {
  const r = move(root, [['docs/legal', 'docs/money/legal']], { cfg: withMoney(cfg), dryRun: true });
  assert.ok(r.moves.length > 0);
  assert.ok(r.rewritten.includes('.gitignore'));
  assert.ok(r.piecedHits.length > 0);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.ok(exists(root, 'docs/legal/TERMS.md'));
  assert.ok(exists(root, 'docs/legal/contracts/client-a.pdf'));
}));

test('refusals: missing source, existing destination, inside itself, outside the repo', withFixture({}, (root, cfg) => {
  const cases = [
    [['docs/nope.md', 'docs/x.md'], /does not exist/],
    [['docs/legal/TERMS.md', 'docs/product/OVERVIEW.md'], /already exists/],
    [['docs/legal', 'docs/legal/sub'], /inside itself/],
    [['docs/legal/TERMS.md', '../TERMS.md'], /inside it/],
    [['docs/legal/TERMS.md', 'docs/legal/TERMS.md'], /same/],
    [['docs/legal/TERMS.md', 'docs/a.md'], null],
  ];
  for (const [pair, re] of cases.slice(0, -1)) {
    assert.throws(() => move(root, [pair], { cfg }), (e) => e instanceof MoveError && re.test(e.message), pair.join(' -> '));
  }
  assert.throws(() => move(root, [['docs/legal/TERMS.md', 'docs/a.md'], ['docs/product/OVERVIEW.md', 'docs/a.md']], { cfg }), /same place/);
  assert.throws(() => move(root, [['docs/legal/TERMS.md', 'docs/a.md'], ['docs/a.md', 'docs/b.md']], { cfg }), /does not exist/);
  assert.equal(git(root, 'status', '--porcelain'), '');
}));

test('the layout check still passes after a move that keeps the rule', withFixture({}, (root, cfg) => {
  move(root, [['docs/legal/TERMS.md', 'docs/product/TERMS.md']], { cfg });
  assert.deepEqual(check(root, cfg, { today: TODAY }).errors, []);
}));
