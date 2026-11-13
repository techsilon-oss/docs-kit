// docs-kit — layout check (DESIGN §6.1).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { frontMatter } from './frontmatter.mjs';
import { checkIgnored, repoRootOf, trackedFiles, untrackedFiles } from './git.mjs';
import { checkRoles } from './roles.mjs';

export const SNAPSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*_(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9]+$/;
export const PRINT_COPY_NAME = /^(.+)_v(\d+\.\d+)_(\d{4}-\d{2}-\d{2})\.(docx|pdf)$/;

const DAY_MS = 86_400_000;

/** Parse a YYYY-MM-DD string to a UTC timestamp, or null when it is not a real date. */
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t;
}

/**
 * Every file under docsRoot that git would consider (tracked plus untracked
 * and not ignored). Falls back to a filesystem walk outside a git repo.
 */
export function listDocFiles(root, docsRoot) {
  if (repoRootOf(root)) {
    const set = new Set([...trackedFiles(root, [docsRoot]), ...untrackedFiles(root, [docsRoot])]);
    // A tracked file deleted from the working tree is not there any more.
    return [...set].filter((f) => existsSync(join(root, f))).sort();
  }
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (existsSync(join(root, docsRoot))) walk(docsRoot);
  return out.sort();
}

/** Evaluate a docMaps path such as `mappings[].docs[]` against parsed JSON. */
export function selectPath(data, expr) {
  let values = [data];
  for (const part of expr.split('.').filter(Boolean)) {
    const m = /^([^[\]]*)((?:\[\])*)$/.exec(part);
    if (!m) throw new Error(`bad docMaps path segment "${part}" in "${expr}"`);
    const [, key, brackets] = m;
    if (key) values = values.map((v) => (v && typeof v === 'object' ? v[key] : undefined)).filter((v) => v !== undefined);
    for (let i = 0; i < brackets.length / 2; i++) {
      values = values.flatMap((v) => (Array.isArray(v) ? v : []));
    }
  }
  return values;
}

/**
 * Run the layout check.
 * @returns {{ errors: string[], warnings: string[], ok: boolean, stats: object }}
 */
export function check(root, cfg, { today = new Date() } = {}) {
  const errors = [];
  const warnings = [];
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const D = cfg.docsRoot;
  const stats = { docs: 0, docMapEntries: 0, snapshots: 0, howtos: 0, localOnlyTopics: [] };

  if (!existsSync(join(root, D)) || !statSync(join(root, D)).isDirectory()) {
    errors.push(`docs root "${D}/" does not exist`);
    return { errors, warnings, ok: false, stats };
  }

  const files = listDocFiles(root, D);
  stats.docs = files.length;
  // H10: a scan that reads nothing must fail, not pass.
  if (files.length === 0) {
    errors.push(`no files found under "${D}/" (a check that reads nothing does not pass)`);
    return { errors, warnings, ok: false, stats };
  }

  const rel = files.map((f) => f.slice(D.length + 1));
  const archiveDir = 'archive';

  // 1. Only allowed entries at the docs root.
  const allowedFiles = new Set(['README.md', ...cfg.rootAllowed]);
  const allowedTools = new Set(Object.keys(cfg.rootAllowedTools));
  const subjects = new Set(cfg.subjects);
  const rootFiles = new Set();
  const rootDirs = new Set();
  for (const r of rel) {
    const [head, ...rest] = r.split('/');
    (rest.length ? rootDirs : rootFiles).add(head);
  }
  for (const f of [...rootFiles].sort()) {
    if (!allowedFiles.has(f) && !allowedTools.has(f)) {
      errors.push(`${D}/${f}: not allowed at the docs root (allowed: README.md, rootAllowed, rootAllowedTools)`);
    }
  }
  for (const d of [...rootDirs].sort()) {
    if (!subjects.has(d) && !allowedTools.has(d) && !allowedFiles.has(d)) {
      errors.push(`${D}/${d}/: folder is not a configured subject`);
    }
  }
  if (!rootFiles.has('README.md')) errors.push(`${D}/README.md: missing (the front door)`);

  // 2. Every subject folder has a README.md.
  for (const s of cfg.subjects) {
    if (!rootDirs.has(s)) {
      warnings.push(`${D}/${s}/: configured subject has no files yet`);
      continue;
    }
    if (!rootFiles.has(s) && !rel.includes(`${s}/README.md`)) errors.push(`${D}/${s}/README.md: missing (every subject folder needs a map)`);
  }

  // Rule 4: no separate exports/ tree (archive is history and is not checked).
  const exportDirs = new Set();
  for (const r of rel) {
    if (r.startsWith(`${archiveDir}/`)) continue;
    const parts = r.split('/');
    const i = parts.indexOf('exports');
    if (i !== -1 && i < parts.length - 1) exportDirs.add(parts.slice(0, i + 1).join('/'));
  }
  for (const e of exportDirs) errors.push(`${D}/${e}/: no exports/ tree; generated docs go to <subject>/snapshots/<topic>/`);

  // Rule 6: archive mirrors the live tree.
  const archiveSubjects = new Set();
  for (const r of rel) {
    const parts = r.split('/');
    if (parts[0] !== archiveDir) continue;
    if (parts.length === 2) {
      if (parts[1] !== 'README.md') warnings.push(`${D}/${r}: archive files go under archive/<subject>/`);
    } else {
      archiveSubjects.add(parts[1]);
    }
  }
  for (const s of [...archiveSubjects].sort()) {
    if (!subjects.has(s)) warnings.push(`${D}/${archiveDir}/${s}/: not a configured subject (archive mirrors the live tree)`);
  }

  // 3. Every doc named in a configured doc map exists.
  for (const map of cfg.docMaps) {
    const mapPath = join(root, map.file);
    if (!existsSync(mapPath)) {
      errors.push(`${map.file}: doc map file not found`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(mapPath, 'utf8'));
    } catch (err) {
      errors.push(`${map.file}: not valid JSON (${err.message})`);
      continue;
    }
    let values;
    try {
      values = selectPath(data, map.path);
    } catch (err) {
      errors.push(`${map.file}: ${err.message}`);
      continue;
    }
    // H10: a map path that selects nothing is a broken check, not a pass.
    if (values.length === 0) {
      errors.push(`${map.file}: "${map.path}" selects no doc paths (a check that reads nothing does not pass)`);
      continue;
    }
    for (const v of values) {
      if (typeof v !== 'string') {
        errors.push(`${map.file}: "${map.path}" selected a non-string value ${JSON.stringify(v)}`);
        continue;
      }
      stats.docMapEntries++;
      if (!existsSync(join(root, v))) errors.push(`${map.file}: names "${v}", which does not exist`);
    }
  }

  // Snapshots: H1 (own folder, only snapshots in it) and H6 (date from the file name).
  const snapshotGroups = new Map(); // "<subject>/snapshots/<topic>" -> [{name, t}]
  for (const r of rel) {
    if (r.startsWith(`${archiveDir}/`)) continue;
    const parts = r.split('/');
    const si = parts.indexOf('snapshots');
    if (si === -1 || si === parts.length - 1) continue;
    const name = parts[parts.length - 1];
    if (name === 'README.md' && parts.length - si <= 3) continue;
    if (parts.length - si !== 3) {
      errors.push(`${D}/${r}: snapshots go in ${parts.slice(0, si + 1).join('/')}/<topic>/<TOPIC>_<YYYY-MM-DD>.<ext>`);
      continue;
    }
    const m = SNAPSHOT_NAME.exec(name);
    const t = m && parseDate(m[1]);
    if (!t) {
      // H1: a generator that archives "every other file" in this folder would take this one.
      errors.push(`${D}/${r}: not a dated snapshot (<TOPIC>_<YYYY-MM-DD>.<ext>); only generated snapshots belong in a snapshots/<topic>/ folder`);
      continue;
    }
    const key = parts.slice(0, si + 2).join('/');
    if (!snapshotGroups.has(key)) snapshotGroups.set(key, []);
    snapshotGroups.get(key).push({ name, t });
    stats.snapshots++;
  }
  for (const [topic, subject] of Object.entries(cfg.snapshotTopics)) {
    const key = `${subject}/snapshots/${topic}`;
    // A topic whose folder git ignores is made on demand and never committed: CI cannot see its
    // snapshots, so it is reported as local-only instead of failing H10.
    const probe = `${D}/${key}/PROBE_2000-01-01.md`;
    if (repoRootOf(root) && checkIgnored(root, [probe]).has(probe)) {
      stats.localOnlyTopics.push(topic);
      continue;
    }
    if (!snapshotGroups.has(key)) {
      // H10: a configured snapshot topic with no snapshots means a path changed or the generator stopped.
      errors.push(`${D}/${key}/: snapshot topic "${topic}" is configured but has no dated snapshots`);
    }
  }
  for (const [key, list] of snapshotGroups) {
    const newest = Math.max(...list.map((s) => s.t));
    const age = Math.floor((todayMs - newest) / DAY_MS);
    if (age > cfg.snapshotStaleDays) {
      warnings.push(`${D}/${key}/: newest snapshot is ${age} days old (by file name; limit ${cfg.snapshotStaleDays})`);
    }
  }

  // How-tos: last_checked older than howtoStaleDays.
  for (const r of rel) {
    if (r.startsWith(`${archiveDir}/`)) continue;
    const parts = r.split('/');
    if (parts[parts.length - 2] !== 'howto') continue;
    const name = parts[parts.length - 1];
    if (name === 'README.md') continue;
    if (!/^HOWTO-.+\.md$/.test(name)) {
      warnings.push(`${D}/${r}: how-tos are named HOWTO-<task>.md`);
      continue;
    }
    stats.howtos++;
    const fm = frontMatter(readFileSync(join(root, D, r), 'utf8'));
    const t = parseDate(fm.last_checked);
    if (!t) {
      warnings.push(`${D}/${r}: no valid last_checked: YYYY-MM-DD in the front matter`);
      continue;
    }
    const age = Math.floor((todayMs - t) / DAY_MS);
    if (age > cfg.howtoStaleDays) warnings.push(`${D}/${r}: last_checked ${fm.last_checked} is ${age} days old (limit ${cfg.howtoStaleDays})`);
  }

  // Rule 5: print copies beside their source, newest only.
  const prints = new Map();
  for (const r of rel) {
    if (r.startsWith(`${archiveDir}/`)) continue;
    const name = posix.basename(r);
    const m = PRINT_COPY_NAME.exec(name);
    if (!m) continue;
    const dir = posix.dirname(r);
    const base = `${dir}/${m[1]}`;
    if (!rel.includes(`${base}.md`.replace(/^\.\//, ''))) warnings.push(`${D}/${r}: print copy has no source ${D}/${base.replace(/^\.\//, '')}.md beside it`);
    const key = `${base}|${m[4]}`;
    if (!prints.has(key)) prints.set(key, []);
    prints.get(key).push(name);
  }
  for (const [key, names] of prints) {
    if (names.length > 1) warnings.push(`${D}/${key.split('|')[0]}: ${names.length} .${key.split('|')[1]} print copies; only the newest stays (${names.sort().join(', ')})`);
  }

  // How-tos by role (DESIGN §4.1).
  const roles = checkRoles(root, cfg, rel);
  errors.push(...roles.errors);
  warnings.push(...roles.warnings);

  return { errors, warnings, ok: errors.length === 0, stats };
}

export function formatCheck(result, D = 'docs') {
  const lines = [];
  for (const e of result.errors) lines.push(`ERROR   ${e}`);
  for (const w of result.warnings) lines.push(`WARNING ${w}`);
  const s = result.stats;
  lines.push(
    result.ok
      ? `docs-kit check: OK (${s.docs} files under ${D}/, ${s.docMapEntries} doc-map entries, ${s.snapshots} snapshots, ${s.howtos} how-tos; ${result.warnings.length} warning(s))${s.localOnlyTopics?.length ? `\nNot checked: ${s.localOnlyTopics.length} snapshot topic(s) whose folder git ignores (made on demand, never committed): ${s.localOnlyTopics.join(', ')}` : ''}`
      : `docs-kit check: FAILED with ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
  );
  return lines.join('\n');
}
