# Changelog

All notable changes to docs-kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/).

## [0.1.0] - unreleased

### Added

- `docs-kit.json` configuration (JSON with comments), with `snapshotStaleDays` added to the keys in DESIGN §5.
- `docs-kit check`: the layout check (DESIGN §6.1), with `--json` and `--today`.
- `docs-kit move`: the mover (DESIGN §6.2), with `--dry-run`.
- A fixture repo that reproduces hazards H1 to H10, and a test for each guard.
- Examples: `docs-kit.json`, and the check wrapped as a vitest and a pytest test.

### Notes

- H1 is guarded in 0.1 by the check: a `snapshots/<topic>/` folder may hold only dated snapshots. The archive helper's own refusal arrives with the snapshot library in 0.3.
- `docs-kit print` is reserved and exits 2 until 0.2.
