---
title: Remove docs-kit
last_checked: 2026-11-13
---

# How to remove docs-kit

**Purpose:** take docs-kit out of a repo, and out of Claude Code. Your docs stay as they are.

## Before you start

- A clean working tree (`git status` shows nothing).

## Steps for a repo

1. Delete `docs-kit.json` from the repo root.
2. Delete the test file that runs the layout check, if you added one (for example `tests/docs-layout.test.mjs`).
3. In `package.json`, remove `docs-kit` from `devDependencies`, and remove the `docs:check` script.
4. In a terminal, in the root folder of your repo, run `npm install`.
5. If your CI runs `npm run docs:check`, remove that step.
6. Commit.

Keep `docs/README.md` and the folder maps. They are your docs, and they read the same without docs-kit. To also remove the "How-tos by role" section, delete the lines between `<!-- docs-kit:howtos-by-role:start -->` and `<!-- docs-kit:howtos-by-role:end -->`, and the two marker lines.

## Steps for the Claude Code plugin

1. In a terminal, run `claude plugin uninstall docs-kit@docs-kit-marketplace`.
2. Run `claude plugin marketplace remove docs-kit-marketplace`.

## Check

`git grep -n docs-kit` finds nothing you did not mean to keep. `claude plugin list` does not show docs-kit.

## Sources

- [What it does on your machine](../../../README.md#what-it-does-on-your-machine)
