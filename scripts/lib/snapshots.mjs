// docs-kit — snapshot routing (DESIGN §6.6). A generator asks where a new
// snapshot goes, and archives the older ones, through these functions or the
// `docs-kit snapshot` command, so every generator follows one rule:
//   <docsRoot>/<subject>/snapshots/<topic>/<TOPIC>_<YYYY-MM-DD>.<ext>
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { SNAPSHOT_NAME } from './check.mjs';
import { checkIgnored, gitMv, trackedFiles } from './git.mjs';

export class SnapshotError extends Error {}

const TOPIC = /^[a-z0-9][a-z0-9-]*$/;

/** The folder of a configured topic. An unknown topic is an error, never a default folder. */
export function topicDir(cfg, topic) {
  if (!TOPIC.test(topic || '')) throw new SnapshotError(`"${topic}": a topic is lower case letters, digits and hyphens, for example "launch-readiness"`);
  const subject = cfg.snapshotTopics[topic];
  if (!subject) {
    const known = Object.keys(cfg.snapshotTopics);
    throw new SnapshotError(`unknown snapshot topic "${topic}"; add it to "snapshotTopics" in docs-kit.json (${known.length ? `known: ${known.join(', ')}` : 'none configured yet'})`);
  }
  return `${cfg.docsRoot}/${subject}/snapshots/${topic}`;
}

/** <TOPIC>_<YYYY-MM-DD>.<ext> */
export function snapshotName(topic, date, ext = 'md') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SnapshotError(`--date: "${date}" is not a YYYY-MM-DD date`);
  if (!/^[A-Za-z0-9]+$/.test(ext)) throw new SnapshotError(`--ext: "${ext}" is not a file extension, for example md or pdf`);
  return `${topic.toUpperCase()}_${date}.${ext}`;
}

/** Where today's snapshot of a topic goes, repo-root relative. */
export function snapshotPath(cfg, topic, { date, ext = 'md' } = {}) {
  return `${topicDir(cfg, topic)}/${snapshotName(topic, date, ext)}`;
}

/** True when git ignores the topic folder: its snapshots are made on demand and never committed. */
export function isLocalOnly(root, dir) {
  const probe = `${dir}/PROBE_2000-01-01.md`;
  return checkIgnored(root, [probe]).has(probe);
}

/**
 * Move every snapshot but the newest `keep` dates to
 * <docsRoot>/archive/<subject>/snapshots/<topic>/. It refuses any folder that is
 * not a configured snapshots/<topic>/ folder (hazard H1), and leaves alone any
 * file that is not a dated snapshot. An ignored file must still be ignored
 * after the move (hazard H4); the report lists any that are not.
 */
export function archiveOlder(root, cfg, dir, { keep = 1, dryRun = false } = {}) {
  const d = dir.replace(/\/+$/, '');
  const m = new RegExp(`^${cfg.docsRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/snapshots/([^/]+)$`).exec(d);
  if (!m || m[1] === 'archive' || cfg.snapshotTopics[m[2]] !== m[1]) {
    throw new SnapshotError(`refusing to archive "${dir}": only a configured ${cfg.docsRoot}/<subject>/snapshots/<topic>/ folder is archived (hazard H1)`);
  }
  if (!Number.isInteger(keep) || keep < 1) throw new SnapshotError(`--keep: "${keep}" must be a whole number, 1 or more`);
  const [, subject, topic] = m;
  const abs = join(root, d);
  const files = existsSync(abs) ? readdirSync(abs).filter((n) => statSync(join(abs, n)).isFile()) : [];
  const dated = [];
  const skipped = [];
  for (const name of files) {
    const s = SNAPSHOT_NAME.exec(name);
    if (s) dated.push({ name, date: s[1] });
    else skipped.push(`${d}/${name}`);
  }
  const keepDates = [...new Set(dated.map((x) => x.date))].sort().reverse().slice(0, keep);
  const dest = `${cfg.docsRoot}/archive/${subject}/snapshots/${topic}`;
  const tracked = new Set(trackedFiles(root, [d]));
  const moves = dated
    .filter((x) => !keepDates.includes(x.date))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((x) => ({ from: `${d}/${x.name}`, to: `${dest}/${x.name}` }))
    .map((mv) => ({ ...mv, tracked: tracked.has(mv.from) }));
  for (const mv of moves) {
    if (existsSync(join(root, mv.to))) throw new SnapshotError(`"${mv.to}": already exists in the archive; nothing was moved`);
  }
  const wasIgnored = checkIgnored(root, moves.map((mv) => mv.from));
  const report = { dir: d, kept: dated.filter((x) => keepDates.includes(x.date)).map((x) => `${d}/${x.name}`), moves, skipped, newlyVisible: [], dryRun };
  if (dryRun) return report;
  for (const mv of moves) {
    mkdirSync(join(root, posix.dirname(mv.to)), { recursive: true });
    if (mv.tracked) gitMv(root, mv.from, mv.to);
    else renameSync(join(root, mv.from), join(root, mv.to));
  }
  const ignoredDests = moves.filter((mv) => wasIgnored.has(mv.from)).map((mv) => mv.to);
  const stillIgnored = checkIgnored(root, ignoredDests);
  report.newlyVisible = ignoredDests.filter((p) => !stillIgnored.has(p));
  return report;
}

export function formatArchive(r) {
  const would = r.dryRun ? 'would ' : '';
  const lines = [`${r.dryRun ? 'DRY RUN: ' : ''}${r.dir}: keeps ${r.kept.length} file(s) of the newest date(s); ${r.moves.length} older file(s) ${would}move to the archive:`];
  for (const mv of r.moves) lines.push(`  ${mv.from} -> ${mv.to}${mv.tracked ? '' : '  (not tracked)'}`);
  if (r.skipped.length) {
    lines.push(`${r.skipped.length} file(s) left alone, because they are not dated snapshots (<TOPIC>_<YYYY-MM-DD>.<ext>):`);
    for (const f of r.skipped) lines.push(`  ${f}`);
  }
  if (r.newlyVisible.length) {
    lines.push(`DANGER: ${r.newlyVisible.length} file(s) that were ignored are no longer ignored in the archive. Add a .gitignore rule for them before you stage anything:`);
    for (const f of r.newlyVisible) lines.push(`  ${f}`);
  }
  return lines.join('\n');
}
