---
title: Adopt docs-kit in a repo
last_checked: 2026-11-13
---

# How to adopt docs-kit in a repo

**Purpose:** set up docs-kit in a repo, so the layout check runs and you can move docs safely.

## Before you start

- Node 22 or later, and git.
- A git repository. The commands read what git tracks.
- About 10 minutes. The reorganisation that follows takes longer: see [Reorganise a docs folder](HOWTO-reorganise-a-docs-folder.md).

## Steps in Claude Code

1. In Claude Code, run `/plugin marketplace add techsilon-oss/docs-kit`.
2. Run `/plugin install docs-kit@docs-kit-marketplace`.
3. Open a Claude Code session in the root folder of your repo.
4. Run `/docs-kit-init`.
5. Read the defaults it shows: the branch, the devDependency, the test file, the protected and frozen paths. If one is wrong, select **change something** and say what to change. Otherwise, select **apply**.
6. When it asks to commit the setup, select **commit**.
7. If the check failed, say yes to the read-only audit. It leads into the reorganisation.

## Steps in a terminal

Use the terminal you normally use for git, in the root folder of your repo.

1. See what `init` would write. It writes nothing:

   ```sh
   npx github:techsilon-oss/docs-kit#v0.3.1 init --dry-run
   ```

2. Set it up:

   ```sh
   npx github:techsilon-oss/docs-kit#v0.3.1 init
   ```

3. If your repo has a `package.json`, fetch the devDependency that `init` added:

   ```sh
   npm install
   ```

4. Read the **Found:** lines that `init` printed. Each one says why a value is in `docs-kit.json`.
5. Add to `docs-kit.json` what only you know: other `protected` paths (a doc path that a database, a URL or code uses as a key), each with its reason.
6. Commit the files `init` listed.

If your repo must not get a new dependency, add `--no-package` in step 2. Then run the check with `npx github:techsilon-oss/docs-kit#v0.3.1 check`.

## Check

Run `npm run docs:check`. It prints `docs-kit check: OK`, or `docs-kit check: FAILED` with a list. A list is expected on a docs folder that does not follow the layout yet.

## If it fails

- **`init must run inside a git repository`:** run it from inside the repo.
- **`--test` must end in .js, .mjs, .cjs, .ts, .mts, .cts or .py:** name a test file for vitest or pytest.
- **The test file was skipped as "not yet":** that is intended. A failing test would block every commit. Run `init --test <file>` again once the check passes.

## Sources

- [Commands: `docs-kit init`](../../reference/COMMANDS.md#docs-kit-init)
- [DESIGN §6.7: Setup](../../DESIGN.md#67-setup--docs-kit-init-and-docs-kit-init)
