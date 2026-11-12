# docs-kit — design spec

> **Status:** draft 2026-10-31; owner decisions added 2026-11-12 (§11 answered, §3, §4.1, §10). Rollout step 0.1 (`docs-kit.json`, `check` with how-tos by role, `index`, `move`, hazard tests) was released as v0.1.0 on 2026-11-12; see [CHANGELOG.md](../CHANGELOG.md). Later steps are not built yet.
> **Owner:** TechSilon LLC. **Decisions in this file:** marked **Decided**. Everything else is a proposal until the owner approves it.

---

## 1. Problem

Every project's `docs/` folder grows the same way: one folder per tool or per session, generated exports in their own tree, analysis that lives only in a chat, instructions that live only in someone's head. After a year, "where is the doc about X?" has no stable answer. In one project audited for this spec, the material for a single subject sat in nine places, and the generated exports had drifted away from the docs they summarised.

Moving docs later is expensive and risky. Links break, scripts and config files hold hard-coded paths, and some tools do damage when pointed at a new folder (see [§7 Hazards](#7-hazards-found-in-a-real-reorganisation)).

## 2. Goal

One maintained standard, usable in any repo, that answers "where is X?" the same way everywhere, and the tools that make it cheap to adopt and keep:

1. a **layout rule** for `docs/`;
2. a **layout check** that fails when the rule is broken;
3. a **mover** that moves docs and keeps every reference working;
4. a **guided reorganisation** for a repo that does not follow the rule yet;
5. **pins and how-tos** (`/pin`), so analysis and instructions are not lost in chats;
6. **snapshot routing** for generated docs;
7. **print copies** (.docx and .pdf) beside their source.

**Decided (2026-10-31):** this is its own repo, the same pattern as `release-gate-kit`: usable with no governance buy-in. `govkit` gets a thin, optional module that uses it ([§9](#9-govkit-module-optional)). docs-kit never depends on govkit.

## 3. Non-goals

- Not a docs website generator. The output is Markdown in the repo.
- Not a writing-style linter, except the how-to writing rule in `/pin`.
- Does not decide a project's subjects. It gives a starting list and the project edits it.
- **Not feature records or test traceability.** **Decided (2026-11-12):** records that tie code to a feature, a test case and an automated test belong to [qa-kit](https://github.com/techsilon-oss/qa-kit). docs-kit holds a feature's design and plans (`<subject>/features/<feature>/`) and may link to qa-kit's records, but never defines their format or checks them.

---

## 4. The layout rule

```
docs/
  README.md                  the front door: one line per subject, "where is X?"
  <bootstrap docs>           optional, listed in config (e.g. a project hub, a roadmap)
  <subject>/                 one folder per subject
    README.md                the map of this subject
    <CANONICAL-DOC>.md       the current truth for one concern
    <NAME>_v<X.Y>_<YYYY-MM-DD>.docx / .pdf   print copies, beside their source
    howto/HOWTO-<task>.md    step-by-step instructions
    features/<feature>/      design and plans for one feature
    snapshots/<topic>/       generated docs, dated in the file name
  notes/                     pins: dated records of a discussion
  archive/<subject>/...      superseded material, same shape as the live tree
```

Rules:

1. **The root holds only allowed entries:** `README.md`, the bootstrap docs named in config, and the subject folders. Nothing else. Adding to the list is an owner decision.
2. **Every subject folder has a `README.md`** that maps it.
3. **One source of truth per concern.** A canonical doc is refreshed, never duplicated.
4. **There is no separate `exports/` tree.** Generated docs go to `<subject>/snapshots/<topic>/`.
5. **Print copies sit beside their source,** named `<NAME>_v<X.Y>_<YYYY-MM-DD>`. Only the newest print copy stays.
6. **Archive mirrors the live tree:** `archive/<subject>/...`.

### Doc layers

Every doc is one of five kinds. A project's agent instructions (for example `CLAUDE.md`) should name them:

| Layer | What it is | Changes after writing? |
|---|---|---|
| **Canonical** | The current truth for one concern | Yes: kept correct |
| **Snapshot** | Generated, dated, links and quotes canonical docs | No: a new one replaces it |
| **How-to** | Steps for one task, with a `last_checked` date | Yes: kept correct |
| **Note** (pin) | A dated record of a discussion or analysis | No: promoted or dropped, never rewritten |
| **Archive** | Superseded material | No |

### 4.1 How-tos by role

**Decided (2026-11-12):** the layout includes a **per-role index of how-tos**, so a reader can answer "what can I do, and where are the steps?" for their own role without knowing the subject folders. Many apps have several kinds of user (for example a customer, support staff, an administrator), and today their guides end up as one long manual or as one guide per role that repeats the same steps.

**Decided (2026-11-12, build session):** the front-matter key is `roles`, and the index is generated by `docs-kit index` and verified by `docs-kit check`.

- Each how-to names who it is for in its front matter: `roles: [customer, support]`. The project lists its roles once, in `docs-kit.json` (`"roles": [...]`).
- The front door (`docs/README.md`) has a **How-tos by role** section: one list per role, each line linking a how-to. One how-to appears under every role it names; the steps are written once.
- `docs-kit index` writes the section between the markers `<!-- docs-kit:howtos-by-role:start -->` and `<!-- docs-kit:howtos-by-role:end -->` (adding a `## How-tos by role` heading the first time). Roles appear in config order; how-tos are sorted by title (front-matter `title`, else the first heading). The section is generated, never hand-kept.
- `docs-kit check` fails when a how-to names a role that is not in config, when a how-to has no `roles`, when the section is missing, or when it does not match what `index` would write. These checks run only when `roles` is configured. Archived how-tos are not indexed.

### Starter subject list

Offered by the reorganisation skill, then edited per project: `product`, `platform` (architecture, infrastructure), `operations` (runbooks, launch, incidents), `testing`, `money` (payments, pricing, tax), `legal`, `business`, `support`, `notes`, `archive`. A project's core domain (what the product does for its users) usually gets one subject of its own.

## 5. Configuration: `docs-kit.json`

One file at the repo root. Every tool reads it; nothing is hard-coded.

```jsonc
{
  "docsRoot": "docs",
  "subjects": ["product", "platform", "operations", "testing", "notes", "archive"],
  "rootAllowed": ["README.md", "PROJECT-HUB.md", "PRIORITY-ROADMAP.md"],
  // Extra root entries another tool writes into, with the reason.
  "rootAllowedTools": { "superpowers": "a plugin writes its plans here" },
  // JSON files that list doc paths which must exist (doc-sync or gate maps).
  "docMaps": [{ "file": "scripts/source-doc-map.json", "path": "mappings[].docs[]" }],
  // Paths that must never move, with the reason (see hazard H2).
  "protected": { "docs/support": "path is a key in a production database" },
  // Files the mover never edits (see hazard H3).
  "immutablePrefixes": ["db/migrations/"],
  // Snapshot topic -> subject (see §6.6).
  "snapshotTopics": { "architecture": "platform", "launch-readiness": "operations" },
  "howtoStaleDays": 90,
  // Roles that how-tos may name (see §4.1).
  "roles": ["customer", "support", "admin"]
}
```

## 6. Components

All scripts: **Node built-ins only** (`.mjs`, no runtime dependencies), the same as `release-gate-kit` and `govkit`, so they run in any repo with Node. Skills ship as a Claude Code plugin. A project can vendor the scripts; a vendored copy carries a banner and its version, and fixes come back here.

### 6.1 Layout check — `docs-kit check`

Exit 0 when the rule holds, non-zero with a list when it does not. Checks:

1. Only allowed entries at the docs root.
2. Every subject folder has a `README.md`.
3. Every doc named in a configured doc map exists. (A gate whose doc moved without its map being updated stops matching silently instead of failing.)
4. **No vacuous pass:** each check that scans a set asserts the set is not empty. A check that reads zero docs because a path changed must fail, not pass.
5. Snapshot freshness (warning only): the date comes from the **file name**, never from file contents or modification time (hazard H6).
6. How-tos whose `last_checked` is older than `howtoStaleDays` (warning only).
7. How-tos by role (§4.1): every how-to names known roles, and the index matches the front matter.

Runs as a CLI and is easy to wrap as a unit test (a ten-line example for vitest and for pytest ships in `examples/`).

### 6.2 Mover — `docs-kit move <old> <new> [<old> <new> ...] [--dry-run]`

For each pair (file or folder):

1. Moves with `git mv` so `git log --follow` keeps history. **Moves file by file**, never a whole-folder rename (hazard H5).
2. Rewrites relative Markdown links in the moved files and in every file that links to them.
3. Replaces repo-root path strings (`docs/old/X.md`) in every tracked text file: scripts, config, workflows, agent instructions, skills, code comments. **Matches a path followed by punctuation** such as a full stop or a closing bracket (hazard H8).
4. Never edits `immutablePrefixes`. Never moves a `protected` path: refuses with the reason.
5. Never edits `archive/` content, except links that point into a moved path.
6. **Searches for the path built in pieces** (`join("docs", "old")`, quoted segments `"old"`) and prints every hit for review. It does not rewrite them (hazard H7).
7. **Prints every file it changed,** and ends with `git status --porcelain`. The caller must stage all of them (hazard H9).
8. Runs `docs-kit check` at the end.

### 6.3 Guided reorganisation — `/docs-reorg` (skill)

For a repo that does not follow the rule. Never moves anything before the owner approves the proposal.

1. **Audit** (read-only): inventory every file under `docs/` and every doc path referenced outside it; group by likely subject; find generators, gitignore rules, path-based keys and pieced-together paths (the hazard list is the checklist).
2. **Proposal:** the subject list, the old → new table, the protected paths with reasons, the hazards found, and the slices. Written as a pin (`docs/notes/`) so it survives the session.
3. **Owner approves** the subject list and the naming.
4. **Slices:** one pull request per slice (for example: front door and READMEs; one subject per slice; generators last). Each slice: `move --dry-run`, `move`, run the project's tests and `check`, stage everything changed, confirm a clean working tree, open the PR.
5. **Close:** write `docs-kit.json`, add the layout check to the project's tests or CI, record the decision in the project's decision log.

### 6.4 Pins and how-tos — `/pin` (skill)

An existing skill, used for real in one project, moves here and becomes project-neutral:

- `/pin [title]`: save a discussion to `docs/notes/<YYYY-MM-DD-HHMM>_<title>.md` with `pin_status: pinned`. Whole, not summarised. Claims marked Verified, Assumed or Open. Owner decisions in their own section.
- `/pin --howto <subject> [title]`: save steps to `docs/<subject>/howto/HOWTO-<task>.md`, written in the spirit of ASD-STE100 (one action per step; say in which program and which window each step happens; never a secret in the file).
- `/pin list`, `/pin promote <file> <target>`, `/pin drop <file> <reason>`.
- `--print` makes the print copies (§6.5).

When it moves, remove every project-specific script name from the skill text; it calls `docs-kit print`.

### 6.5 Print copies — `docs-kit print <file.md> [--version X.Y]`

Makes `.docx` and `.pdf` beside the source with the naming rule, and removes the older print copies of the same doc. Uses `pandoc` when it is installed; otherwise reports that printing was skipped. Warns about tables wider than the page. **Decided (2026-11-12):** `pandoc` only, no bundled fallback; when it is absent, printing is skipped with a message, never an error.

### 6.6 Snapshot routing — a small library

For projects that generate docs:

- `snapshotDir(topic)` returns `docs/<subject>/snapshots/<topic>/` from `snapshotTopics`. **An unknown topic is an error**, never a default folder.
- `archiveOlder(dir, keep)` moves older snapshots to `archive/<subject>/snapshots/<topic>/`. **It refuses any folder that is not a `snapshots/<topic>/` folder** (hazard H1).
- File names carry the date: `<TOPIC>_<YYYY-MM-DD>.md`.

Node first. A Python port is a later option, only if a trial project needs it.

## 7. Hazards found in a real reorganisation

Each hazard below happened, or nearly happened, during one reorganisation of a large `docs/` tree. Each has a guard in the tools. The audit step checks for all of them.

| # | Hazard | What goes wrong | Guard |
|---|---|---|---|
| H1 | A generator archives "every other file" in its output folder | Pointed at a subject folder, it archives the canonical docs | Snapshots get their own folder; the archive helper refuses other folders |
| H2 | A folder path is a key somewhere else (a database row, a URL, an external index) | Moving it breaks production, and no test shows it | `protected` paths with reasons; the audit searches for path-shaped strings in seed data and config |
| H3 | Immutable files hold old paths (applied database migrations, signed records) | A rewrite edits a file that must never change | `immutablePrefixes` |
| H4 | `.gitignore` rules for confidential files use exact paths | After a move, confidential files are no longer ignored and can be committed | The audit lists every gitignore rule under `docs/`; the mover rewrites them and the slice checks `git status` for newly visible files |
| H5 | Windows locks a folder that an editor, indexer or terminal has open | A whole-folder rename fails part way | Move file by file |
| H6 | A hook or formatter re-stamps dates inside files | Freshness read from contents or modification time is wrong | Freshness reads the date in the file name |
| H7 | Code builds paths in pieces (`join(root, "docs", "exports", "legal")`) | A text search for `docs/exports/legal` misses it; the tool writes to the old place | The mover searches for quoted segments and lists every hit for review |
| H8 | A path is followed by a full stop at the end of a sentence | The rewrite pattern skips it | The pattern allows trailing punctuation |
| H9 | A repo-wide rewrite changes files outside the folders you stage | Changes stay uncommitted across several PRs | The mover prints every changed file and ends with `git status --porcelain` |
| H10 | A test scanner reads zero files after a move | The check passes vacuously | Every scanning check asserts a non-empty set |

## 8. Distribution

- **Plugin:** the skills (`/pin`, `/docs-reorg`) as a Claude Code plugin from this repo.
- **Scripts:** `scripts/docs-kit.mjs` with subcommands `check`, `index`, `move`, `print`, plus `lib/snapshots.mjs`. Usable through `npx` from this repo, or vendored.
- **Versioning:** semver and a `CHANGELOG.md`. A vendored copy records its version.

## 9. govkit module (optional)

docs-kit stands alone. When a repo also uses govkit, a thin module in govkit (built there, not here):

- `/govkit-doctor`: reports whether docs-kit is configured, its version, and the result of `docs-kit check`;
- `/govkit-session status`: lists waiting pins and stale how-tos;
- `/govkit-session close`: runs `docs-kit check` and asks whether anything from the session should be pinned.

## 10. Rollout

| Step | What | Done when |
|---|---|---|
| 0.1 | Layout rule, `docs-kit.json`, `check` (including how-tos by role, §4.1), `move`, tests for every hazard guard | Both commands pass their tests on a fixture repo that reproduces H1 to H10 |
| Trial 1 | A small app repo the owner names, with several user roles; its docs are scattered, with two guides for the same task that disagree, one guide per role, and developer notes mixed into user guides. No generator. It adopts 0.1: the proposal is written by hand following §6.3, the moves are made with `move`, and `check` runs in its tests | Its `docs/` follows the rule, its how-tos are indexed by role, and the check runs in its tests. What the hand-written proposal needed feeds `/docs-reorg` in 0.3 |
| 0.2 | `/pin` (neutral), `print` | A pin and a how-to with print copies are made in a fixture repo |
| 0.3 | `/docs-reorg`, snapshot library | Used end to end on a trial repo |
| Trial 2 | A repo with a generator that writes to `docs/exports/` | Its snapshots go through the library; its `docs/` follows the rule |
| Trial 3 | A larger repo that was reorganised by hand switches to the kit's tools | Its own docs scripts are replaced by the kit |
| Clean-up | Retire the older docs-generator template in the house standards repo | Nothing points to it |

**Decided (2026-11-12):** 0.1 is built first and on its own, in this repo, with no connection to any trial repo. Trial 1 then adopts the tagged release; nothing in this repo is written for it.

## 11. Owner questions

Answered 2026-11-12. **All four are Decided.**

1. **Node only for 0.1?** Yes. A Python port only if a trial needs it.
2. **Plugin name:** `docs-kit` for both the repo and the plugin.
3. **Print engine:** `pandoc` only, no bundled fallback. Skipped with a message when absent (§6.5).
4. **Public from day one?** Yes. The fixture repo and examples use invented names.

The §4.1 details were answered in the 0.1 build session (2026-11-12): the key is `roles`, and the index is generated by `docs-kit index` and checked by `docs-kit check`.

## 12. Rules for work in this repo

- **No client or project names**, anywhere: issues, PRs, docs, code, comments, examples, test fixtures. Describe problems generically. Examples use invented names (`example-app`). GitHub keeps the edit history of issues, so a draft that names a client is deleted and opened again, not edited.
- Conventional commits. Never push directly to `main` after the first commit; work on `dev` and release by PR.
- Each hazard guard has a test that reproduces the hazard.
