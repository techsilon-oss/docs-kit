# FAQ

Short answers. Each links to the guide that has the detail.

## Do I need Claude Code?

No. Every part works from a terminal with Node and git: `docs-kit init`, `check`, `move`, `index` and `print`. The Claude Code skills are an optional layer over the same commands. See [Adopt docs-kit](guides/howto/HOWTO-adopt-docs-kit.md).

## Does it send anything over the network?

No. docs-kit makes no network calls. `npx`, `npm install` and the plugin install download it from GitHub. See [What it does on your machine](../README.md#what-it-does-on-your-machine).

## The check fails right after `init`. Did something go wrong?

No. `init` describes your docs as they are, and the check then lists what does not follow the layout yet. [Reorganise a docs folder](guides/howto/HOWTO-reorganise-a-docs-folder.md) makes it pass.

## Why did `init` not write my test file?

Because the check fails. A failing test would block every commit while you reorganise. Run `init --test <file>` again once the check passes. See [Commands: init](reference/COMMANDS.md#docs-kit-init).

## Why did `init` protect a doc I did not name?

A file that `move` never edits, such as an applied migration, names that doc by its path. Moving the doc would leave that file pointing at nothing, for good. If the reason no longer holds, remove the path from `protected`. See [DESIGN §6.3, default L3](DESIGN.md#63-guided-reorganisation--docs-kit-reorg-skill).

## Our generated docs are gitignored. Does the check fail on them?

No. If git ignores a snapshot topic's folder, the check reports the topic as local-only, and does not ask for its snapshots. Keep the archive folder ignored too. See [Route generated docs to snapshots](guides/howto/HOWTO-route-generated-docs.md).

## Can a release change after I pin it?

No. Release tags never move: a bad release is fixed by a new release. For a stricter pin, use a commit instead of a tag. See [What it does on your machine](../README.md#what-it-does-on-your-machine).

## What if the maintainer stops working on docs-kit?

The Apache License 2.0 lets anyone fork it and go on. docs-kit has no runtime dependencies and no service behind it, so a pinned release keeps working. A fork uses its own name: see [TRADEMARKS](https://github.com/techsilon-oss/.github/blob/main/TRADEMARKS.md).

## `/pin` says it is now `/docs-kit-pin`. Why?

Every skill name starts with the kit's name, so it cannot clash with a project's own `/pin`. The old name works until the first release on or after 2026-12-13. See [Upgrading](UPGRADING.md).

## How do I report a security problem?

Use **Report a vulnerability** on the repo's **Security** tab, not a public issue. See [SECURITY](https://github.com/techsilon-oss/.github/blob/main/SECURITY.md).
