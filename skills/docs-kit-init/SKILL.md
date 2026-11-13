---
name: docs-kit-init
description: Set up docs-kit in the current repo in two answers. Applies the least-change defaults (branch, devDependency, test file, protected and frozen paths), shows them in one prompt to approve or override, runs `docs-kit init`, explains what the layout check found, commits the setup on a yes, and offers the guided reorganisation. Never overwrites, never pushes, never moves a doc. Use when a repo adopts docs-kit, or when docs-kit.json is missing.
argument-hint: "[--docs-root <dir>]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" init*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" check*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" --version) Read Glob Grep
---

# /docs-kit-init — set up docs-kit in this repo

`docs-kit init` does the setup. This skill runs it, and adds what needs judgement. The owner should never need to know what to type next, and should not be asked what a rule settles: apply the defaults, show them in **one** prompt to approve or override, do the work, then end with **one** question.

The CLI is the plugin's own copy: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs"`. Below it is written as `DOCS_KIT`. Run it from the repo root.

**Rules for the whole skill:**

- Never overwrite a file. Never push. Commit only on the owner's yes in step 6, and only the setup files.
- Never move, rename or delete a doc. Moves happen only after the owner approves a reorganisation proposal (step 7).
- Follow the project's own agent instructions (`CLAUDE.md` or similar): its branch rules, commit style, test commands and approval rules. Where they differ from this skill, they win.
- Do not edit files under `immutablePrefixes` in `docs-kit.json`.
- Ask with the question tool when there is one (in Claude Code, AskUserQuestion), with your recommendation first and marked "(Recommended)", so each answer is one choice.

## Step 1 — Preflight (read-only)

Run each, and report PASS or STOP:

- `git rev-parse --show-toplevel`: must be inside a git repository. If not, STOP and say why: `init` reads what git tracks.
- `node --version`: must be 22 or later. If not, STOP.
- `DOCS_KIT --version`: report it. This is the version `init` pins.
- `git branch --show-current`, and the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else `main`).
- `git status --porcelain`: note any uncommitted changes. They are not the setup's; the commit in step 6 leaves them out.
- Read the project's agent instructions for: branch rules, commit message style, the test command, and rules about new dependencies.

If `docs-kit.json` exists, say so: `init` keeps it and only adds what is missing.

## Step 2 — Look before asking (read-only)

1. Run `DOCS_KIT init --dry-run` (add `--docs-root <dir>` if the user gave one). It writes nothing. Keep its output for the prompt.
2. **Test file.** `init --test <file>` writes the layout check as a test. Find where tests live:
   - A `vitest.config.*` or `vite.config.*`: read its `test.include`. The file must match it. With no `include`, vitest finds `*.test.*` anywhere outside `node_modules`.
   - Tests in a folder (`test/`, `tests/`, `__tests__/`) or beside the code: follow what the repo does.
   - `pytest.ini`, `pyproject.toml` with `[tool.pytest.ini_options]`, or `conftest.py`: a `.py` file where pytest looks (`testpaths`).
   - No test runner: propose none, and say that `npm run docs:check` (or the npx command) can run in CI.

   Use `.ts` only if the repo's tests are TypeScript. `init` writes the test only once the check passes; while it fails, the path is kept for the last slice of the reorganisation.
3. **Protected paths.** `init` already protects every doc that a file under `immutablePrefixes` names (default L3; the dry run's "Found:" lines list them). Look for the others, which need the owner: doc paths in database seeds, in code that reads a doc at run time (a help page that loads `docs/...`), and in URLs other systems link to. Use `git grep -n "docs/"` outside the docs root. Give each its reason. A test or a script that names a doc by its full path is **not** one: `move` rewrites it. List it as a hazard for the reorganisation instead.
4. **Frozen folders** (default L4): folders under the docs root that the project's instructions call historical, frozen, or not to be edited. They go in `immutablePrefixes`, so `move` never edits them.
5. **Roles** (for later): who reads the how-tos (for example `customer`, `support`, `admin`), from the app's own roles. Short lower-case names; none if the app has one kind of user. Do not ask about them now: `roles` is written only once how-tos exist (with `roles` set and no how-tos, the check fails). They go in the reorganisation proposal.

## Step 3 — One prompt: the defaults, to approve or override

Show the dry run's plan in a few lines (what it creates or updates, and the "Found:" lines that explain `docs-kit.json`). Then show the defaults you will apply, one line each, with the reason:

1. **Branch.** On the default branch, a shared branch named in the project's rules (such as `dev`), or a feature branch for other work: a new branch from here, named by the project's rules or else `docs/adopt-docs-kit`. Uncommitted changes come along and stay out of the setup commit. On a branch already for this work: stay.
2. **Dependency.** When the dry run updates `package.json`: add `docs-kit` as a devDependency pinned to `v<version>`, and a `docs:check` script. It has no dependencies of its own and never ships with the app. When the project's rules say not to add a dependency without asking, this line becomes a question; declining means `--no-package`, and the check runs with `npx github:techsilon-oss/docs-kit#v<version> check`.
3. **Test file.** The path from step 2, or none.
4. **Protected.** The docs `init` protects (L3), with the files that name them.
5. **Frozen.** The folders from step 2 that go in `immutablePrefixes` (L4).

Ask one question: "Apply these?" — apply (Recommended), or change something. Add a separate question only for what no rule settles: a protected path found in seeds, code or URLs (step 2), or a dependency the project's rules say to ask about. On "change something", take the owner's changes and go on; do not ask again.

## Step 4 — Do the work

On the answers, in order:

1. Create the branch if chosen (`git switch -c <name>`).
2. Run `DOCS_KIT init` with `--test <path>` if a path was chosen and `--no-package` if the dependency was declined. Show the output as printed.
3. In `docs-kit.json`: add any other protected paths the owner approved to `protected`, each with its reason, and the frozen folders to `immutablePrefixes`. Remove any protected path the owner rejected. Then run `DOCS_KIT check`.
4. If `init` added the devDependency, run the project's install (`npm install`, or the lockfile's tool: `pnpm`, `yarn`, `bun`). The yes in step 3 covers it.

## Step 5 — Explain the findings

`init` ends with the layout check. A docs folder that does not follow the layout yet fails it: say that this is expected, and that `init` worked. Group the errors and warnings by kind, one line each on what it means and how it gets fixed. Do not fix any of them now.

| Finding | Meaning | Fixed by |
|---|---|---|
| `not allowed at the docs root` | A file at the docs root that is not the front door or a bootstrap doc | Moving it into a subject (reorganisation) |
| `folder is not a configured subject` | A docs-root folder not in `subjects` | Adding it to `subjects`, or moving it |
| `missing (every subject folder needs a map)` | A subject folder with no `README.md` | Writing that README (a short map of the folder) |
| `missing (the front door)` | No `docs/README.md` | `init` writes one; if it is listed, re-run `init` |
| `no exports/ tree` | Generated docs in an `exports/` folder | Moving them to `<subject>/snapshots/<topic>/` |
| `doc map file not found`, or a doc map path that does not exist | A gate names a doc that is not there | Fixing the map, or the doc's path |
| `how-tos are named HOWTO-<task>.md`, `last_checked` | A how-to's name or its freshness date | Renaming it with `move`, or checking the steps and setting `last_checked` |
| Role findings (`no roles:`, `How-tos by role`) | Only when `roles` is set | Adding `roles:` to each how-to, then `DOCS_KIT index` |

## Step 6 — One question: commit the setup

List the files the setup changed (from `init`'s output, plus the lockfile if the install ran) and `git diff --stat` of them. Then ask one question:

"Commit the setup on `<branch>` as `<message>`?" — the message in the project's commit style, else `chore(docs): adopt docs-kit <version>`. The answers: commit (Recommended), or leave it for the owner to review.

On a yes: if the project's rules say to run tests before a commit, run them first and stop if they fail. Stage only the setup files by name (never `git add -A`: other uncommitted work stays out), commit, and show `git log --oneline -1`. Never push; say how the branch reaches the shared branch under the project's rules (for example, a pull request into `dev`).

The setup is safe to commit while the check fails: `init` adds no failing test, and `docs:check` is a separate script, not part of the tests.

## Step 7 — One next step

If the check passed, the setup is done: say so, and stop.

If it failed, ask one question: "Start the reorganisation with a read-only audit?" (Recommended), or stop here. On a yes, follow DESIGN §6.3 of docs-kit (https://github.com/techsilon-oss/docs-kit/blob/main/docs/DESIGN.md):

1. **Audit**, read-only: every file under the docs root, every doc path named outside it, generators, `.gitignore` rules, path-based keys, and paths built in pieces.
2. **Proposal**, saved as a dated note in `docs/notes/`: the subject list, an old → new table for every file, protected paths with reasons, the roles from step 2, the hazards found, and the slices (one pull request each). Apply the least-change defaults (DESIGN §6.3, L1 to L10) and list the ones you applied, so the owner can override any. Add the note itself to `immutablePrefixes` in the same commit (L10): it records the old paths, and `move` must not rewrite it.
3. **The owner approves** the proposal once. Ask about `roles` before that, if the repo will have how-tos; ask nothing else a default settles. Nothing moves before the approval.
4. **Each slice:** `DOCS_KIT move <old> <new> --dry-run`, then `move`, then the project's tests and `DOCS_KIT check`. Stage everything `git status` lists, not only the docs folders. Open the pull request.
5. **Close:** once the check passes, run `DOCS_KIT init --test <path>` with the path from step 2, so the check runs in the tests; add `roles` and run `DOCS_KIT index` if the how-tos exist. Record the decision in the project's decision log.

## If something fails

- `init` exits 2: show its message. Nothing was written. Fix the cause (a wrong `--test` extension, a path outside the repo, not a git repository) and run step 2 again.
- A docs-kit bug or a missing feature: say so plainly, and suggest an issue at https://github.com/techsilon-oss/docs-kit/issues. Describe it with invented names, not the project's own.
