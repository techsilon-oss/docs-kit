---
title: Upgrade docs-kit
last_checked: 2026-11-13
---

# How to upgrade docs-kit

**Purpose:** move a repo, and your Claude Code plugin, to a newer docs-kit release.

## Before you start

- Read [Upgrading](../../UPGRADING.md) for every release between yours and the new one. It lists each rename and breaking change.
- Find the new version on the [releases page](https://github.com/techsilon-oss/docs-kit/releases).

## Steps for a repo

1. In `package.json`, change the devDependency to the new tag, for example `github:techsilon-oss/docs-kit#v0.4.0`.
2. In a terminal, in the root folder of your repo, run `npm install`.
3. Run the check:

   ```sh
   npm run docs:check
   ```

4. If the check reports something new, read the [CHANGELOG](../../../CHANGELOG.md) entry for the release. Fix it, or ask with `/docs-kit-help`.
5. Commit `package.json` and the lockfile.

## Steps for the Claude Code plugin

1. In a terminal, run `claude plugin marketplace update docs-kit-marketplace`.
2. Run `claude plugin update docs-kit@docs-kit-marketplace`.
3. Start a new Claude Code session. The new skills load at the start of a session.

## Check

`npx docs-kit --version` prints the new version. In Claude Code, `/docs-kit-help` says the new version in its answer.

## If it fails

- **`npm install` cannot find the tag:** check the tag name on the releases page. Tags start with `v`.
- **A skill still has its old name:** start a new session. If it still does, run `claude plugin list` and check the version.

## Sources

- [Upgrading](../../UPGRADING.md)
- [CHANGELOG](../../../CHANGELOG.md)
