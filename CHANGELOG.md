# Changelog

All notable changes to docs-kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/).

## [0.4.0] - 2026-11-13

### Added

- `/docs-kit-reorg`: the guided reorganisation (DESIGN §6.3). It audits the docs, writes one proposal that applies the least-change defaults, asks the owner only for the roles and one approval, then moves the docs in slices, routes generators through `docs-kit snapshot`, and adds the check to the tests.
- `docs-kit audit [--json]`: a read-only inventory before a reorganisation: the docs root and its folders, exports trees, code inside the docs folder, generators, ignored files and `.gitignore` rules, docs that immutable files name, agent instructions, how-to look-alikes, and every reference to a doc from outside the docs folder.
- `docs-kit snapshot path <topic>` and `docs-kit snapshot archive <topic>` (DESIGN §6.6): where a generator in any language writes today's snapshot, and archiving the older ones to `archive/<subject>/snapshots/<topic>/`. The archive refuses any other folder (hazard H1), and fails loudly when an ignored snapshot would become visible (hazard H4).
- How-to: [Route generated docs to snapshots](docs/guides/howto/HOWTO-route-generated-docs.md), with Python and Node examples that the tests run.

### Changed

- `check`: a snapshot topic whose folder git ignores is reported as local-only, instead of failing as "no dated snapshots".
- `/docs-kit-init` hands the reorganisation to `/docs-kit-reorg`.

## [0.3.1] - 2026-11-13

docs-kit now follows the [techsilon-oss kit standard](https://github.com/techsilon-oss/.github/blob/main/KIT-STANDARD.md). See [Upgrading](docs/UPGRADING.md#031).

### Added

- `/docs-kit-help`: answers a question from the docs of the installed version. Read-only.
- docs-kit's own docs follow the docs-kit layout: a front door, how-tos to adopt, reorganise, print, upgrade and remove, a command reference, a FAQ and upgrade notes. `npm test` checks the layout, runs every docs-kit command the docs show, checks the version they pin, and checks every link and anchor.
- CI on every pull request: the tests, the plugin manifests, and the kit standard's DCO and plain-words checks.
- `NOTICE` and `.github/CODEOWNERS`.

### Changed

- **License: Apache License 2.0 from 0.3.1.** Earlier releases were published under MIT and stay MIT.
- `/pin` is now `/docs-kit-pin`. The old name stays as an alias until the first release on or after 2026-12-13.
- **Security:** `/docs-kit-init` and `/docs-kit-pin` pre-approve only the plugin's own `docs-kit` commands. They no longer run `git`, `date` or other commands without asking; 0.3.0 pre-approved `git branch`, `git diff` and `git symbolic-ref`, which can delete a branch, write a file or move `HEAD`. A test enforces the rule for every skill.
- The README says what you get, what docs-kit does on your machine, and how to remove it. The command reference moved to `docs/reference/COMMANDS.md`.

## [0.3.0] - 2026-11-13

### Added

- `docs-kit print`: `.docx` and `.pdf` print copies beside the source with pandoc, named `<NAME>_v<X.Y>_<YYYY-MM-DD>`, only the newest kept; the version goes one minor up unless `--version` sets it; warns about tables with more than five columns; skipped with a message when pandoc is absent (DESIGN §6.5).
- `/pin` in the plugin, now project-neutral: dated notes in `docs/notes/` and how-tos in `docs/<subject>/howto/` with `title`, `last_checked` and `roles`; runs `index` and `check`; prints through `docs-kit print` (DESIGN §6.4).
- `docs-kit init` protects every doc that a file under `immutablePrefixes` names, with the files that name it (least-change default L3).
- DESIGN §6.3: the least-change defaults (L1 to L10) a reorganisation applies without asking, so the owner answers `roles` and approves the proposal once.
- Hazard H11: `move` rewrites the proposal note that records the move. Guard: the note goes in `immutablePrefixes` when it is written (L10); a test reproduces the hazard.
- DESIGN §10: the Trial 1 result.
- `docs-kit move` follows a renamed file by name (hazard H12): a link label that is the old name or path is rewritten, and every other bare mention of the old name is listed for review.

### Changed

- `/docs-kit-init` applies the least-change defaults and shows them in one prompt to approve or change; it asks separately only for what no rule settles.
- Front matter: a trailing `# comment` after a value or a `[list]` is ignored.
- `--version` prints the version only as the first argument, so `print --version X.Y` works.

## [0.2.1] - 2026-11-12

### Added

- `docs-kit init --no-package`: leaves `package.json` alone, for a repo that does not want the devDependency; the check and the test then run the pinned release with `npx`.

### Changed

- `/docs-kit-init` sets a repo up in two answers (DESIGN §6.7). It looks first (branch, the project's rules, the dry run, test location, `protected` candidates), asks every decision in one prompt (branch, devDependency or `--no-package`, test file, `protected` paths), does the work including the install, then asks one question: commit the setup files on the branch. It never pushes. It ends by offering the read-only audit.
- README: the plugin install uses `/plugin marketplace add`, then `/plugin install docs-kit@docs-kit-marketplace`.

## [0.2.0] - 2026-11-12

### Added

- `docs-kit init`: one-step setup (DESIGN §6.7). Writes a starter `docs-kit.json` from the repo as it is, the front door when missing, a pinned devDependency and a `docs:check` script; `--test <file>` writes the check as a vitest or pytest test, only once the check passes, so a failing test never blocks a commit; `--dry-run` writes nothing. Never overwrites; running it again changes nothing.
- A Claude Code plugin (this repo is its marketplace) with `/docs-kit-init`: runs `init`, explains each check finding, proposes `roles` and `protected` paths, and offers the guided reorganisation. Install with `/plugin install docs-kit --marketplace techsilon-oss/docs-kit`.

### Changed

- Rollout (DESIGN §10): 0.2 is now `init` and the Claude Code plugin; `/pin` and `print` move to 0.3, `/docs-reorg` and the snapshot library to 0.4. `docs-kit print` now says it arrives in 0.3.

## [0.1.0] - 2026-11-12

### Added

- `docs-kit.json` configuration (JSON with comments), with `snapshotStaleDays` added to the keys in DESIGN §5.
- `docs-kit check`: the layout check (DESIGN §6.1), with `--json` and `--today`.
- `docs-kit move`: the mover (DESIGN §6.2), with `--dry-run`.
- How-tos by role (DESIGN §4.1): a `roles` list in `docs-kit.json`, `roles:` in each how-to's front matter, `docs-kit index` to write the "How-tos by role" section of `docs/README.md`, and `check` rules that keep it correct.
- A fixture repo that reproduces hazards H1 to H10, and a test for each guard.
- Examples: `docs-kit.json`, and the check wrapped as a vitest and a pytest test.

### Notes

- H1 is guarded in 0.1 by the check: a `snapshots/<topic>/` folder may hold only dated snapshots. The archive helper's own refusal arrives with the snapshot library in 0.3.
- `docs-kit print` is reserved and exits 2 until 0.2.
