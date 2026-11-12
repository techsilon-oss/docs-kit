import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathMap, findPiecedPaths, replaceRootPaths, rewriteDest, rewriteMarkdown } from '../scripts/lib/rewrite.mjs';

const fileMap = new PathMap([['docs/a/X.md', 'docs/b/X.md']], []);
const dirMap = new PathMap([['docs/a/X.md', 'docs/b/X.md'], ['docs/a/Y.md', 'docs/b/Y.md']], [['docs/a', 'docs/b']]);

test('root paths: boundaries before the path', () => {
  const cases = [
    ['see docs/a/X.md here', 'see docs/b/X.md here'],
    ['"docs/a/X.md"', '"docs/b/X.md"'],
    ["('docs/a/X.md')", "('docs/b/X.md')"],
    ['`docs/a/X.md`', '`docs/b/X.md`'],
    ['/docs/a/X.md', '/docs/b/X.md'],
    ['./docs/a/X.md', './docs/b/X.md'],
    ['../../docs/a/X.md', '../../docs/b/X.md'],
    ['https://github.com/o/r/blob/main/docs/a/X.md', 'https://github.com/o/r/blob/main/docs/b/X.md'],
    ['packages/web/docs/a/X.md', 'packages/web/docs/a/X.md'],
    ['mydocs/a/X.md', 'mydocs/a/X.md'],
  ];
  for (const [input, want] of cases) assert.equal(replaceRootPaths(input, fileMap), want, input);
});

test('root paths: boundaries after the path, with trailing punctuation (H8)', () => {
  const cases = [
    ['docs/a/X.md.', 'docs/b/X.md.'],
    ['docs/a/X.md, then', 'docs/b/X.md, then'],
    ['(docs/a/X.md)', '(docs/b/X.md)'],
    ['docs/a/X.md;', 'docs/b/X.md;'],
    ['docs/a/X.md:', 'docs/b/X.md:'],
    ['docs/a/X.md?', 'docs/b/X.md?'],
    ['docs/a/X.md!', 'docs/b/X.md!'],
    ['docs/a/X.md\r\n', 'docs/b/X.md\r\n'],
    ['docs/a/X.md#anchor', 'docs/b/X.md#anchor'],
    ['docs/a/X.md.bak', 'docs/a/X.md.bak'],
    ['docs/a/X.mdx', 'docs/a/X.mdx'],
    ['docs/a/X.md-old', 'docs/a/X.md-old'],
  ];
  for (const [input, want] of cases) assert.equal(replaceRootPaths(input, fileMap), want, input);
});

test('root paths: folder prefixes', () => {
  assert.equal(replaceRootPaths('docs/a/', dirMap), 'docs/b/');
  assert.equal(replaceRootPaths('docs/a.', dirMap), 'docs/b.');
  assert.equal(replaceRootPaths('docs/a/deep/Z.md', dirMap), 'docs/b/deep/Z.md');
  assert.equal(replaceRootPaths('docs/ab/Z.md', dirMap), 'docs/ab/Z.md');
  assert.equal(replaceRootPaths('docs/a.md', dirMap), 'docs/a.md');
  assert.equal(replaceRootPaths('docs/a/*.pdf', dirMap), 'docs/b/*.pdf');
});

test('link destinations: the linking file did not move, the target did', () => {
  assert.equal(rewriteDest('../a/X.md', 'docs/c/R.md', 'docs/c/R.md', fileMap), '../b/X.md');
  assert.equal(rewriteDest('../a/X.md#part', 'docs/c/R.md', 'docs/c/R.md', fileMap), '../b/X.md#part');
  assert.equal(rewriteDest('<../a/X.md>', 'docs/c/R.md', 'docs/c/R.md', fileMap), '<../b/X.md>');
  assert.equal(rewriteDest('../a/', 'docs/c/R.md', 'docs/c/R.md', dirMap), '../b/');
  assert.equal(rewriteDest('docs/a/X.md', 'README.md', 'README.md', fileMap), 'docs/b/X.md');
});

test('link destinations: left alone when nothing moved, or not a relative path', () => {
  for (const d of ['../c/Z.md', 'https://example.com/docs/a/X.md', 'mailto:a@example.com', '#top', '/docs/a/X.md', '']) {
    assert.equal(rewriteDest(d, 'docs/c/R.md', 'docs/c/R.md', fileMap), d);
  }
});

test('link destinations: the linking file moved, the target did not', () => {
  assert.equal(rewriteDest('../c/Z.md', 'docs/a/X.md', 'docs/b/deep/X.md', fileMap), '../../c/Z.md');
  assert.equal(rewriteDest('./Z.md', 'docs/a/X.md', 'docs/b/X.md', fileMap), '../a/Z.md');
});

test('link destinations: both moved', () => {
  assert.equal(rewriteDest('Y.md', 'docs/a/X.md', 'docs/b/X.md', dirMap), 'Y.md');
  assert.equal(rewriteDest('./Y.md', 'docs/a/X.md', 'docs/b/X.md', dirMap), './Y.md');
});

test('link destinations: %-encoded spaces stay encoded', () => {
  const m = new PathMap([['docs/a/My Doc.md', 'docs/b/My Doc.md']], []);
  assert.equal(rewriteDest('../a/My%20Doc.md', 'docs/c/R.md', 'docs/c/R.md', m), '../b/My%20Doc.md');
});

test('archive rule: only links into a moved path change', () => {
  assert.equal(rewriteDest('../c/Z.md', 'docs/a/X.md', 'docs/b/X.md', fileMap, { onlyMovedTargets: true }), '../c/Z.md');
  assert.equal(rewriteDest('../../a/X.md', 'docs/archive/c/R.md', 'docs/archive/c/R.md', fileMap, { onlyMovedTargets: true }), '../../b/X.md');
});

test('markdown: inline links, images, titles, reference definitions and HTML attributes', () => {
  const md = [
    '[x](../a/X.md "title") and ![img](../a/X.md)',
    '[ref]: ../a/X.md "t"',
    '<a href="../a/X.md">x</a> <img src=\'../a/X.md\'>',
    'prose docs/a/X.md.',
    '',
  ].join('\n');
  const out = rewriteMarkdown(md, 'docs/c/R.md', 'docs/c/R.md', fileMap);
  assert.equal(out, [
    '[x](../b/X.md "title") and ![img](../b/X.md)',
    '[ref]: ../b/X.md "t"',
    '<a href="../b/X.md">x</a> <img src=\'../b/X.md\'>',
    'prose docs/b/X.md.',
    '',
  ].join('\n'));
});

test('markdown: links inside code fences are not parsed; root paths there are rewritten', () => {
  const md = '```sh\ncat docs/a/X.md\n[t](../a/X.md)\n```\n[t](../a/X.md)\n';
  const out = rewriteMarkdown(md, 'docs/c/R.md', 'docs/c/R.md', fileMap);
  assert.equal(out, '```sh\ncat docs/b/X.md\n[t](../a/X.md)\n```\n[t](../b/X.md)\n');
});

test('markdown: a link destination is rewritten once, never twice', () => {
  // Root README link that is also a repo-root path string.
  const out = rewriteMarkdown('[t](docs/a/X.md) and docs/a/X.md\n', 'README.md', 'README.md', fileMap);
  assert.equal(out, '[t](docs/b/X.md) and docs/b/X.md\n');
});

test('markdown linksOnly (archive): prose paths stay as history', () => {
  const out = rewriteMarkdown('docs/a/X.md and [t](../../a/X.md)\n', 'docs/archive/c/R.md', 'docs/archive/c/R.md', fileMap, { linksOnly: true });
  assert.equal(out, 'docs/a/X.md and [t](../../b/X.md)\n');
});

test('pieced paths: quoted segments in two or more literals are found (H7)', () => {
  const keys = ['docs/exports/legal'];
  assert.equal(findPiecedPaths('join(root, "docs", "exports", "legal")', keys).length, 1);
  assert.equal(findPiecedPaths("path.join('docs/exports', 'legal')", keys).length, 1);
  assert.equal(findPiecedPaths('join(root, `docs`, `exports`, topic)', keys).length, 1);
  assert.equal(findPiecedPaths('const p = "docs/exports/legal"', keys).length, 0, 'whole path: rewritten, not a review hit');
  assert.equal(findPiecedPaths('const a = "legal"; const b = "other"', keys).length, 0);
  assert.equal(findPiecedPaths('join("exports", "x", "legal")', keys).length, 0, 'segments must be consecutive');
  const folder = findPiecedPaths('join(root, "docs", "legal")', ['docs/legal/TERMS.md', 'docs/legal/README.md', 'docs/legal']);
  assert.deepEqual(folder[0].paths, ['docs/legal'], 'a moved folder is named once, not every file in it');
});
