// Run the docs-kit layout check as a vitest test.
// Point CLI at your copy: vendored (scripts/docs-kit.mjs) or node_modules/docs-kit/scripts/docs-kit.mjs.
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

const CLI = 'scripts/docs-kit.mjs';

test('docs/ follows the docs-kit layout', () => {
  const r = spawnSync(process.execPath, [CLI, 'check'], { encoding: 'utf8' });
  expect(r.status, r.stdout + r.stderr).toBe(0);
});
