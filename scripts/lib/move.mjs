// docs-kit — the mover (DESIGN §6.2).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { DEFAULTS, normalizeRel } from './config.mjs';
import { checkIgnored, gitMv, ignoredFiles, statusPorcelain, trackedFiles, untrackedFiles } from './git.mjs';
import { PathMap, findOldNames, findPiecedPaths, rewriteMarkdown, replaceRootPaths, rootPathRegex } from './rewrite.mjs';

export class MoveError extends Error {}

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

const under = (p, dir) => p === dir || p.startsWith(dir + '/');
const underPrefix = (p, prefix) => (prefix.endsWith('/') ? p.startsWith(prefix) : under(p, prefix));

function readText(root, file) {
  const abs = join(root, file);
  let st;
  try { st = statSync(abs); } catch { return null; }
  if (!st.isFile() || st.size > MAX_TEXT_BYTES) return null;
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null; // binary
  return buf.toString('utf8');
}

/**
 * Validate the pairs and expand folders into file-by-file moves (hazard H5).
 */
export function planMoves(root, pairs, cfg = DEFAULTS) {
  if (!pairs.length) throw new MoveError('nothing to move');
  const tracked = new Set(trackedFiles(root));
  const filePairs = [];
  const dirPairs = [];
  const ignoredMoves = [];
  const seenDest = new Map();

  for (const [rawFrom, rawTo] of pairs) {
    const from = normalizeRel(rawFrom);
    const to = normalizeRel(rawTo);
    for (const p of [from, to]) {
      if (!p || posix.isAbsolute(p) || /^[A-Za-z]:/.test(p) || posix.normalize(p).startsWith('..')) {
        throw new MoveError(`"${p}": paths must be relative to the repo root and inside it`);
      }
    }
    if (from === to) throw new MoveError(`"${from}": source and destination are the same`);
    if (under(to, from)) throw new MoveError(`"${to}": cannot move a path inside itself`);

    // H2: protected paths never move, and nothing inside them moves.
    for (const [p, reason] of Object.entries(cfg.protected)) {
      if (under(from, p) || under(p, from)) {
        throw new MoveError(`refusing to move "${from}": "${p}" is protected (${reason})`);
      }
    }
    // H3: files under immutablePrefixes are never edited, and moving them edits them.
    for (const prefix of cfg.immutablePrefixes) {
      if (underPrefix(from, prefix) || underPrefix(prefix.replace(/\/$/, ''), from)) {
        throw new MoveError(`refusing to move "${from}": it holds immutable files ("${prefix}")`);
      }
    }

    const abs = join(root, from);
    if (!existsSync(abs)) throw new MoveError(`"${from}": does not exist`);

    let files;
    if (statSync(abs).isDirectory()) {
      dirPairs.push([from, to]);
      const t = trackedFiles(root, [from]).filter((f) => existsSync(join(root, f)));
      const u = untrackedFiles(root, [from]);
      const ig = ignoredFiles(root, [from]);
      files = [...t.map((f) => [f, true]), ...u.map((f) => [f, false]), ...ig.map((f) => [f, false])];
      for (const f of ig) ignoredMoves.push([f, to + f.slice(from.length)]);
      if (!files.length) throw new MoveError(`"${from}": folder has no files to move`);
    } else {
      files = [[from, tracked.has(from)]];
      if (!tracked.has(from) && checkIgnored(root, [from]).size) ignoredMoves.push([from, to]);
    }

    for (const [f, isTracked] of files) {
      const dest = f === from ? to : to + f.slice(from.length);
      if (existsSync(join(root, dest))) throw new MoveError(`"${dest}": destination already exists`);
      if (seenDest.has(dest)) throw new MoveError(`"${dest}": two sources move to the same place`);
      seenDest.set(dest, f);
      filePairs.push({ from: f, to: dest, tracked: isTracked });
    }
  }

  const sources = new Set(filePairs.map((p) => p.from));
  for (const p of filePairs) {
    if (sources.has(p.to)) throw new MoveError(`"${p.to}": is both a source and a destination; move in two steps`);
  }

  const pathMap = new PathMap(filePairs.map((p) => [p.from, p.to]), dirPairs);
  return { filePairs, dirPairs, ignoredMoves, pathMap };
}

/**
 * Work out every text change the move needs, without touching the disk.
 */
export function planRewrites(root, plan, cfg = DEFAULTS) {
  const { pathMap } = plan;
  const keys = pathMap.keys();
  const rootRe = rootPathRegex(keys);
  const archiveRoot = `${cfg.docsRoot}/archive`;
  const rewrites = []; // { oldPath, newPath, content }
  const immutableHits = [];
  const piecedHits = [];
  const nameHits = [];
  // H12: the old names of files whose name changes, not only their folder.
  const oldNames = [...new Set(plan.filePairs.filter((p) => posix.basename(p.from) !== posix.basename(p.to)).map((p) => posix.basename(p.from)))];
  const scanNames = (file, text) => { for (const h of findOldNames(text, oldNames)) nameHits.push({ file, ...h }); };

  for (const file of trackedFiles(root)) {
    const text = readText(root, file);
    if (text === null) continue;
    const newPath = pathMap.map(file);

    for (const h of findPiecedPaths(text, keys)) piecedHits.push({ file, ...h });

    if (cfg.immutablePrefixes.some((p) => underPrefix(file, p))) {
      if (rootRe) {
        rootRe.lastIndex = 0;
        if (rootRe.test(text)) immutableHits.push(file);
      }
      scanNames(newPath, text);
      continue;
    }

    const inArchive = under(file, archiveRoot);
    let next;
    if (MARKDOWN.test(file)) {
      next = rewriteMarkdown(text, file, newPath, pathMap, { linksOnly: inArchive, rootRe });
    } else if (inArchive) {
      next = text;
    } else {
      next = replaceRootPaths(text, pathMap, rootRe);
    }
    if (next !== text) rewrites.push({ oldPath: file, newPath, content: next });
    scanNames(newPath, next);
  }
  return { rewrites, immutableHits, piecedHits, nameHits };
}

function removeEmptyDirs(root, dir, stopAt, warnings) {
  let d = dir;
  while (d && d !== '.' && d !== stopAt && !under(stopAt, d)) {
    const abs = join(root, d);
    try {
      if (!existsSync(abs) || readdirSync(abs).length) break;
      rmdirSync(abs);
    } catch (err) {
      // H5: Windows may hold the folder open; the files moved, so this is only a warning.
      warnings.push(`could not remove empty folder "${d}" (${err.code || err.message}); remove it later`);
      break;
    }
    d = posix.dirname(d);
  }
}

/**
 * Move docs and keep every reference working.
 * @returns a report object; see formatMove.
 */
export function move(root, pairs, { cfg = DEFAULTS, dryRun = false } = {}) {
  const plan = planMoves(root, pairs, cfg);
  const { rewrites, immutableHits, piecedHits, nameHits } = planRewrites(root, plan, cfg);
  const report = {
    dryRun,
    moves: plan.filePairs,
    rewritten: rewrites.map((r) => r.newPath),
    immutableHits,
    piecedHits,
    nameHits,
    ignoredMoves: plan.ignoredMoves,
    newlyVisible: [],
    warnings: [],
    status: '',
  };
  if (dryRun) return report;

  // H5: one file at a time, never a whole-folder rename.
  for (const p of plan.filePairs) {
    mkdirSync(join(root, posix.dirname(p.to)), { recursive: true });
    if (p.tracked) gitMv(root, p.from, p.to);
    else renameSync(join(root, p.from), join(root, p.to));
  }
  for (const r of rewrites) writeFileSync(join(root, r.newPath), r.content);

  const emptied = new Set(plan.filePairs.map((p) => posix.dirname(p.from)));
  for (const d of [...emptied].sort((a, b) => b.length - a.length)) removeEmptyDirs(root, d, cfg.docsRoot, report.warnings);

  // H4: a confidential file that was ignored before the move must still be ignored after it.
  const dests = plan.ignoredMoves.map(([, to]) => to);
  const stillIgnored = checkIgnored(root, dests);
  report.newlyVisible = dests.filter((d) => !stillIgnored.has(d));

  // H9: the caller sees every change, including files outside docs/.
  report.status = statusPorcelain(root);
  return report;
}

export function formatMove(r) {
  const would = r.dryRun ? 'would ' : '';
  const lines = [];
  lines.push(`${r.dryRun ? 'DRY RUN: ' : ''}${r.moves.length} file(s) ${would}move:`);
  for (const m of r.moves) lines.push(`  ${m.from} -> ${m.to}${m.tracked ? '' : '  (untracked)'}`);
  lines.push(`${r.rewritten.length} file(s) ${would}change to keep links and paths working:`);
  for (const f of r.rewritten) lines.push(`  ${f}`);
  if (r.ignoredMoves.length) {
    lines.push(`${r.ignoredMoves.length} ignored file(s) ${would}move (check they stay ignored):`);
    for (const [f, t] of r.ignoredMoves) lines.push(`  ${f} -> ${t}`);
  }
  if (r.immutableHits.length) {
    lines.push(`${r.immutableHits.length} immutable file(s) name a moved path and were left unchanged:`);
    for (const f of r.immutableHits) lines.push(`  ${f}`);
  }
  if (r.piecedHits.length) {
    lines.push(`REVIEW: ${r.piecedHits.length} line(s) may build a moved path in pieces; not rewritten, fix by hand:`);
    for (const h of r.piecedHits) lines.push(`  ${h.file}:${h.line}: ${h.text}   [${h.paths.join(', ')}]`);
  }
  if (r.nameHits.length) {
    lines.push(`REVIEW: ${r.nameHits.length} line(s) name a renamed file by its old name alone; not rewritten, fix by hand:`);
    for (const h of r.nameHits) lines.push(`  ${h.file}:${h.line}: ${h.text}   [${h.names.join(', ')}]`);
  }
  for (const w of r.warnings) lines.push(`WARNING ${w}`);
  if (r.newlyVisible.length) {
    lines.push(`DANGER: ${r.newlyVisible.length} file(s) that were ignored are no longer ignored. Fix .gitignore before you stage anything:`);
    for (const f of r.newlyVisible) lines.push(`  ${f}`);
  }
  if (!r.dryRun) {
    lines.push('Stage every changed file below, not only the docs folders (git status --porcelain):');
    lines.push(r.status.trimEnd() || '  (clean)');
  }
  return lines.join('\n');
}
