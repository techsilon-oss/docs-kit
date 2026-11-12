// Builds the fixture repo: an invented project, "example-app", whose docs/
// tree reproduces every hazard in DESIGN §7 (H1 to H10).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const CONFIG = {
  docsRoot: 'docs',
  subjects: ['product', 'platform', 'operations', 'legal', 'support', 'notes', 'archive'],
  rootAllowed: ['README.md', 'PROJECT-HUB.md'],
  rootAllowedTools: { plans: 'a planning plugin writes its plans here' },
  docMaps: [{ file: 'scripts/source-doc-map.json', path: 'mappings[].docs[]' }],
  protected: { 'docs/support': 'path is a key in a production database' },
  immutablePrefixes: ['db/migrations/'],
  snapshotTopics: { architecture: 'platform' },
  howtoStaleDays: 90,
  snapshotStaleDays: 30,
};

// The fixture's "today", so freshness tests do not depend on the clock.
export const TODAY = new Date(Date.UTC(2026, 10, 1)); // 2026-11-01

export const FILES = {
  'docs-kit.json': `// example-app docs layout
{
  "docsRoot": "docs",
  "subjects": ${JSON.stringify(CONFIG.subjects)},
  "rootAllowed": ${JSON.stringify(CONFIG.rootAllowed)},
  "rootAllowedTools": ${JSON.stringify(CONFIG.rootAllowedTools)},
  "docMaps": ${JSON.stringify(CONFIG.docMaps)},
  "protected": ${JSON.stringify(CONFIG.protected)}, // H2
  "immutablePrefixes": ${JSON.stringify(CONFIG.immutablePrefixes)}, // H3
  "snapshotTopics": ${JSON.stringify(CONFIG.snapshotTopics)},
  "howtoStaleDays": 90,
  "snapshotStaleDays": 30,
}
`,
  'CLAUDE.md': `# example-app agent instructions\n\nThe terms live in \`docs/legal/TERMS.md\`.\n`,
  '.gitignore': `node_modules/\n# H4: confidential contracts, by exact path\ndocs/legal/contracts/*.pdf\n/docs/legal/contracts/signed/\n`,
  'docs/README.md': `# example-app docs\n\n- [Product](product/README.md)\n- [Platform](platform/README.md)\n- [Operations](operations/README.md)\n- [Legal](legal/README.md): the terms are in docs/legal/TERMS.md.\n- [Support](support/README.md)\n- [Notes](notes/README.md)\n`,
  'docs/PROJECT-HUB.md': `# Project hub\n\nStart at [the terms](legal/TERMS.md#scope).\n`,
  'docs/plans/2026-10-01-plan.md': `# A plan a tool wrote\n`,
  'docs/product/README.md': `# Product\n\n- [Overview](OVERVIEW.md)\n`,
  'docs/product/OVERVIEW.md': `# Overview\n\nSee [the terms](../legal/TERMS.md) and [legal](../legal/).\n\n![diagram](../platform/diagram.png)\n\n\`\`\`sh\n# a code block: links are not parsed here, root paths are\ncat docs/legal/TERMS.md\n[not a link](../legal/TERMS.md)\n\`\`\`\n`,
  'docs/platform/README.md': `# Platform\n\n- [Architecture](ARCHITECTURE.md)\n- [Snapshots](snapshots/architecture/)\n`,
  'docs/platform/ARCHITECTURE.md': `# Architecture\n\n[terms]: ../legal/TERMS.md "The terms"\n\nRead the [terms] first.\n`,
  'docs/platform/diagram.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  // H1: the snapshot folder holds only dated, generated snapshots.
  'docs/platform/snapshots/architecture/ARCHITECTURE_2026-10-20.md': `# Architecture snapshot\n\nQuotes [the canonical doc](../../ARCHITECTURE.md).\n`,
  'docs/legal/README.md': `# Legal\n\n- [Terms](TERMS.md)\n- [Contracts](contracts/README.md)\n`,
  'docs/legal/TERMS.md': `# Terms\n\n## Scope\n\nRelated: [overview](../product/OVERVIEW.md), [self](./TERMS.md).\n`,
  'docs/legal/contracts/README.md': `# Contracts\n\nSigned copies are kept here and never committed.\n`,
  // H2: docs/support is a key in a production database.
  'docs/support/README.md': `# Support\n\nArticles here are served by path.\n`,
  'docs/operations/README.md': `# Operations\n\n- [Deploy](howto/HOWTO-deploy.md)\n`,
  'docs/operations/howto/HOWTO-deploy.md': `---\ntitle: Deploy example-app\nlast_checked: 2026-10-15\n---\n\n1. In the terminal, run the deploy.\n`,
  'docs/notes/README.md': `# Notes\n\nPins: dated records of a discussion.\n`,
  'docs/archive/README.md': `# Archive\n`,
  'docs/archive/product/OLD-OVERVIEW.md': `# Old overview\n\nHistory: the terms were then at docs/legal/TERMS.md.\n\nLink: [terms](../../legal/TERMS.md).\n`,
  // H3: an applied migration names a doc path; it must never change.
  'db/migrations/001_seed.sql': `INSERT INTO help_articles (path) VALUES ('docs/legal/TERMS.md');\n`,
  // A doc map, as a doc-sync gate would use it.
  'scripts/source-doc-map.json': JSON.stringify({ mappings: [{ source: 'src/billing/', docs: ['docs/legal/TERMS.md', 'docs/platform/ARCHITECTURE.md'] }] }, null, 2) + '\n',
  // H7 and H9: a generator outside docs/ that names the path whole and in pieces.
  'scripts/build-legal.mjs': `import { join } from 'node:path';\nconst root = process.cwd();\nexport const terms = 'docs/legal/TERMS.md';\nexport const outDir = join(root, "docs", "legal");\n`,
  // H9: a workflow outside docs/ names the path.
  '.github/workflows/docs.yml': `on:\n  push:\n    paths: ['docs/legal/TERMS.md']\n`,
};

// Ignored files (never committed): H4.
export const IGNORED = {
  'docs/legal/contracts/client-a.pdf': 'confidential',
  'docs/legal/contracts/signed/client-b.md': 'confidential',
};

export function sh(cwd, cmd, args) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export const git = (cwd, ...args) => sh(cwd, 'git', args);

export function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** Create a fresh fixture repo in a temp folder and commit it. */
export function makeFixture({ files = FILES, ignored = IGNORED, extra = {}, omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'docs-kit-fixture-'));
  const all = { ...files, ...extra };
  for (const o of omit) delete all[o];
  writeFiles(root, all);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@example.com');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  writeFiles(root, ignored);
  return root;
}

export const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
export const exists = (root, rel) => existsSync(join(root, rel));
export const cleanup = (root) => rmSync(root, { recursive: true, force: true });
