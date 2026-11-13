---
title: Reorganise a docs folder
last_checked: 2026-11-13
---

# How to reorganise a docs folder

**Purpose:** move the docs of a repo into the docs-kit layout, so the layout check passes, without breaking a link or a path.

## Before you start

- docs-kit is set up in the repo: see [Adopt docs-kit](HOWTO-adopt-docs-kit.md).
- A clean working tree (`git status` shows nothing).
- A branch for this work, if your project's rules say so.

In Claude Code, `/docs-kit-reorg` does every step below with you: it runs the audit, writes the plan, asks you for the roles and one approval, and then moves the docs in slices. In a terminal, follow the steps yourself.

The least-change defaults ([DESIGN §6.3](../../DESIGN.md#63-guided-reorganisation--docs-kit-reorg-skill)) settle most choices: keep folder names and file names, protect what immutable files name, never edit historical folders. You decide the roles and approve the plan once.

## Steps

1. List what the check finds:

   ```sh
   npm run docs:check
   ```

2. List what is in the docs folder, and every place outside it that names a doc. It writes nothing:

   ```sh
   npx docs-kit audit
   ```

3. Write the plan as a note in `docs/notes/`: the subjects, an old → new path for each file, the protected paths, the roles, and the slices. In Claude Code, `/docs-kit-init` writes this note for you after the read-only audit.
4. Add the note to `immutablePrefixes` in `docs-kit.json`, in the same commit. The note records the old paths, and `move` must not rewrite it.
5. Approve the plan. Nothing moves before that.
6. Slice 1: write a `README.md` map in each subject folder that has none. Move nothing. Commit.
7. Slice 2: see what the moves would change. It writes nothing:

   ```sh
   npx docs-kit move docs/OLD.md docs/subject/OLD.md --dry-run   # example: use your own paths
   ```

8. If the dry run lists a file you did not expect, stop and find out why before you go on.
9. Make the moves. Name every pair in one command:

   ```sh
   npx docs-kit move docs/OLD.md docs/subject/OLD.md   # example: use your own paths
   ```

10. Run your project's tests and `npm run docs:check`.
11. Stage every file that `git status` lists, not only the docs folders. Commit.
12. If a script writes docs, route it through `docs-kit snapshot`: see [Route generated docs to snapshots](HOWTO-route-generated-docs.md).
13. If the check passes, add it to your tests:

    ```sh
    npx docs-kit init --test tests/docs-layout.test.mjs
    ```

## Check

`npm run docs:check` prints `docs-kit check: OK`, and your tests run the check.

## If it fails

- **`refusing to move … is protected`:** the path is a key somewhere else. Leave it where it is, or remove it from `protected` if the reason no longer holds.
- **`REVIEW: … may build a moved path in pieces`:** a line of code joins the path from parts. Fix it by hand.
- **`REVIEW: … name a renamed file by its old name alone`:** a doc names the old file name without a path. Fix it by hand. Keeping file names (the default) avoids this.
- **`DANGER: … no longer ignored`:** a `.gitignore` rule did not follow the move. Fix `.gitignore` before you stage anything.

## Sources

- [Commands: `docs-kit move`](../../reference/COMMANDS.md#docs-kit-move)
- [DESIGN §7: Hazards](../../DESIGN.md#7-hazards-found-in-a-real-reorganisation)
