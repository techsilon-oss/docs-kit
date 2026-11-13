---
name: docs-kit-reorg
description: Reorganise a repo's docs folder into the docs-kit layout. Runs a read-only audit, writes one proposal that applies the least-change defaults, asks only for the roles and one approval, then moves the docs in slices with docs-kit move, routes generators through docs-kit snapshot, and adds the check to the tests. Never moves a doc before the approval; commits only on a yes; never pushes. Use after /docs-kit-init, when docs-kit check fails.
argument-hint: "[status]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" audit*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" check*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" --version) Read Glob Grep
---

# `/docs-kit-reorg` — reorganise a docs folder

The CLI is the plugin's own copy: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs"`. Below it is written as `DOCS_KIT`. Run it from the repo root.

The owner answers **two things**: who the `roles` are, and one approval of the proposal. The least-change defaults (DESIGN §6.3, L1 to L10, https://github.com/techsilon-oss/docs-kit/blob/main/docs/DESIGN.md) settle everything else. Ask about anything else only when no default settles it, or when a slice shows something the proposal did not foresee.

**Rules for the whole skill:**

- Never move, rename or delete a doc before the owner approves the proposal.
- Follow the project's own agent instructions (`CLAUDE.md` or similar): branch rules, commit style, test commands, which folders are historical. Where they differ from this skill, they win.
- Commit only on the owner's yes, and only the files the step changed. Never push, except when the project's rules say the working branch is pushed.
- Never edit a file under `immutablePrefixes`.

With the argument `status`: run `DOCS_KIT check`, find the proposal note (Grep `docs/notes/` for "docs-kit reorganisation"), and say which slices are done and which is next. Then stop.

## Step 1 — Preflight

- `docs-kit.json` exists at the repo root. If not, STOP and say: run `/docs-kit-init` first.
- The working tree is clean (`git status`). If not, say so, and ask whether to continue.
- The branch follows the project's rules. On the default or a shared branch, propose a new branch, for example `docs/reorganise`.

## Step 2 — Audit (read-only)

1. Run `DOCS_KIT audit --json`. It lists the docs root, each folder and its map, exports trees, code inside the docs folder, generators, ignored files, `.gitignore` rules, docs that immutable files name, agent instructions that name docs, how-to look-alikes, and every reference to a doc from outside the docs folder.
2. Read the project's agent instructions. Note: the folders they call historical or not to be edited (L4), the docs they name as a starting point (L5), and any rule about docs.
3. Read the title and the first lines of each doc at the docs root, so you can give each one a subject.
4. For each generator and each exports tree: read the code that writes the files. Note the topics, the file names, where it archives older copies, and whether its outputs are committed or gitignored.

## Step 3 — The proposal

Write it as a dated note, `docs/notes/<YYYY-MM-DD>-docs-kit-reorganisation.md`, with these sections:

1. **Findings:** what the audit and the check found, in a few lines.
2. **Defaults applied:** one line per default from L1 to L10 that this proposal uses, with what it means here.
3. **Subjects:** keep every existing folder and its name (L1). Add a subject only for files that fit none of them; start from the starter list (DESIGN §4). Add `notes` for the proposal itself.
4. **Old → new:** one row per file that moves. The folder changes; the file name does not (L2). Docs that the agent instructions or the front door name as a starting point stay where they are (L5). Files another tool's manifest names stay at the root (L7).
5. **Protected and frozen:** the docs immutable files name (L3, already in `docs-kit.json` from `init`), any other protected path with its reason, and the historical folders that go in `immutablePrefixes` (L4).
6. **Generated docs:** for each exports tree or generator:
   - one `snapshotTopics` entry per topic, to the subject it belongs to;
   - its code moves out of the docs folder, for example to `scripts/docs-gen/`, with `DOCS_KIT move` (code inside a docs folder is not a doc);
   - it asks `docs-kit snapshot path <topic>` where to write, and calls `docs-kit snapshot archive <topic>` instead of its own archive step;
   - if its outputs are gitignored today, the `.gitignore` rule follows the new folder, and the archive folder gets a rule too, so they stay ignored (H4). The check then reports the topic as local-only.
7. **Roles:** who reads the how-tos, from the app's own roles and the docs. Ask the owner in step 4.
8. **How-tos:** only a doc that is already one task in steps becomes a how-to (L6). List the candidates the audit found, with a yes or no for each and the reason.
9. **For later:** overlapping docs, such as two guides for the same task. They are not merged in this reorganisation (L9).
10. **Hazards:** each one the audit found, and how the plan handles it.
11. **Slices** (L8), one pull request each:
    1. the folder maps (`README.md` in each subject), the new subjects in `docs-kit.json`, and this note. No moves;
    2. the moves;
    3. the generators and their snapshots, if there are any;
    4. the how-tos, `roles` and `DOCS_KIT index`;
    5. close: `init --test`, once the check passes.

Add the note to `immutablePrefixes` in `docs-kit.json` (L10). It records the old paths, and `move` must not rewrite it.

## Step 4 — Two questions

1. **Roles**, when the plan makes how-tos: show the proposed list, and ask the owner to confirm or change it.
2. **Approve the proposal?** Show the note's path and a short summary: the subjects, how many files move, the slices. The answers: approve (Recommended), or change something. On a change, update the note and ask once more.

On the approval: record it in the note (date, and what was approved), then commit the note and the `docs-kit.json` changes on a yes, as slice 1 starts.

## Step 5 — Each slice

1. For slice 1, write each missing folder map: one line per doc, with a link. Write nothing else.
2. For each move, run `DOCS_KIT move <old> <new> [<old> <new> ...] --dry-run` first. Read the whole output.
3. If the dry run shows something the proposal did not foresee (a file you did not expect in the change list, a `REVIEW` line, an immutable file that names a moved path, a refusal), STOP. Tell the owner what it is, and propose what to do.
4. Run the move without `--dry-run`. Then run the project's tests and `DOCS_KIT check`.
5. Stage every file that `git status` lists, not only the docs folders. Ask: "Commit slice <n> as `<message>`?" Commit on a yes. Then say how the slice reaches the shared branch under the project's rules (for example, a pull request into `dev`).
6. For the generators slice: change the generator's code as the proposal says, run it once, and check the new snapshot sits at the path `docs-kit snapshot path` gives. Run `DOCS_KIT check`.

## Step 6 — Close

1. When the check passes, run `DOCS_KIT init --test <path>` with the test path from `/docs-kit-init`, so the check runs in the tests.
2. If the plan made how-tos: add `roles` to `docs-kit.json`, and run `DOCS_KIT index`.
3. Record the decision in the project's decision log, if it has one.
4. Mark the proposal note as done in the `notes` map. Do not edit the note itself: it is immutable.

## If something fails

- `move` exits 2: show its message. Nothing moved. A refusal names its reason (protected, immutable); follow the proposal, or ask the owner.
- `move` exits 1 (`DANGER … no longer ignored`): fix `.gitignore` before you stage anything.
- A docs-kit bug or a missing feature: say so plainly, and suggest an issue at https://github.com/techsilon-oss/docs-kit/issues. Describe it with invented names, not the project's own.
