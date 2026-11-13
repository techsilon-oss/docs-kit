# Changelog

All notable changes to docs-kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/).

## [Unreleased]

### Added

- DESIGN §6.3: the least-change defaults (L1 to L10) a reorganisation applies without asking, so the owner answers `roles` and approves the proposal once.
- DESIGN §10: the Trial 1 result, and, planned for 0.3, `move` follows a renamed file's old name in link labels and bare mentions.
- Hazard H11: `move` rewrites the proposal note that records the move. Guard: the note goes in `immutablePrefixes` when it is written (L10); a test reproduces the hazard.

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
