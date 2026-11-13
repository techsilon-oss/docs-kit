---
name: docs-kit-pin
description: PIN-4-L8R. Save the current discussion as a pinned note in docs/notes/, or save step-by-step instructions as a how-to in docs/<subject>/howto/, with optional .docx and .pdf print copies; list waiting pins; mark a pin promoted or dropped. Follows the docs-kit layout and keeps the layout check passing. Use when the user says "PIN-4-L8R", "pin this", "save this for later", "document these steps", or /docs-kit-pin.
argument-hint: "[title] [--howto <subject>] [--print] | list | promote <file> <target> | drop <file> <reason>"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" check*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" index*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs" print *) Read Glob Grep
---

# `/docs-kit-pin` — PIN-4-L8R

> Good analysis and good instructions get lost in chats and context windows. A pin keeps a discussion. A how-to keeps instructions. Each has one place, a clear title, its context and its date.

The CLI is the plugin's own copy: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs-kit.mjs"`. Below it is written as `DOCS_KIT`.

**Where docs live.** Read `docs-kit.json` at the repo root for `docsRoot` (default `docs`), `subjects` and `roles`. Below, `docs/` means the docs root. If the repo has no docs root, ask before you create one, and suggest `/docs-kit-init`.

**Follow the project's own agent instructions** (`CLAUDE.md` or similar): its branch rules, commit style and required front-matter fields win over this skill.

## Two kinds of record

| Kind | Use for | Where | Name | Changes after saving? |
|---|---|---|---|---|
| **Pin** | A discussion, an analysis, the context of a decision | `docs/notes/` | `<YYYY-MM-DD-HHMM>_<kebab-title>.md` | **No.** It records what was said on that date |
| **How-to** | Step-by-step instructions for one task | `docs/<subject>/howto/` | `HOWTO-<kebab-task>.md` | **Yes.** Keep it correct; update `last_checked` each time |

If it is not clear which kind the user wants, ask. That is the only question; derive everything else.

If `notes` (for a pin) or the how-to's subject is not in `subjects`, add it to `subjects` in `docs-kit.json`, and give the new folder a short `README.md` that maps it. Say that you did. Pick an existing subject for a how-to when one fits; add a new subject only when none does.

## Writing rule (both kinds)

Write in the spirit of ASD-STE100 (Simplified Technical English). For a how-to, every rule is mandatory:

- One action per step. Number the steps.
- Imperative mood: "Open", "Select", "Copy".
- Put the condition before the instruction: "If the page shows X, select Y."
- One word for one meaning. Use the exact label shown on screen, in **bold**. No synonyms for variety.
- Short sentences. Active voice. The simple, common word.
- Put warnings before the step they apply to, not after.
- Never put a secret (key, password, token) in the file. Say where the user stores it.
- **Say where each step happens.** Name the program and the window: "in a Windows PowerShell window", "in the vendor's dashboard, live mode", "in Claude Code". Never write just "a terminal". If a command waits for input or opens a browser, say that it must run in the user's own terminal window, not in an agent's terminal. Use one shell per how-to, and say how to open it.

## `/docs-kit-pin [title] [--print]` — save a pin

1. **Title.** Use the argument. If there is none, derive a short title and say which one you used.
2. **Name.** Run `date '+%Y-%m-%d-%H%M'`. Write `docs/notes/<date-time>_<kebab-title>.md`.
3. **Content.** Write the discussion so a reader who was not there understands it. **Keep it whole:** the analysis, numbers, tables, options, decisions and open questions. A pin is not a short summary.
   - Start with: date, who took part (by role), why it came up.
   - Mark each claim about code or a vendor **Verified** (with the source), **Assumed** (who confirms) or **Open** (who decides).
   - Put the owner's decisions in their own section, with the date. Never record a proposal as a decision.
   - End with **Sources**: files, issues, URLs.
4. **Front matter** (add the repo's own required fields too):
   ```yaml
   ---
   title: "<title>"
   doc_kind: "note"
   pin_status: "pinned"     # pinned | promoted | dropped
   promoted_to: ""          # doc path, issue or decision, once promoted
   subjects: []             # the subject folders it belongs to
   ---
   ```

## `/docs-kit-pin --howto <subject> [title] [--print]` — save a how-to

1. **Name.** `docs/<subject>/howto/HOWTO-<kebab-task>.md`. If a how-to for the same task exists, update it. Never make a second one.
2. **Content, in this order:**
   - **Title:** "How to <task>".
   - **Purpose:** one sentence.
   - **Before you start:** what the user needs (access, tools, time).
   - **Steps:** numbered, one action each (writing rule above).
   - **Check:** how the user knows it worked.
   - **If it fails:** the common problems and what to do.
   - **Sources:** vendor docs or pages used, with links.
3. **Front matter:**
   ```yaml
   ---
   title: "How to <task>"
   doc_kind: "howto"
   last_checked: "<YYYY-MM-DD>"   # the date the steps were last checked against the real screens or code
   roles: [<role>, ...]           # only when docs-kit.json lists roles: who does this task
   subjects: ["<subject>"]
   ---
   ```
   Set `last_checked` to today only for steps you checked against the code or the screens; otherwise ask the owner to check them, and say so in the summary. When `docs-kit.json` lists `roles`, pick the roles from that list from who the steps are for, and name them in the summary so the owner can change them.
4. **Index.** When `docs-kit.json` lists `roles`, run `DOCS_KIT index`, so the "How-tos by role" section of the front door lists the new how-to.

## Print copies (`--print`, or when the user asks for Word or PDF)

Run `DOCS_KIT print <file>`. It writes `<NAME>_v<X.Y>_<YYYY-MM-DD>.docx` and `.pdf` beside the source and removes the older print copies of the same doc. The version goes one minor up from the newest copy; pass `--version X.Y` to set it. Without pandoc it skips printing and says so: tell the owner, and carry on.

When it made a PDF, open it. Check page 1 and every table it warned about. Split a table that runs off the page, then print again.

## Check and commit

1. Run `DOCS_KIT check`. It must not report a new error for the files you wrote. Fix what it reports in those files.
2. Commit only the files you wrote or changed (by name, never `git add -A`): the pin or how-to, its print copies, the front door if `index` changed it, `docs-kit.json` and a new folder README if you added a subject. Message: `docs(notes): <title>` or `docs(howto): <task>`, or the project's commit style. If the project's rules forbid committing on the current branch (for example the default branch), ask which branch to use.
3. Never leave a pin or a how-to uncommitted. Push only when the project's rules say the working branch is pushed, or the owner asks.
4. Report the paths, the `.pdf` first if made.

## `/docs-kit-pin list`

Find the pins with `pin_status: "pinned"` under `docs/notes/` (Grep). Show each pin's date, title and subjects, oldest first. Then run `DOCS_KIT check` and list the how-tos it reports as stale (`last_checked`).

## `/docs-kit-pin promote <file> <target>` and `/docs-kit-pin drop <file> <reason>`

- **Promote** when the content now lives in its canonical home (a doc, an issue, a decision). Set `pin_status: "promoted"` and `promoted_to: "<target>"`. The pin stays as the record.
- **Drop** when it no longer matters. Set `pin_status: "dropped"` and add one line under the title with the reason.
- Never rewrite a pin's content after it is saved. Change only these front-matter fields and the drop line. Then commit, as above.

## Rules

- **A pin is not canonical.** Never cite it as the current state; cite the doc it was promoted to.
- **A how-to is canonical for its task.** One per task. Keep `last_checked` true.
- If a docs-kit command fails in a way that looks like a bug, say so plainly, and suggest an issue at https://github.com/techsilon-oss/docs-kit/issues. Describe it with invented names, not the project's own.
