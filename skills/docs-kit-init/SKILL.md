---
name: docs-kit-init
description: Set up docs-kit in the current repo, then explain what the layout check found and what to do next. Runs `docs-kit init` (a starter docs-kit.json, the front door, a pinned devDependency, a docs:check script, the check as a test), proposes roles and protected paths, and offers the guided reorganisation. Never overwrites, never commits, never moves a doc. Use when a repo adopts docs-kit, or when docs-kit.json is missing.
argument-hint: "[--docs-root <dir>]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" init*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" check*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" --version) Bash(git rev-parse *) Bash(git status *) Bash(git grep *) Bash(git ls-files *) Bash(node --version) Read Glob Grep
---

# /docs-kit-init — set up docs-kit in this repo

`docs-kit init` does the setup. This skill runs it, then adds what needs judgement: it explains the findings, proposes the values only the owner knows, and leads into the reorganisation.

The CLI is the plugin's own copy: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs"`. Below it is written as `DOCS_KIT`. Run it from the repo root.

**Rules for the whole skill:**

- Never overwrite a file, never commit, never push. The owner reviews and commits.
- Never move, rename or delete a doc. Moves happen only after the owner approves a reorganisation proposal (step 6).
- Follow the project's own agent instructions (`CLAUDE.md` or similar): its branch rules, its test commands, its approval rules.
- Do not edit files under `immutablePrefixes` in `docs-kit.json`.
- Ask before you run `npm install` or any other install.

## Step 1 — Preflight

Run each, and report PASS or STOP:

- `git rev-parse --show-toplevel`: must be inside a git repository. If not, STOP and say why: `init` reads what git tracks.
- `node --version`: must be 22 or later. If not, STOP.
- `git status --porcelain`: if there are uncommitted changes, say so, and ask whether to continue. Setup changes are easier to review on a clean tree.
- `DOCS_KIT --version`: report it. This is the version `init` pins in `package.json`.

If `docs-kit.json` exists, say so: `init` keeps it and only adds what is missing.

## Step 2 — Show the plan

Run `DOCS_KIT init --dry-run` (add `--docs-root <dir>` if the user gave one). It writes nothing. Show its output as printed, then say in one or two sentences what it would create or update and why.

## Step 3 — Choose where the test goes

`init --test <file>` writes the layout check as a test. Where tests live is a project choice, so find it:

- A `vitest.config.*` or `vite.config.*`: read its `test.include`. The file must match it. If there is no `include`, vitest finds `*.test.*` anywhere outside `node_modules`.
- Tests in a folder (`test/`, `tests/`, `__tests__/`) or beside the code: follow what the repo does.
- `pytest.ini`, `pyproject.toml` with `[tool.pytest.ini_options]`, or `conftest.py`: a `.py` file where pytest looks (`testpaths`).
- No test runner: propose no test file, and say that `npm run docs:check` (or the npx command) can run in CI.

Propose one path, for example `tests/docs-layout.test.mjs`. Use `.ts` only if the repo's tests are TypeScript.

`init` writes the test only when the check passes. While the check fails, it skips the test and says "not yet": a failing test would block every commit during the reorganisation. The test then goes in with the last slice of the reorganisation (step 7).

## Step 4 — Run it, on one yes

Ask once: "Run `docs-kit init` with the test at `<path>`?" On a yes, run `DOCS_KIT init --test <path>` (no `--test` if the owner chose none). Show the output as printed. If it skipped the test as "not yet", say why in one line, and keep the path for later.

## Step 5 — Explain the findings

`init` ends with the layout check. A docs folder that does not follow the layout yet fails it: say that this is expected, and that `init` worked.

Group the errors and warnings by kind. For each kind, say in one line what it means and how it gets fixed. Do not fix any of them now.

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

Then read the "Found:" lines from `init` back to the owner, so they see why each value is in `docs-kit.json`.

## Step 6 — Propose what only the owner knows

`init` leaves two keys empty. Propose values from what the repo shows, and write them only after the owner agrees:

- **`protected`**: doc paths that must never move, because something outside the docs uses the path as a key. Look for doc paths in database seeds and migrations, in code that reads a doc file at run time (for example a help page that loads `docs/...`), and in URLs that other systems link to. Use `git grep -n "docs/"` outside `docs/`. Give each path a reason. If you find none, say so.
- **`roles`**: who reads the how-tos (for example `customer`, `support`, `admin`). Look at the app's own roles (an access or roles doc, role names in the code, per-role guides). Use short lower-case names. If the app has one kind of user, propose no roles.

Edit only these two keys in `docs-kit.json`, then run `DOCS_KIT check` and show the result.

Write `roles` only when how-tos exist (`<subject>/howto/HOWTO-<task>.md`). With `roles` set and no how-tos, the check fails ("no how-tos were found"). Before then, keep the proposed roles for the reorganisation proposal; they go into `docs-kit.json` in the slice that adds the first how-tos, together with `DOCS_KIT index`.

## Step 7 — Next steps

Tell the owner, as a numbered list:

1. Run `npm install` if `init` added the devDependency. Ask before you run it.
2. Review the changes with `git status` and `git diff`, and commit them on the working branch. This skill does not commit. The setup is safe to commit while the check fails: `init` adds no failing test, and `docs:check` is a separate script, not part of the tests.
3. If the check fails, offer the reorganisation. Do not start it without a yes. It follows DESIGN §6.3 of docs-kit (https://github.com/techsilon-oss/docs-kit/blob/main/docs/DESIGN.md):
   1. **Audit**, read-only: every file under the docs root, every doc path named outside it, generators, `.gitignore` rules, path-based keys, and paths built in pieces.
   2. **Proposal**, saved as a dated note in `docs/notes/`: the subject list, an old → new table for every file, protected paths with reasons, roles, the hazards found, and the slices (one pull request each).
   3. **The owner approves** the subjects, the names and the roles. Nothing moves before that.
   4. **Each slice:** `DOCS_KIT move <old> <new> --dry-run`, then `move`, then the project's tests and `DOCS_KIT check`. Stage everything `git status` lists, not only the docs folders. Open the pull request.
   5. **Close:** once the check passes, run `DOCS_KIT init --test <path>` with the path from step 3, so the check runs in the tests. Record the decision in the project's decision log.

## If something fails

- `init` exits 2: show its message. Nothing was written. Fix the cause (a wrong `--test` extension, a path outside the repo, not a git repository) and run step 2 again.
- A docs-kit bug or a missing feature: say so plainly, and suggest an issue at https://github.com/techsilon-oss/docs-kit/issues. Describe it with invented names, not the project's own.
