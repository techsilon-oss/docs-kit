---
name: docs-kit-help
description: Answer a question about docs-kit from the docs that ship with the installed version: what a command does, what a check finding means, how to set it up, upgrade or remove it. Read-only; runs nothing. Use for "how do I…", "what does … do", "why does the check say…" about docs-kit.
argument-hint: "<your question>"
allowed-tools: Read Grep Glob
---

# `/docs-kit-help`: answers from docs-kit's own docs

Answer the user's question about docs-kit **only from the docs that ship in this plugin**, for the version they have installed. Those docs describe exactly what they run. The web, or your memory of docs-kit, may describe another version.

**This skill reads; it never runs anything.** No Bash, no edits, no network. If the answer is "run X", tell the user to run it, or point at the skill that does it (`/docs-kit-init`, `/docs-kit-pin`).

## Steps

1. **The version.** Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, key `version`. Say it in the answer ("in docs-kit 0.3.1, …").
2. **Find the answer**, in this order, all under `${CLAUDE_PLUGIN_ROOT}`:
   1. `docs/FAQ.md`: short answers, each pointing at its guide.
   2. `docs/guides/howto/`: the steps to adopt, reorganise, print, upgrade and remove.
   3. `docs/reference/COMMANDS.md`: every command, option, finding and exit code.
   4. `docs/UPGRADING.md`: renames and breaking changes.
   5. `README.md`, then `docs/DESIGN.md` (why it works the way it does), then `CHANGELOG.md` (what changed when).

   Search them with Grep, and read the section you found with Read. **Only these files.** `CLAUDE.md` and `test/` describe docs-kit's own development, not the user's repo: never answer from them.
3. **Answer briefly, and cite** the file and section as a link pinned to the installed version: `https://github.com/techsilon-oss/docs-kit/blob/v<version>/<path>#<anchor>`. Use an anchor only for a heading you read in that file (lower case, punctuation dropped, spaces as hyphens). If you are not sure of a heading, link the file without an anchor.
4. **If the docs don't answer it, say so.** Don't guess. Point at https://github.com/techsilon-oss/docs-kit/issues, and suggest opening one if it is a gap in the docs.

## What this is not

- Not the check: for "what's wrong in my repo", the user runs `docs-kit check`. This skill explains what a finding means and how to fix it.
- Not a source of facts about the user's repo: it reads docs-kit's docs, never the repo's files.
