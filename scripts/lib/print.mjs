// docs-kit — print copies (DESIGN §6.5): .docx and .pdf beside the source,
// named <NAME>_v<X.Y>_<YYYY-MM-DD>, newest only. pandoc does the work; when
// it is not installed, printing is skipped with a message, never an error.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, posix } from 'node:path';
import { normalizeRel } from './config.mjs';
import { PRINT_COPY_NAME } from './check.mjs';

export class PrintError extends Error {}

export const FORMATS = ['docx', 'pdf'];

// A table with more columns than this may run off a portrait page. Long
// prose in a few columns wraps, so row length alone is not a warning.
const MAX_COLUMNS = 5;

const isoDay = (d) => d.toISOString().slice(0, 10);

/** The pandoc to run: DOCS_KIT_PANDOC, else pandoc on the PATH; null when there is none. */
export function findPandoc(env = process.env, run = spawnSync) {
  const cmd = env.DOCS_KIT_PANDOC || 'pandoc';
  const r = run(cmd, ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return { cmd, version: (r.stdout || '').split(/\r?\n/)[0].trim() };
}

/** Pipe tables with too many columns for a page: { line, columns } for each. */
export function wideTables(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = /^[ ]{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (fence) { if (f && f[1][0] === fence[0]) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    // A table starts at a header row followed by a delimiter row.
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '') || !lines[i].includes('|')) continue;
    const columns = lines[i + 1].split('|').filter((c) => c.trim()).length;
    let j = i;
    while (j < lines.length && lines[j].includes('|')) j++;
    if (columns > MAX_COLUMNS) out.push({ line: i + 1, columns });
    i = j - 1;
  }
  return out;
}

/**
 * Work out the print: names, version, the older copies to remove. Writes nothing.
 * The version is --version, else the newest copy's version one minor up, else 1.0.
 */
export function planPrint(root, file, { version, today = new Date() } = {}) {
  const src = normalizeRel(file);
  if (!src || src.startsWith('../') || posix.isAbsolute(src) || /^[A-Za-z]:/.test(src)) throw new PrintError(`"${file}": the source must be a path inside the repo`);
  if (!/\.md$/i.test(src)) throw new PrintError(`"${file}": the source must be a Markdown file (.md)`);
  if (!existsSync(join(root, src))) throw new PrintError(`"${src}": does not exist`);
  if (version !== undefined && !/^\d+\.\d+$/.test(version)) throw new PrintError(`--version: "${version}" is not X.Y, for example 1.2`);

  const dir = posix.dirname(src);
  const base = posix.basename(src).replace(/\.md$/i, '');
  const existing = readdirSync(join(root, dir))
    .map((name) => ({ name, m: PRINT_COPY_NAME.exec(name) }))
    .filter((x) => x.m && x.m[1] === base)
    .map((x) => ({ path: dir === '.' ? x.name : `${dir}/${x.name}`, version: x.m[2], date: x.m[3], format: x.m[4] }));

  let v = version;
  if (!v) {
    const newest = existing.map((e) => e.version.split('.').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0];
    v = newest ? `${newest[0]}.${newest[1] + 1}` : '1.0';
  }
  const date = isoDay(today);
  const outputs = FORMATS.map((format) => {
    const name = `${base}_v${v}_${date}.${format}`;
    return { format, path: dir === '.' ? name : `${dir}/${name}` };
  });
  const older = existing.filter((e) => !outputs.some((o) => o.path === e.path));
  const wide = wideTables(readFileSync(join(root, src), 'utf8'));
  return { source: src, version: v, date, outputs, older, wide };
}

/**
 * Make the print copies. Each format that pandoc makes replaces the older
 * copies of that format; a format that fails keeps them.
 */
export function print(root, file, { version, today, pandoc, run = spawnSync } = {}) {
  const plan = planPrint(root, file, { version, today });
  const report = { ...plan, pandoc: pandoc ?? null, made: [], failed: [], removed: [], skipped: false };
  if (!pandoc) {
    report.skipped = true;
    return report;
  }
  const cwd = join(root, posix.dirname(plan.source));
  for (const o of plan.outputs) {
    const r = run(pandoc.cmd, [posix.basename(plan.source), '-o', posix.basename(o.path), '--resource-path=.'], { cwd, encoding: 'utf8' });
    if (r.error || r.status !== 0 || !existsSync(join(root, o.path))) {
      const why = (r.error?.message || r.stderr || `exit ${r.status}`).toString().trim().split(/\r?\n/)[0];
      report.failed.push({ ...o, why });
      continue;
    }
    report.made.push(o);
    for (const old of plan.older.filter((e) => e.format === o.format)) {
      unlinkSync(join(root, old.path));
      report.removed.push(old.path);
    }
  }
  return report;
}

export function formatPrint(r) {
  const lines = [];
  if (r.skipped) {
    lines.push(`docs-kit print: skipped, pandoc is not installed. Nothing was printed. Install pandoc (https://pandoc.org/installing.html), or set DOCS_KIT_PANDOC to its path.`);
    lines.push(`  It would make: ${r.outputs.map((o) => o.path).join(', ')}`);
  } else {
    lines.push(`docs-kit print: ${r.source}, version ${r.version}, ${r.date} (${r.pandoc.version}):`);
    for (const o of r.made) lines.push(`  made     ${o.path}`);
    for (const o of r.failed) lines.push(`  FAILED   ${o.path}  (${o.why})${o.format === 'pdf' ? '; pandoc needs a PDF engine for .pdf, for example a LaTeX install' : ''}`);
    for (const p of r.removed) lines.push(`  removed  ${p}  (an older print copy)`);
  }
  for (const w of r.wide) lines.push(`WARNING ${r.source}:${w.line}: a table with ${w.columns} columns may run off the page; split it, or check the PDF`);
  if (r.made.length) lines.push('Open the PDF and check page 1 and every wide table.');
  return lines.join('\n');
}
