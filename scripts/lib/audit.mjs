// docs-kit — the read-only audit a reorganisation starts from (DESIGN §6.3 step 1).
// It lists what is in the docs folder, every place outside it that names a doc,
// and each hazard of DESIGN §7 it can find. It changes nothing.
import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { listDocFiles } from './check.mjs';
import { ignoredFiles, trackedFiles } from './git.mjs';
import { protectNamedDocs } from './init.mjs';

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const CODE = /\.(py|js|mjs|cjs|ts|mts|cts|sh|ps1|rb|go|java|cs)$/i;
const AGENT_FILES = /(^|\/)(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md)$/;
const WRITES = /\b(writeFile(Sync)?|write_text|write_bytes|mkdirSync|makedirs|createWriteStream|open\([^)]*['"][wa]b?['"])/;
const HOWTO_LIKE = /(^|\/)(RUNBOOK|HOWTO|HOW-TO|GUIDE|PLAYBOOK)[-_A-Za-z0-9]*\.md$|-(guide|runbook|how-?to)\.md$/i;
// Tests write fixtures; they are not generators.
const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i;
const HISTORICAL = /^(archive|archives|history|historical|status|old|legacy|deprecated|retired|past)$/i;
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readText(root, f) {
  let buf;
  try {
    const st = statSync(join(root, f));
    if (!st.isFile() || st.size > MAX_TEXT_BYTES) return null;
    buf = readFileSync(join(root, f));
  } catch { return null; }
  return buf.subarray(0, 8000).includes(0) ? null : buf.toString('utf8');
}

/** The inventory. `cfg` is docs-kit.json when there is one, else the defaults. */
export function audit(root, cfg) {
  const D = cfg.docsRoot;
  const docFiles = listDocFiles(root, D);
  const docSet = new Set(docFiles);
  const rel = docFiles.map((f) => f.slice(D.length + 1));

  // The docs root: which entries the layout allows, and each folder's size and map.
  const rootFiles = rel.filter((r) => !r.includes('/'));
  const folders = [...new Set(rel.filter((r) => r.includes('/')).map((r) => r.split('/')[0]))].sort().map((name) => ({
    name,
    files: rel.filter((r) => r.startsWith(`${name}/`)).length,
    subject: cfg.subjects.includes(name),
    hasMap: docSet.has(`${D}/${name}/README.md`),
    historical: HISTORICAL.test(name),
  }));
  const root_ = {
    allowed: rootFiles.filter((f) => cfg.rootAllowed.includes(f)),
    notAllowed: rootFiles.filter((f) => !cfg.rootAllowed.includes(f)),
    folders,
  };

  // Every tracked file outside the docs root that names a doc by its repo-root path.
  const pathRe = new RegExp(`(?<![A-Za-z0-9_\\-.~%+@/])${escapeRe(D)}/[A-Za-z0-9_\\-.~%+@/]+`, 'g');
  const named = new Map();
  const agentFiles = [];
  const generators = [];
  for (const f of trackedFiles(root)) {
    if (f === `${D}` || f.startsWith(`${D}/`)) continue;
    const text = readText(root, f);
    if (text === null) continue;
    let hit = false;
    for (const m of text.matchAll(pathRe)) {
      const p = m[0].replace(/[.,;:!?)\]]+$/, '');
      if (p === D || p === `${D}/`) continue; // the docs root itself, not a doc
      const doc = docSet.has(p) ? p : [...docSet].some((d) => d.startsWith(`${p.replace(/\/$/, '')}/`)) ? p.replace(/\/$/, '') + '/' : null;
      if (!doc) continue;
      hit = true;
      if (!named.has(doc)) named.set(doc, new Set());
      named.get(doc).add(f);
    }
    if (hit && AGENT_FILES.test(f)) agentFiles.push(f);
    if (hit && CODE.test(f) && !TEST.test(f) && WRITES.test(text)) generators.push(f);
  }
  const references = [...named.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([doc, by]) => ({ doc, files: [...by].sort() }));

  // .gitignore rules that name the docs root (hazard H4).
  const gitignoreRules = [];
  for (const f of trackedFiles(root).filter((x) => posix.basename(x) === '.gitignore')) {
    (readText(root, f) || '').split(/\r?\n/).forEach((line, i) => {
      if (line.trim() && !line.trim().startsWith('#') && line.includes(`${D}/`)) gitignoreRules.push({ file: f, line: i + 1, rule: line.trim() });
    });
  }

  // Files git ignores under the docs root: generated or confidential (hazard H4).
  const ignored = ignoredFiles(root, [D]).filter((f) => !/(^|\/)__pycache__\/|\.pyc$/.test(f));
  const ignoredByFolder = {};
  for (const f of ignored) {
    const dir = posix.dirname(f);
    ignoredByFolder[dir] = (ignoredByFolder[dir] || 0) + 1;
  }

  const report = {
    docsRoot: D,
    configured: !!cfg.configured,
    docs: docFiles.length,
    root: root_,
    exportsTrees: [...new Set(rel.map((r) => r.split('/')).filter((p) => p.includes('exports')).map((p) => `${D}/${p.slice(0, p.indexOf('exports') + 1).join('/')}/`))].sort(),
    codeInDocs: trackedFiles(root, [D]).filter((f) => CODE.test(f)).sort(),
    generators: generators.sort(),
    gitignoreRules,
    ignoredUnderDocs: Object.entries(ignoredByFolder).sort().map(([dir, n]) => ({ dir, files: n })),
    namedByImmutable: protectNamedDocs(root, D, cfg.immutablePrefixes, docFiles),
    protected: cfg.protected,
    references,
    agentFiles: agentFiles.sort(),
    howtoCandidates: rel.filter((r) => HOWTO_LIKE.test(r) && !r.includes('/howto/')).map((r) => `${D}/${r}`).sort(),
  };
  return report;
}

export function formatAudit(a) {
  const L = [];
  const D = a.docsRoot;
  L.push(`docs-kit audit: ${a.docs} files under ${D}/. Read-only: nothing was changed.`);
  L.push('', `Docs root (${D}/):`);
  L.push(`  ${a.root.allowed.length} file(s) the layout allows: ${a.root.allowed.join(', ') || 'none'}`);
  L.push(`  ${a.root.notAllowed.length} file(s) that must move into a subject${a.root.notAllowed.length ? ':' : ''}`);
  for (const f of a.root.notAllowed) L.push(`    ${D}/${f}`);
  L.push(`  ${a.root.folders.length} folder(s):`);
  for (const f of a.root.folders) {
    const tags = [f.subject ? 'subject' : 'NOT a subject', f.hasMap ? 'has a map' : 'NO README.md map', ...(f.historical ? ['name suggests history: check the project rules (L4)'] : [])];
    L.push(`    ${f.name}/  ${f.files} file(s); ${tags.join('; ')}`);
  }
  const section = (title, items, line) => {
    L.push('', `${title}${items.length ? ':' : ': none'}`);
    for (const x of items) L.push(`  ${line(x)}`);
  };
  section(`exports/ trees (generated docs go to <subject>/snapshots/<topic>/)`, a.exportsTrees, (x) => x);
  section(`Code inside ${D}/ (move it out, for example to scripts/)`, a.codeInDocs, (x) => x);
  section(`Code outside ${D}/ that names a doc and writes files (a generator? route it with docs-kit snapshot)`, a.generators, (x) => x);
  section(`Files git ignores under ${D}/, by folder (generated or confidential: hazard H4)`, a.ignoredUnderDocs, (x) => `${x.dir}/  ${x.files} file(s)`);
  section(`.gitignore rules that name ${D}/ (move rewrites them; check they still match: H4)`, a.gitignoreRules, (x) => `${x.file}:${x.line}: ${x.rule}`);
  section('Docs that immutable files name (protect them: L3)', Object.entries(a.namedByImmutable), ([p, why]) => `${p}  (${why})`);
  section('Protected in docs-kit.json', Object.entries(a.protected), ([p, why]) => `${p}  (${why})`);
  section('Agent instructions that name a doc (move rewrites the paths; L5: keep their starting points in place)', a.agentFiles, (x) => x);
  section('Docs whose name looks like a how-to, outside a howto/ folder (L6: only a doc that is one task in steps becomes a how-to)', a.howtoCandidates, (x) => x);
  L.push('', `Docs named by a repo-root path outside ${D}/${a.references.length ? ` (${a.references.length}); move rewrites these:` : ': none'}`);
  for (const r of a.references) L.push(`  ${r.doc}  <- ${r.files.length > 4 ? `${r.files.slice(0, 4).join(', ')} and ${r.files.length - 4} more` : r.files.join(', ')}`);
  if (!a.configured) L.push('', `No docs-kit.json: the audit used the defaults. Run docs-kit init first.`);
  return L.join('\n');
}
