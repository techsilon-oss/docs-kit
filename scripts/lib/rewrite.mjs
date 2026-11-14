// docs-kit — reference rewriting used by the mover (DESIGN §6.2).
import { posix } from 'node:path';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A path map built from move pairs. Files map exactly; folders map as prefixes.
 * `map(p)` returns the new path for p, or p when it did not move.
 */
export class PathMap {
  constructor(filePairs, dirPairs) {
    this.files = new Map(filePairs);
    // Longest prefix first, so docs/a/b wins over docs/a.
    this.dirs = [...dirPairs].sort((a, b) => b[0].length - a[0].length);
  }
  map(p) {
    const clean = p.replace(/\/+$/, '');
    if (this.files.has(clean)) return this.files.get(clean);
    for (const [from, to] of this.dirs) {
      if (clean === from) return to;
      if (clean.startsWith(from + '/')) return to + clean.slice(from.length);
    }
    return clean;
  }
  moved(p) {
    return this.map(p) !== p.replace(/\/+$/, '');
  }
  /** Every old path (files and folders), longest first. */
  keys() {
    return [...new Set([...this.files.keys(), ...this.dirs.map(([f]) => f)])].sort((a, b) => b.length - a.length);
  }
}

/*
 * Repo-root path strings (DESIGN §6.2 step 3).
 *
 * Before the path: a boundary (start, space, quote, bracket ...), a leading "/"
 * (as in .gitignore "/docs/x"), "./" or "../" chains, or a GitHub
 * blob/tree/raw URL. Not another path segment: "packages/web/docs/x" is a
 * different docs folder.
 *
 * After the path: "/" (something inside a moved folder), or a boundary. A
 * boundary includes punctuation that ends a sentence or clause, such as
 * "see docs/x/A.md." (hazard H8), as long as no path character follows it.
 */
const PATH_CHAR = 'A-Za-z0-9_\\-.~%+@';
const BEFORE = `(?<=^|[^${PATH_CHAR}/]|(?:^|[^${PATH_CHAR}/])\\/|(?:^|[^${PATH_CHAR}])(?:\\.\\.?\\/)+|\\/(?:blob|tree|raw)\\/[^/\\s]+\\/)`;
const AFTER = `(?=\\/|$|[^${PATH_CHAR}/]|[.,;:!?](?![${PATH_CHAR}/]))`;

export function rootPathRegex(keys) {
  if (!keys.length) return null;
  return new RegExp(`${BEFORE}(${keys.map(escapeRe).join('|')})${AFTER}`, 'gm');
}

export function replaceRootPaths(text, pathMap, re = rootPathRegex(pathMap.keys())) {
  if (!re) return text;
  re.lastIndex = 0;
  return text.replace(re, (m) => pathMap.map(m));
}

/* Markdown links: inline [t](dest "title"), images, reference definitions, and href/src in HTML. */
const INLINE_LINK = /(!?\[(?:[^\]\\\n]|\\.)*\])\(([ \t]*)(<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)([^)\n]*)\)/g;
const REF_DEF = /^([ ]{0,3}\[(?:[^\]\\\n]|\\.)+\]:[ \t]*)(<[^>\n]*>|\S+)/gm;
const HTML_ATTR = /(\b(?:href|src)=)(["'])([^"'\n]*)\2/g;

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Rewrite one link destination.
 * @param dest     the destination as written (may be <...> or %-encoded)
 * @param oldFile  repo path of the file containing the link, before the move
 * @param newFile  repo path of that file after the move
 * @param onlyMovedTargets  when true, rewrite only when the target moved (archive rule)
 */
export function rewriteDest(dest, oldFile, newFile, pathMap, { onlyMovedTargets = false } = {}) {
  const angle = dest.startsWith('<') && dest.endsWith('>');
  const raw = angle ? dest.slice(1, -1) : dest;
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || SCHEME.test(raw)) return dest;
  const cut = raw.search(/[?#]/);
  const pathPart = cut === -1 ? raw : raw.slice(0, cut);
  const suffix = cut === -1 ? '' : raw.slice(cut);
  if (!pathPart) return dest;
  let decoded = pathPart;
  try { decoded = decodeURI(pathPart); } catch { /* keep as written */ }
  const resolved = posix.normalize(posix.join(posix.dirname(oldFile), decoded));
  if (resolved.startsWith('../') || resolved === '..') return dest;
  const target = pathMap.map(resolved);
  const targetMoved = target !== resolved.replace(/\/+$/, '');
  const fileMoved = oldFile !== newFile;
  if (!targetMoved && (onlyMovedTargets || !fileMoved)) return dest;
  let rel = posix.relative(posix.dirname(newFile), target) || '.';
  if (pathPart.endsWith('/') && !rel.endsWith('/')) rel += '/';
  if (/^\.\//.test(pathPart) && !rel.startsWith('.')) rel = './' + rel;
  if (pathPart !== decoded) rel = encodeURI(rel);
  else if (!angle && /\s/.test(rel)) rel = rel.replace(/ /g, '%20');
  const out = rel + suffix;
  return angle ? `<${out}>` : out;
}

/**
 * Rewrite a Markdown file: relative links (resolved from the file's old
 * location) and, unless `linksOnly`, repo-root path strings in the rest of
 * the text. Link destinations are handled once, by the link logic, so the
 * root-path pass never sees them.
 */
export function rewriteMarkdown(text, oldFile, newFile, pathMap, { linksOnly = false, rootRe } = {}) {
  const slots = [];
  const hold = (s) => `\u0000${slots.push(s) - 1}\u0000`;
  const opts = { onlyMovedTargets: linksOnly };
  const lines = text.split(/(?<=\n)/);
  let fence = null;
  const out = [];
  for (const line of lines) {
    const f = /^[ ]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (f) { fence = f[1]; out.push(line); continue; }
    let l = line.replace(INLINE_LINK, (m, label, sp, dest, rest) => {
      const next = rewriteDest(dest, oldFile, newFile, pathMap, opts);
      return `${renamedLabel(label, dest, next, oldFile, pathMap)}(${sp}${hold(next)}${rest})`;
    });
    l = l.replace(REF_DEF, (m, head, dest) => head + hold(rewriteDest(dest, oldFile, newFile, pathMap, opts)));
    l = l.replace(HTML_ATTR, (m, attr, q, dest) => `${attr}${q}${hold(rewriteDest(dest, oldFile, newFile, pathMap, opts))}${q}`);
    out.push(l);
  }
  let joined = out.join('');
  if (!linksOnly) joined = replaceRootPaths(joined, pathMap, rootRe);
  return joined.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[+i]);
}

/**
 * A link label that shows the target's old name, when the move renames the
 * target (hazard H12): [OLD.md](OLD.md) becomes [NEW.md](NEW.md). Only a label
 * that is exactly the old file name, the old destination or the old repo path
 * (optionally in backticks) changes; any other label is left as written.
 */
export function renamedLabel(label, dest, nextDest, oldFile, pathMap) {
  if (nextDest === dest) return label;
  const raw = dest.replace(/^<|>$/g, '').replace(/[?#].*$/, '');
  let decoded = raw;
  try { decoded = decodeURI(raw); } catch { /* keep as written */ }
  const resolved = posix.normalize(posix.join(posix.dirname(oldFile), decoded));
  const target = pathMap.map(resolved);
  if (posix.basename(target) === posix.basename(resolved)) return label;
  const img = label.startsWith('!') ? '!' : '';
  const inner = label.slice(img.length + 1, -1);
  const tick = /^`[^`]+`$/.test(inner) ? '`' : '';
  const text = tick ? inner.slice(1, -1) : inner;
  const nextRaw = nextDest.replace(/^<|>$/g, '').replace(/[?#].*$/, '');
  const swap = { [posix.basename(resolved)]: posix.basename(target), [raw]: nextRaw, [decoded]: nextRaw, [resolved]: target };
  if (!(text in swap)) return label;
  return `${img}[${tick}${swap[text]}${tick}]`;
}

/*
 * Old file names written alone (hazard H12): after a rename, a mention of the
 * old file name with no path is neither a link nor a repo-root path, so the
 * rewrite cannot see it. These are reported for review, never rewritten:
 * a bare name in prose may mean something else.
 */
export function findOldNames(text, names) {
  const hits = [];
  if (!names.length) return hits;
  const re = new RegExp(`(?<![${PATH_CHAR}/])(${names.map(escapeRe).join('|')})(?![A-Za-z0-9_-])`, 'g');
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const found = [...new Set([...lines[n].matchAll(re)].map((m) => m[1]))];
    if (found.length) hits.push({ line: n + 1, text: lines[n].trim(), names: found.sort() });
  }
  return hits;
}

/*
 * Full-address links (a URL or an absolute path) that end in a moved path,
 * such as https://host/org/repo/blob/main/docs/x/A.md in a link, or
 * file:///c:/work/repo/docs/x/A.md. move cannot tell this repo from another
 * repo or machine, so these are reported for review, never rewritten.
 */
export function findAddressPaths(text, keys) {
  const hits = [];
  if (!keys.length) return hits;
  const re = new RegExp(`(?<=[${PATH_CHAR}]\\/)(${keys.map(escapeRe).join('|')})${AFTER}`, 'g');
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    if (!/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(lines[n])) continue;
    const found = [...new Set([...lines[n].matchAll(re)].map((m) => m[1]))];
    if (found.length) hits.push({ line: n + 1, text: lines[n].trim(), paths: found.sort() });
  }
  return hits;
}

/*
 * Pieced-together paths (hazard H7): code that builds a moved path from
 * quoted segments, such as join(root, "docs", "exports", "legal"). These are
 * reported for review, never rewritten.
 */
const QUOTED = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;

export function findPiecedPaths(text, keys) {
  const hits = [];
  const segKeys = keys.map((k) => k.split('/')).filter((s) => s.length >= 2);
  if (!segKeys.length) return hits;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const tokens = [];
    let lit = 0;
    for (const m of line.matchAll(QUOTED)) {
      for (const seg of m[2].split('/').filter(Boolean)) tokens.push({ seg, lit });
      lit++;
    }
    if (lit < 2) continue;
    const matched = [];
    for (const segs of segKeys) {
      if (runMatches(tokens, segs)) matched.push(segs.join('/'));
    }
    // Name the moved folder once, not every file inside it.
    const top = matched.filter((k) => !matched.some((j) => j !== k && k.startsWith(j + '/')));
    if (top.length) hits.push({ line: n + 1, text: line.trim(), paths: top.sort() });
  }
  return hits;
}

// True when at least two consecutive segments of the path appear as
// consecutive tokens taken from two or more separate string literals.
function runMatches(tokens, segs) {
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < segs.length; j++) {
      let k = 0;
      while (i + k < tokens.length && j + k < segs.length && tokens[i + k].seg === segs[j + k]) k++;
      if (k >= 2 && tokens[i].lit !== tokens[i + k - 1].lit) return true;
    }
  }
  return false;
}
