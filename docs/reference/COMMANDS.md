# Commands

Every `docs-kit` command, its options, what it finds and its exit codes. Run each from anywhere inside the repo; `docs-kit.json` at the repo root configures it ([DESIGN §5](../DESIGN.md#5-configuration-docs-kitjson)).

How to run `docs-kit`: `npm run docs:check` and `npx docs-kit <command>` once it is a devDependency, or `npx github:techsilon-oss/docs-kit#v<version> <command>` without one.

- [`docs-kit init`](#docs-kit-init)
- [`docs-kit check`](#docs-kit-check)
- [`docs-kit audit`](#docs-kit-audit)
- [`docs-kit index`](#docs-kit-index)
- [`docs-kit move`](#docs-kit-move)
- [`docs-kit print`](#docs-kit-print)
- [`docs-kit snapshot`](#docs-kit-snapshot)
- [Hazards](#hazards)

## `docs-kit init`

```text
docs-kit init [--dry-run] [--docs-root <dir>] [--test <file>] [--no-package]
```

Sets up a repo in one step (DESIGN §6.7). The same repo always gives the same result.

| It finds | It writes in `docs-kit.json` |
|---|---|
| The folders at the docs root | `subjects` |
| Docs-root files another tool's manifest names (for example the hub and roadmap in `govkit.json`) | `rootAllowed`, so that tool keeps working |
| `scripts/source-doc-map.json`, when it lists doc paths | `docMaps` |
| Migration folders (`supabase/migrations/`, `db/migrations/`, ...) and files another tool vendors with a checksum (`govkit.json` `files`) | `immutablePrefixes`, so `move` never edits them |
| Docs that those immutable files name by path (a migration that cites a doc as its spec) | `protected`, with the files that name them: moving the doc would leave them stale for good |
| `<subject>/snapshots/<topic>/` folders | `snapshotTopics` |

`roles` stays empty, and so does any other `protected` path (a doc path a database, a URL or code uses as a key): only you know them. Add them before you move anything.

It also adds `docs/README.md` when it is missing, and, with a `package.json`, the devDependency `docs-kit` (`github:techsilon-oss/docs-kit#v<version>`) and a `docs:check` script. `--test <file>` writes the check as a test: vitest for `.js`, `.mjs` or `.ts`, pytest for `.py`. It does so only when the check passes; while it fails, a test would block every commit, so `init` skips it and says to run `init --test` again once the check passes. `--no-package` leaves `package.json` alone; run the check with `npx` instead.

- It never overwrites a file, never commits, and does not run `npm install`. Running it again changes nothing.
- `--dry-run` lists what it would do and writes nothing.
- It ends by running `check`. On a docs folder that does not follow the layout yet, the check fails; that is expected, and `init` still exits 0. Reorganise with `move`, following [DESIGN §6.3](../DESIGN.md#63-guided-reorganisation--docs-kit-reorg-skill).
- Exit 2 for wrong arguments, or outside a git repository; nothing is written.

## `docs-kit check`

```text
docs-kit check [--json] [--today YYYY-MM-DD]
```

Exit 0 when the layout rule holds (warnings allowed), 1 with a list when it does not, 2 for a usage or configuration error.

| Finding | Level |
|---|---|
| A file or folder at the docs root that is not allowed; no `docs/README.md` | error |
| A subject folder without a `README.md` | error |
| An `exports/` folder outside `archive/` | error |
| A doc named in a doc map that does not exist; a doc map that selects nothing | error |
| A file in a `snapshots/<topic>/` folder that is not a dated snapshot; a configured snapshot topic with no snapshots | error |
| The newest snapshot of a topic older than `snapshotStaleDays`, by the date in its **file name** | warning |
| A how-to whose `last_checked` is missing or older than `howtoStaleDays` | warning |
| More than one print copy of a doc, or a print copy with no source beside it | warning |
| Archive content not under `archive/<subject>/` | warning |
| With `roles` configured: a how-to with no `roles:` or an unknown role; a missing or out-of-date "How-tos by role" section; no how-tos at all | error |

Options: `--json` for machine-readable output, `--today YYYY-MM-DD` to fix the date used for freshness.

To run it in your tests, see [examples/vitest](../../examples/vitest/docs-layout.test.mjs) and [examples/pytest](../../examples/pytest/test_docs_layout.py).

## `docs-kit audit`

```text
docs-kit audit [--json]
```

The read-only inventory a reorganisation starts from (DESIGN §6.3, step 1). It changes nothing. It works before `init` too, with the default settings.

| It lists | Why |
|---|---|
| The docs root: the files the layout allows, the files that must move, each folder with its size, whether it is a subject, and whether it has a map | The work the reorganisation has to do |
| `exports/` trees, code inside the docs folder, and code outside it that names a doc and writes files | Generated docs, and the generators that make them |
| Files git ignores under the docs folder, by folder, and the `.gitignore` rules that name it | Generated or confidential files that must stay ignored (hazard H4) |
| Docs that immutable files name, and the protected paths | What must not move (default L3, hazard H2) |
| Agent instructions that name a doc | Starting points that stay in place (default L5) |
| Docs whose name looks like a how-to, outside a `howto/` folder | How-to candidates (default L6) |
| Every doc that a file outside the docs folder names by its repo-root path, with those files | What `move` will rewrite |

`--json` prints the same report as JSON. Exit 0; 2 outside a git repository.

## `docs-kit index`

```text
docs-kit index
```

Writes the **How-tos by role** section of `docs/README.md` (DESIGN §4.1), so a reader finds the steps for their own role without knowing the subject folders. List the roles once in `docs-kit.json` (`"roles": ["customer", "support", "admin"]`) and name them in each how-to:

```markdown
---
title: Reset a password
last_checked: 2026-11-01
roles: [customer, support]
---
```

The section sits between `<!-- docs-kit:howtos-by-role:start -->` and `<!-- docs-kit:howtos-by-role:end -->`; the first run adds it at the end of the file. Do not edit it by hand: `check` fails when it differs from what `index` would write. Run `index` after you add a how-to or change its `roles` or `title`.

## `docs-kit move`

```text
docs-kit move <old> <new> [<old> <new> ...] [--dry-run]
```

For each pair, a file or a folder:

- moves with `git mv`, **one file at a time**; untracked and ignored files in a moved folder move with it;
- rewrites relative Markdown links (inline, images, reference definitions, `href`/`src`) in the moved files and in every file that links to them; links inside code fences are left alone;
- replaces repo-root path strings (`docs/old/X.md`) in every tracked text file, including `.gitignore`, scripts, config, workflows and agent instructions, also when the path ends a sentence;
- never edits files under `immutablePrefixes`, and lists the ones that name a moved path;
- refuses to move a `protected` path, a path inside one, or a folder holding one, with the reason, and moves nothing;
- in `archive/`, changes only links that point into a moved path;
- lists every line that may build a moved path in pieces (`join(root, "docs", "old")`) for you to fix by hand;
- when a move renames a file: rewrites a link label that is exactly the old name or path (`[OLD.md](OLD.md)`), and lists every other line that names the old file name alone, with no path, for you to fix by hand;
- checks that every ignored file it moved is still ignored, and fails loudly if not;
- prints every file it changed, ends with `git status --porcelain`, then runs `docs-kit check` when `docs-kit.json` exists.

Stage **everything** in that `git status` list, not only the docs folders.

Exit 0 when the move is done; 1 when a file that was ignored is no longer ignored (fix `.gitignore` before you stage anything); 2 when the move was refused or the arguments are wrong (nothing moved). Layout-check findings after a move are printed but do not change the exit code, because a reorganisation is often half way through.

Limits:

- git finds renames by similarity. A small file whose links change a lot can show as a delete and an add, and `git log --follow` then loses it. Commit large moves before other edits.
- Paths in other docs folders (`packages/web/docs/...`) and Windows-style `docs\old` paths are not rewritten.
- A move cannot chain (`a -> b` and `b -> c` in one call). Run it twice.

## `docs-kit print`

```text
docs-kit print <file.md> [--version X.Y] [--today YYYY-MM-DD]
```

Makes `.docx` and `.pdf` print copies beside the source, named `<NAME>_v<X.Y>_<YYYY-MM-DD>`, and removes the older print copies of the same doc, so only the newest stays (DESIGN §6.5). It uses [pandoc](https://pandoc.org/installing.html), or the one `DOCS_KIT_PANDOC` names.

- The version is `--version`, else one minor up from the newest print copy, else `1.0`.
- A `.pdf` needs a PDF engine for pandoc (for example a LaTeX install). A format that fails keeps its older copy and says why.
- It warns about tables with more than five columns, which may run off the page.
- Without pandoc, it skips printing with a message and exits 0. Exit 1 when pandoc ran and made no copy, 2 for wrong arguments.

## `docs-kit snapshot`

```text
docs-kit snapshot path <topic> [--date YYYY-MM-DD] [--ext md]
docs-kit snapshot archive <topic> [--keep N] [--dry-run]
```

Routes generated docs (DESIGN §6.6). A generator in any language calls these, so every generator follows one rule: `<docsRoot>/<subject>/snapshots/<topic>/<TOPIC>_<YYYY-MM-DD>.<ext>`. The topics and their subjects are in `snapshotTopics` in `docs-kit.json`.

- **`path`** prints where today's snapshot of a topic goes, for example `docs/operations/snapshots/status/STATUS_2026-11-13.md`. `--date` sets the date, `--ext` the file extension. It writes nothing; the generator creates the folder and the file. An unknown topic is an error, never a default folder.
- **`archive`** keeps the snapshots of the newest date (`--keep N` keeps the newest N dates) and moves the older ones to `<docsRoot>/archive/<subject>/snapshots/<topic>/`. A tracked file moves with `git mv`. It leaves alone a file that is not a dated snapshot, and refuses any folder that is not a configured `snapshots/<topic>/` folder (hazard H1).
- **Gitignored snapshots.** If git ignores the topic folder, its snapshots are made on demand and never committed. `check` then reports the topic as local-only instead of "no dated snapshots". When `archive` moves an ignored file to a place git does not ignore, it says `DANGER` and exits 1: add a `.gitignore` rule for the archive folder before you stage anything (hazard H4).

Exit 0 when done; 1 when an ignored file is no longer ignored; 2 for an unknown topic, a refused folder or wrong arguments (nothing moved).

## Hazards

The tools guard against the hazards found in real reorganisations ([DESIGN §7](../DESIGN.md#7-hazards-found-in-a-real-reorganisation)). Each guard has a test in [test/hazards.test.mjs](../../test/hazards.test.mjs) that reproduces the hazard on a fixture repo.
