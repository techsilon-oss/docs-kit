// docs-kit — one-step setup (DESIGN §6.7). The same repo always gives the same plan.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { CONFIG_FILE, DEFAULTS, loadConfig, normalizeRel, parseConfig } from './config.mjs';
import { check, listDocFiles, selectPath } from './check.mjs';
import { trackedFiles } from './git.mjs';

export class InitError extends Error {
  constructor(message, { partial = false } = {}) {
    super(message);
    this.partial = partial;
  }
}

export const UPSTREAM = 'techsilon-oss/docs-kit';

// Doc maps at known places: { file, path } as docs-kit.json "docMaps" takes them.
const KNOWN_DOC_MAPS = [{ file: 'scripts/source-doc-map.json', path: 'mappings[].docs[]' }];

// Migration folders: applied migrations must never change (hazard H3).
const MIGRATION_DIRS = ['db/migrations/', 'migrations/', 'supabase/migrations/', 'prisma/migrations/', 'alembic/versions/'];

// Another tool's manifest that names docs-root files and vendored files.
const TOOL_MANIFEST = 'govkit.json';

const TEST_KINDS = { '.js': 'vitest', '.mjs': 'vitest', '.cjs': 'vitest', '.ts': 'vitest', '.mts': 'vitest', '.cts': 'vitest', '.py': 'pytest' };

function readJson(root, file) {
  const abs = join(root, file);
  if (!existsSync(abs)) return { missing: true };
  try {
    return { data: JSON.parse(readFileSync(abs, 'utf8')) };
  } catch (e) {
    return { error: e.message };
  }
}

function* strings(v) {
  if (typeof v === 'string') yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* strings(x);
}

/** Work out a starter docs-kit.json from the repo as it is today. */
export function detectConfig(root, docsRoot = DEFAULTS.docsRoot) {
  const notes = [];
  const rel = listDocFiles(root, docsRoot).map((f) => f.slice(docsRoot.length + 1));

  // Subjects: the folders already at the docs root; archive goes last.
  const dirs = [...new Set(rel.filter((r) => r.includes('/')).map((r) => r.split('/')[0]))].sort();
  const subjects = [...dirs.filter((d) => d !== 'archive'), ...dirs.filter((d) => d === 'archive')];

  // Docs-root files another tool expects, so that tool keeps working.
  const rootAllowed = ['README.md'];
  const immutablePrefixes = [];
  const manifest = readJson(root, TOOL_MANIFEST);
  if (manifest.data) {
    const prefix = `${docsRoot}/`;
    const named = new Set();
    for (const s of strings(manifest.data)) {
      if (s.startsWith(prefix) && !s.slice(prefix.length).includes('/') && s.length > prefix.length) named.add(s.slice(prefix.length));
    }
    for (const f of [...named].sort()) {
      if (!rootAllowed.includes(f)) {
        rootAllowed.push(f);
        notes.push(`rootAllowed: ${docsRoot}/${f} stays at the docs root, because ${TOOL_MANIFEST} names it`);
      }
    }
    // Files that tool vendors with a checksum: move must never edit them.
    const vendored = new Set(Object.keys(manifest.data.files || {}));
    for (const g of Object.values(manifest.data.guardrails || {})) {
      if (g && typeof g.vendoredHere === 'string') vendored.add(g.vendoredHere);
    }
    for (const f of [...vendored].map(normalizeRel).sort()) {
      immutablePrefixes.push(f);
    }
    if (vendored.size) notes.push(`immutablePrefixes: ${vendored.size} file(s) vendored by ${TOOL_MANIFEST}; move never edits them`);
  } else if (manifest.error) {
    notes.push(`${TOOL_MANIFEST}: not valid JSON, skipped (${manifest.error})`);
  }

  const migrations = MIGRATION_DIRS.filter((dir) => trackedFiles(root, [dir]).length);
  for (const dir of migrations) notes.push(`immutablePrefixes: ${dir} holds migrations; move never edits them (hazard H3)`);
  immutablePrefixes.unshift(...migrations);

  const docMaps = [];
  for (const m of KNOWN_DOC_MAPS) {
    const j = readJson(root, m.file);
    if (j.missing) continue;
    if (j.error) {
      notes.push(`docMaps: ${m.file} is not valid JSON, skipped (${j.error})`);
      continue;
    }
    const n = selectPath(j.data, m.path).filter((v) => typeof v === 'string').length;
    if (n) {
      docMaps.push({ ...m });
      notes.push(`docMaps: ${m.file} lists ${n} doc path(s) at ${m.path}; check keeps them existing`);
    } else {
      notes.push(`docMaps: ${m.file} selects no doc paths at ${m.path}, skipped`);
    }
  }

  // Snapshot topics: <subject>/snapshots/<topic>/...
  const snapshotTopics = {};
  for (const r of rel) {
    const m = /^([^/]+)\/snapshots\/([^/]+)\/[^/]+$/.exec(r);
    if (!m) continue;
    const [, subject, topic] = m;
    if (!(topic in snapshotTopics)) snapshotTopics[topic] = subject;
    else if (snapshotTopics[topic] !== subject) notes.push(`snapshotTopics: "${topic}" is under ${snapshotTopics[topic]} and ${subject}; kept ${snapshotTopics[topic]}`);
  }

  const config = {
    docsRoot,
    subjects,
    rootAllowed,
    rootAllowedTools: {},
    docMaps,
    protected: {},
    immutablePrefixes,
    snapshotTopics,
    howtoStaleDays: DEFAULTS.howtoStaleDays,
    snapshotStaleDays: DEFAULTS.snapshotStaleDays,
    roles: [],
  };
  return { config, notes, docFiles: rel.length };
}

const j = (v) => JSON.stringify(v);

/** docs-kit.json text: the detected values, one comment per key. */
export function renderConfig(cfg, version) {
  const lines = [
    `// docs-kit configuration, written by \`docs-kit init\` ${version}.`,
    `// Every key: https://github.com/${UPSTREAM}/blob/main/docs/DESIGN.md#5-configuration-docs-kitjson`,
    '// Comments and trailing commas are allowed.',
    '{',
    `  "docsRoot": ${j(cfg.docsRoot)},`,
    '  // One folder per subject at the docs root. Today\'s folders; a reorganisation renames them.',
    `  "subjects": ${j(cfg.subjects)},`,
    '  // Files allowed at the docs root besides the subject folders.',
    `  "rootAllowed": ${j(cfg.rootAllowed)},`,
    '  // Extra root entries another tool writes into, with the reason.',
    `  "rootAllowedTools": ${j(cfg.rootAllowedTools)},`,
    '  // JSON files that list doc paths which must exist.',
    `  "docMaps": ${j(cfg.docMaps)},`,
    '  // Paths that must never move, with the reason (hazard H2). Only you know these: add them.',
    `  "protected": ${j(cfg.protected)},`,
    '  // Files the mover never edits (hazard H3).',
    `  "immutablePrefixes": ${j(cfg.immutablePrefixes)},`,
    '  // Snapshot topic -> subject: <docsRoot>/<subject>/snapshots/<topic>/<TOPIC>_<YYYY-MM-DD>.md',
    `  "snapshotTopics": ${j(cfg.snapshotTopics)},`,
    `  "howtoStaleDays": ${cfg.howtoStaleDays},`,
    `  "snapshotStaleDays": ${cfg.snapshotStaleDays},`,
    '  // Roles that how-tos may name; `docs-kit index` lists the how-tos by role. Add yours.',
    `  "roles": ${j(cfg.roles)},`,
    '}',
    '',
  ];
  return lines.join('\n');
}

export function renderFrontDoor(subjects) {
  const list = subjects.filter((s) => s !== 'archive').map((s) => `- [${s}](${s}/README.md)`);
  return ['# Docs', '', 'Where to find things. Each subject folder has a README.md that maps it.', '',
    ...(list.length ? list : ['_No subjects yet._']), ''].join('\n');
}

/** Insert a key into an object, keeping alphabetical order when the keys were already sorted. */
function withKey(obj, key, value) {
  const keys = Object.keys(obj);
  const sorted = keys.every((k, i) => i === 0 || keys[i - 1].localeCompare(k) <= 0);
  const entries = [...Object.entries(obj), [key, value]];
  if (sorted) entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function planPackage(root, version, changes, notes) {
  const file = 'package.json';
  const abs = join(root, file);
  if (!existsSync(abs)) {
    notes.push(`${file}: none, so no devDependency or script was added; run docs-kit with npx github:${UPSTREAM}#v${version}`);
    return false;
  }
  const text = readFileSync(abs, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (e) {
    notes.push(`${file}: not valid JSON, left alone (${e.message})`);
    return false;
  }
  if (pkg.name === 'docs-kit') {
    changes.push({ path: file, action: 'skip', why: 'this is docs-kit itself' });
    return false;
  }
  const what = [];
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!('docs-kit' in deps)) {
    pkg.devDependencies = withKey(pkg.devDependencies || {}, 'docs-kit', `github:${UPSTREAM}#v${version}`);
    what.push(`devDependency docs-kit (github:${UPSTREAM}#v${version})`);
  }
  pkg.scripts = pkg.scripts || {};
  if (!('docs:check' in pkg.scripts)) {
    pkg.scripts = { ...pkg.scripts, 'docs:check': 'docs-kit check' };
    what.push('script docs:check');
  } else if (pkg.scripts['docs:check'] !== 'docs-kit check') {
    notes.push(`${file}: a "docs:check" script exists and was left alone`);
  }
  if (!what.length) {
    changes.push({ path: file, action: 'skip', why: 'already has docs-kit and docs:check' });
    return 'docs-kit' in deps;
  }
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = JSON.stringify(pkg, null, indent).replace(/\n/g, eol);
  if (/\r?\n$/.test(text)) out += eol;
  changes.push({ path: file, action: 'update', why: `add ${what.join(' and ')}`, content: out });
  return true;
}

function renderTest(kind, testFile, cli) {
  const depth = posix.dirname(testFile) === '.' ? 0 : posix.dirname(testFile).split('/').length;
  if (kind === 'vitest') {
    const up = depth ? '../'.repeat(depth) : './';
    const cmd = cli.npx
      ? `const r = spawnSync('npx', ['--yes', ${j(cli.npx)}, 'check'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });`
      : `const r = spawnSync(process.execPath, [${j(cli.path)}, 'check'], { cwd: ROOT, encoding: 'utf8' });`;
    return [
      '// The docs-kit layout check as a test. Written by `docs-kit init`.',
      "import { spawnSync } from 'node:child_process';",
      "import { fileURLToPath } from 'node:url';",
      "import { expect, test } from 'vitest';",
      '',
      `const ROOT = fileURLToPath(new URL(${j(up)}, import.meta.url));`,
      '',
      "test('docs/ follows the docs-kit layout', () => {",
      `  ${cmd}`,
      '  expect(r.status, r.stdout + r.stderr).toBe(0);',
      '});',
      '',
    ].join('\n');
  }
  const cmd = cli.npx ? `["npx", "--yes", ${j(cli.npx)}, "check"]` : `["node", ${j(cli.path)}, "check"]`;
  return [
    '# The docs-kit layout check as a test. Written by `docs-kit init`. Needs Node on the PATH.',
    'import shutil',
    'import subprocess',
    'from pathlib import Path',
    '',
    `ROOT = Path(__file__).resolve().parents[${depth}]`,
    '',
    '',
    'def test_docs_follow_the_docs_kit_layout():',
    `    cmd = ${cmd}`,
    '    cmd[0] = shutil.which(cmd[0]) or cmd[0]',
    '    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)',
    '    assert r.returncode == 0, r.stdout + r.stderr',
    '',
  ].join('\n');
}

/**
 * Plan the setup. Writes nothing.
 * @returns {{ config, configExists: boolean, changes: {path, action, why, content?}[], notes: string[] }}
 */
export function planInit(root, { docsRoot, testFile, version } = {}) {
  const changes = [];
  const existing = loadConfig(root);
  const D = docsRoot ? normalizeRel(docsRoot) : existing?.docsRoot ?? DEFAULTS.docsRoot;
  if (!D || D.startsWith('../') || D === '..' || posix.isAbsolute(D)) throw new InitError(`--docs-root must be a folder inside the repo, not "${docsRoot}"`);
  if (existing && docsRoot && existing.docsRoot !== D) {
    throw new InitError(`${CONFIG_FILE} already sets docsRoot "${existing.docsRoot}"; init does not change it`);
  }

  let config;
  let notes;
  if (existing) {
    config = existing;
    notes = [];
    changes.push({ path: CONFIG_FILE, action: 'skip', why: 'exists; init never overwrites it' });
  } else {
    ({ config, notes } = detectConfig(root, D));
    const content = renderConfig(config, version);
    parseConfig(content); // what we write must load
    changes.push({ path: CONFIG_FILE, action: 'create', why: `${config.subjects.length} subject(s) from the folders in ${D}/`, content });
  }

  const front = `${config.docsRoot}/README.md`;
  if (existsSync(join(root, front))) changes.push({ path: front, action: 'skip', why: 'exists' });
  else changes.push({ path: front, action: 'create', why: 'the front door', content: renderFrontDoor(config.subjects) });

  const hasDep = planPackage(root, version, changes, notes);

  if (testFile) {
    const t = normalizeRel(testFile);
    const kind = TEST_KINDS[posix.extname(t)];
    if (!kind) throw new InitError(`--test: "${testFile}" must end in .js, .mjs, .cjs, .ts, .mts, .cts (vitest) or .py (pytest)`);
    if (t.startsWith('../') || posix.isAbsolute(t)) throw new InitError(`--test must be a path inside the repo, not "${testFile}"`);
    if (existsSync(join(root, t))) {
      changes.push({ path: t, action: 'skip', why: 'exists', test: true });
    } else {
      const vendored = existsSync(join(root, 'scripts/docs-kit.mjs')) && !hasDep;
      const cli = vendored ? { path: 'scripts/docs-kit.mjs' }
        : hasDep ? { path: 'node_modules/docs-kit/scripts/docs-kit.mjs' }
          : { npx: `github:${UPSTREAM}#v${version}` };
      changes.push({ path: t, action: 'create', why: `the layout check as a ${kind} test`, content: renderTest(kind, t, cli), test: true });
    }
  }

  return { config, configExists: !!existing, changes, notes };
}

/** Write the planned files. Only files planned as create or update are touched. */
export function applyInit(root, plan, { only = () => true } = {}) {
  for (const c of plan.changes) {
    if (c.action === 'skip' || !only(c)) continue;
    const abs = join(root, c.path);
    if (c.action === 'create' && existsSync(abs)) throw new InitError(`${c.path} appeared while init ran; init stopped before writing it`, { partial: true });
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, c.content);
  }
}

/**
 * Plan, write (unless dryRun), and run the check with the configuration.
 * The test file is written only when the check passes: a failing test would
 * block every commit while the docs are being reorganised.
 */
export function runInit(root, { docsRoot, testFile, version, dryRun = false } = {}) {
  const plan = planInit(root, { docsRoot, testFile, version });
  if (!dryRun) applyInit(root, plan, { only: (c) => !c.test });
  const result = check(root, plan.config);
  if (dryRun) {
    // The front door init would create is not on disk yet.
    const front = plan.changes.find((c) => c.path === `${plan.config.docsRoot}/README.md` && c.action === 'create');
    if (front) result.errors = result.errors.filter((e) => !e.startsWith(`${front.path}: missing`));
    result.ok = result.errors.length === 0;
  }
  for (const c of plan.changes.filter((x) => x.test && x.action === 'create')) {
    if (!result.ok) {
      c.action = 'skip';
      c.why = 'not yet: the check fails, and a failing test would block every commit';
      c.deferred = true;
    } else if (!dryRun) {
      applyInit(root, plan, { only: (x) => x === c });
    }
  }
  return { plan, result };
}

export function formatInit(plan, { dryRun = false } = {}) {
  const lines = [dryRun ? 'docs-kit init --dry-run: nothing written. It would:' : 'docs-kit init:'];
  const verb = { create: dryRun ? 'create' : 'created', update: dryRun ? 'update' : 'updated', skip: 'skip   ' };
  for (const c of plan.changes) lines.push(`  ${verb[c.action].padEnd(7)}  ${c.path}  (${c.why})`);
  if (plan.notes.length) {
    lines.push('', 'Found:');
    for (const n of plan.notes) lines.push(`  - ${n}`);
  }
  return lines.join('\n');
}

/** What to do next, after the check ran with the configuration. */
export function nextSteps(plan, result) {
  const steps = [];
  if (plan.changes.some((c) => c.path === 'package.json' && c.action === 'update' && c.why.includes('devDependency'))) {
    steps.push('Run npm install, so the docs-kit devDependency is fetched.');
  }
  if (!plan.configExists) {
    steps.push(`Add to ${CONFIG_FILE} what only you know: "protected" paths (a doc path a database or another system uses as a key) and "roles" (who reads your how-tos).`);
  }
  const deferred = plan.changes.find((c) => c.deferred);
  if (deferred) {
    steps.push(`Once the check passes, add it to your tests: docs-kit init --test ${deferred.path}`);
  } else if (!plan.changes.some((c) => c.test)) {
    steps.push('Run the check in your tests: docs-kit init --test <file> (vitest .mjs/.ts or pytest .py).');
  }
  if (result && !result.ok) {
    steps.push('The check fails: expected while docs/ does not follow the layout yet. Reorganise with docs-kit move, following DESIGN §6.3. In Claude Code, /docs-kit-init explains each finding and guides the reorganisation.');
  }
  steps.push('Review the changes and commit them; init does not commit.');
  return ['', 'Next:', ...steps.map((s, i) => `  ${i + 1}. ${s}`)].join('\n');
}
