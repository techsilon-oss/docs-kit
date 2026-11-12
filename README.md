# docs-kit

One layout for `docs/`, and the tools to adopt it and keep it: a layout check, a doc mover that keeps every link and path working, a guided reorganisation, pinned notes and how-tos (`/pin`), snapshot routing for generated docs, and print copies.

> **Status:** 0.1 in progress: the layout rule, `docs-kit.json`, `check` and `move` are built; how-tos by role (DESIGN §4.1) is next. `/pin`, `print`, `/docs-reorg` and the snapshot library come in later steps ([DESIGN §10](docs/DESIGN.md#10-rollout)). The design is in **[docs/DESIGN.md](docs/DESIGN.md)**.

## Needs

Node 22 or later, and git. No runtime dependencies: the scripts use Node built-ins only.

## Use it

1. Put a `docs-kit.json` at the repo root. Start from [examples/docs-kit.json](examples/docs-kit.json); every key is described in [DESIGN §5](docs/DESIGN.md#5-configuration-docs-kitjson).
2. Run the check:

   ```sh
   npx github:techsilon-oss/docs-kit check
   ```

3. Move docs and keep every reference working. Try `--dry-run` first:

   ```sh
   npx github:techsilon-oss/docs-kit move docs/legal docs/money/legal --dry-run
   npx github:techsilon-oss/docs-kit move docs/legal docs/money/legal
   ```

To vendor instead, copy `scripts/docs-kit.mjs` and `scripts/lib/` into your repo, keep the banner and `VERSION` in `docs-kit.mjs`, and send fixes back here.

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

Options: `--json` for machine-readable output, `--today YYYY-MM-DD` to fix the date used for freshness.

To run it in your tests, see [examples/vitest](examples/vitest/docs-layout.test.mjs) and [examples/pytest](examples/pytest/test_docs_layout.py).

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
