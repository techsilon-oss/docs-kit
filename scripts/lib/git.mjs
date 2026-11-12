// docs-kit — thin wrappers over the git CLI.
import { execFileSync } from 'node:child_process';

export function git(cwd, args, { input, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFail) return null;
    const msg = (err.stderr || err.message || '').toString().trim();
    throw new Error(`git ${args.join(' ')} failed: ${msg}`);
  }
}

export function repoRootOf(cwd) {
  const out = git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  return out ? out.trim() : null;
}

const splitZ = (s) => (s ? s.split('\0').filter(Boolean) : []);

/** Tracked files (repo-root relative, forward slashes). */
export function trackedFiles(root, paths = []) {
  return splitZ(git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z', '--', ...paths]));
}

/** Untracked files that are not ignored. */
export function untrackedFiles(root, paths = []) {
  return splitZ(git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z', '--others', '--exclude-standard', '--', ...paths]));
}

/** Untracked files that are ignored (for example confidential files). */
export function ignoredFiles(root, paths = []) {
  return splitZ(git(root, ['-c', 'core.quotepath=off', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...paths]));
}

/** Of the given paths, the ones git ignores. */
export function checkIgnored(root, paths) {
  if (!paths.length) return new Set();
  // Exit code 1 means "none ignored": not an error.
  const out = git(root, ['check-ignore', '-z', '--stdin'], { input: paths.join('\0') + '\0', allowFail: true });
  return new Set(splitZ(out || ''));
}

export function gitMv(root, from, to) {
  git(root, ['mv', '--', from, to]);
}

export function statusPorcelain(root) {
  return git(root, ['-c', 'core.quotepath=off', 'status', '--porcelain']);
}
