# docs-kit

One layout for `docs/`, and the tools to adopt it and keep it: a layout check, a doc mover that keeps every link and path working, a guided reorganisation, pinned notes and how-tos (`/pin`), snapshot routing for generated docs, and print copies.

> **Status:** 0.2.0 released 2026-11-12: the layout rule, `docs-kit.json`, `init` and the `/docs-kit-init` plugin skill (setup), `check`, `index` (how-tos by role) and `move`. `/pin`, `print`, `/docs-reorg` and the snapshot library come in later steps ([DESIGN §10](docs/DESIGN.md#10-rollout)). The design is in **[docs/DESIGN.md](docs/DESIGN.md)**.

## Needs

Node 22 or later, and git. No runtime dependencies: the scripts use Node built-ins only.

## Two ways to set it up

- **In Claude Code: `/docs-kit-init`.** Install the plugin once per machine, then run `/docs-kit-init` in any repo. It runs `docs-kit init`, explains what the check found, proposes the `roles` and `protected` paths, and offers the guided reorganisation. It never commits and never moves a doc without your yes.

  ```sh
  /plugin install docs-kit --marketplace techsilon-oss/docs-kit
  ```

  Or from a terminal: `claude plugin marketplace add techsilon-oss/docs-kit`, then `claude plugin install docs-kit`.

- **Anywhere else: `docs-kit init`**, with Node and nothing else. The steps are below.

Both run the same `init`, so they give the same files.

## Use it

1. Set it up, from the repo root. See what it would do first:

   ```sh
   npx github:techsilon-oss/docs-kit init --dry-run
   npx github:techsilon-oss/docs-kit init --test tests/docs-layout.test.mjs
   ```

   `init` writes a `docs-kit.json` that describes your docs folder as it is today, adds the front door `docs/README.md` if it is missing, and, with a `package.json`, adds `docs-kit` as a devDependency pinned to the release and a `docs:check` script. Then run `npm install`. See [`docs-kit init`](#docs-kit-init) below.

2. Run the check:

   ```sh
   npm run docs:check        # or: npx github:techsilon-oss/docs-kit check
   ```

   To pin a release with npx, use `npx github:techsilon-oss/docs-kit#v0.2.0 check`.

3. Move docs and keep every reference working. Try `--dry-run` first:

   ```sh
   npx github:techsilon-oss/docs-kit move docs/legal docs/money/legal --dry-run
   npx github:techsilon-oss/docs-kit move docs/legal docs/money/legal
   ```

To vendor instead, copy `scripts/docs-kit.mjs` and `scripts/lib/` into your repo, keep the banner and `VERSION` in `docs-kit.mjs`, and send fixes back here.

## `docs-kit init [--dry-run] [--docs-root <dir>] [--test <file>]`

Sets up a repo in one step (DESIGN §6.7). The same repo always gives the same result.

| It finds | It writes in `docs-kit.json` |
|---|---|
| The folders at the docs root | `subjects` |
| Docs-root files another tool's manifest names (for example the hub and roadmap in `govkit.json`) | `rootAllowed`, so that tool keeps working |
| `scripts/source-doc-map.json`, when it lists doc paths | `docMaps` |
| Migration folders (`supabase/migrations/`, `db/migrations/`, ...) and files another tool vendors with a checksum (`govkit.json` `files`) | `immutablePrefixes`, so `move` never edits them |
| `<subject>/snapshots/<topic>/` folders | `snapshotTopics` |

`protected` and `roles` stay empty: only you know them. Add them before you move anything.

It also adds `docs/README.md` when it is missing, and, with a `package.json`, the devDependency `docs-kit` (`github:techsilon-oss/docs-kit#v<version>`) and a `docs:check` script. `--test <file>` writes the check as a test: vitest for `.js`, `.mjs` or `.ts`, pytest for `.py`. It does so only when the check passes; while it fails, a test would block every commit, so `init` skips it and says to run `init --test` again once the check passes.

- It never overwrites a file, never commits, and does not run `npm install`. Running it again changes nothing.
- `--dry-run` lists what it would do and writes nothing.
- It ends by running `check`. On a docs folder that does not follow the layout yet, the check fails; that is expected, and `init` still exits 0. Reorganise with `move`, following [DESIGN §6.3](docs/DESIGN.md#63-guided-reorganisation--docs-reorg-skill).
- Exit 2 for wrong arguments, or outside a git repository; nothing is written.

## `docs-kit check`

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

To run it in your tests, see [examples/vitest](examples/vitest/docs-layout.test.mjs) and [examples/pytest](examples/pytest/test_docs_layout.py).

## `docs-kit index`

Writes the **How-tos by role** section of `docs/README.md` (DESIGN §4.1), so a reader finds the steps for their own role without knowing the subject folders. List the roles once in `docs-kit.json` (`"roles": ["customer", "support", "admin"]`) and name them in each how-to:

```markdown
---
title: Reset a password
last_checked: 2026-11-01
roles: [customer, support]
---
```

The section sits between `<!-- docs-kit:howtos-by-role:start -->` and `<!-- docs-kit:howtos-by-role:end -->`; the first run adds it at the end of the file. Do not edit it by hand: `check` fails when it differs from what `index` would write. Run `index` after you add a how-to or change its `roles` or `title`.

## `docs-kit move <old> <new> [<old> <new> ...] [--dry-run]`

For each pair, a file or a folder:

- moves with `git mv`, **one file at a time**; untracked and ignored files in a moved folder move with it;
- rewrites relative Markdown links (inline, images, reference definitions, `href`/`src`) in the moved files and in every file that links to them; links inside code fences are left alone;
- replaces repo-root path strings (`docs/old/X.md`) in every tracked text file, including `.gitignore`, scripts, config, workflows and agent instructions, also when the path ends a sentence;
- never edits files under `immutablePrefixes`, and lists the ones that name a moved path;
- refuses to move a `protected` path, a path inside one, or a folder holding one, with the reason, and moves nothing;
- in `archive/`, changes only links that point into a moved path;
- lists every line that may build a moved path in pieces (`join(root, "docs", "old")`) for you to fix by hand;
- checks that every ignored file it moved is still ignored, and fails loudly if not;
- prints every file it changed, ends with `git status --porcelain`, then runs `docs-kit check` when `docs-kit.json` exists.

Stage **everything** in that `git status` list, not only the docs folders.

Exit 0 when the move is done; 1 when a file that was ignored is no longer ignored (fix `.gitignore` before you stage anything); 2 when the move was refused or the arguments are wrong (nothing moved). Layout-check findings after a move are printed but do not change the exit code, because a reorganisation is often half way through.

Limits:

- git finds renames by similarity. A small file whose links change a lot can show as a delete and an add, and `git log --follow` then loses it. Commit large moves before other edits.
- Paths in other docs folders (`packages/web/docs/...`) and Windows-style `docs\old` paths are not rewritten.
- A move cannot chain (`a -> b` and `b -> c` in one call). Run it twice.

## Hazards

The tools guard against ten hazards found in a real reorganisation ([DESIGN §7](docs/DESIGN.md#7-hazards-found-in-a-real-reorganisation)). Each guard has a test in [test/hazards.test.mjs](test/hazards.test.mjs) that reproduces the hazard on a fixture repo.

## Develop

```sh
npm test
```

Work on `dev`; release to `main` by pull request. See [CLAUDE.md](CLAUDE.md) and [CHANGELOG.md](CHANGELOG.md).

## Standalone by design

Like [release-gate-kit](https://github.com/techsilon-oss/release-gate-kit), this kit solves one problem and needs no governance buy-in. [govkit](https://github.com/techsilon-oss/govkit) can use it through an optional module; docs-kit never depends on govkit.

## License

MIT. See [LICENSE](LICENSE).
