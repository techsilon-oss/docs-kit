# docs-kit

docs-kit gives every repo the same `docs/` layout, a check that keeps it, and a mover that changes where a doc lives without breaking a link or a path.

## What you get

- **Every doc has one place.** The front door, `docs/README.md`, lists one folder per subject, and each folder has a map.
- **A test fails when a doc is in the wrong place**, when a folder has no map, or when a file another tool reads is missing.
- **You move a doc and nothing breaks.** `docs-kit move` rewrites every link and every path to it: in other docs, scripts, config, CI workflows and agent instructions. It never edits a file that must not change, such as an applied migration.
- **Generated docs land in one known place.** A report script asks `docs-kit snapshot path` where to write, gets a dated name, and archives the older copies with `docs-kit snapshot archive`, in any language.
- **Readers find the steps for their own role.** How-tos name who they are for, and the front door lists them by role.
- **Notes and how-tos do not get lost in chats.** In Claude Code, `/docs-kit-pin` saves a discussion or a set of steps to its place, with `.docx` and `.pdf` copies if you ask.

## Quick start

From the root of your repo, in a terminal:

```sh
npx github:techsilon-oss/docs-kit#v0.4.0 init --dry-run
npx github:techsilon-oss/docs-kit#v0.4.0 init
npm install
```

The first command shows what `init` would write, and writes nothing. The second writes it and runs the check. On a docs folder that does not follow the layout yet, the check fails: that is expected. [Adopt docs-kit](docs/guides/howto/HOWTO-adopt-docs-kit.md) has every step, and [Reorganise a docs folder](docs/guides/howto/HOWTO-reorganise-a-docs-folder.md) makes the check pass.

In Claude Code, install the plugin once, then run `/docs-kit-init` in any repo:

```text
/plugin marketplace add techsilon-oss/docs-kit
/plugin install docs-kit@docs-kit-marketplace
```

## What it does on your machine

| | |
|---|---|
| **Reads** | The files git tracks, and `docs-kit.json` at the repo root |
| **Writes** | `init`: `docs-kit.json`, `docs/README.md` if missing, two keys in `package.json`, and the test file you name. It never overwrites a file. `move`: moves files with `git mv`, and rewrites the links and paths that name them. `index`: one marked section of `docs/README.md`. `print`: `.docx` and `.pdf` copies beside the source. `snapshot archive`: moves older snapshots to the archive folder. `audit` and `check` write nothing |
| **Runs** | `git`. `print` runs `pandoc` when it is installed |
| **Network** | docs-kit makes no network calls. `npx`, `npm install` and the plugin install download docs-kit from GitHub |
| **Never** | Commits, pushes, sends data anywhere, or edits a file under `immutablePrefixes`. The Claude Code skills commit only after you say yes, and never push |
| **Depends on** | Node 22 or later, and git. No runtime dependencies: Node built-ins only |

**Pin a release.** `init` pins the devDependency to the tag it ran from (`github:techsilon-oss/docs-kit#v0.4.0`). Release tags never move. For a stricter pin, use the commit: `github:techsilon-oss/docs-kit#<commit>`. To vendor it instead, copy `scripts/docs-kit.mjs` and `scripts/lib/` into your repo and keep the banner and `VERSION` in `docs-kit.mjs`.

## Uninstall

[Remove docs-kit](docs/guides/howto/HOWTO-remove-docs-kit.md) has the steps. In short: delete `docs-kit.json` and the test file, remove `docs-kit` and the `docs:check` script from `package.json`, and run `npm install`. Your docs stay as they are. To remove the plugin: `claude plugin uninstall docs-kit@docs-kit-marketplace`.

## What is in it

| Part | What it does | Where |
|---|---|---|
| `docs-kit init` | Sets up a repo in one step: a `docs-kit.json` that describes the docs as they are, the front door, a pinned devDependency, the check as a test | [Commands](docs/reference/COMMANDS.md#docs-kit-init) |
| `docs-kit check` | The layout check. Exit 0 when the layout holds, 1 with a list when it does not | [Commands](docs/reference/COMMANDS.md#docs-kit-check) |
| `docs-kit move` | Moves docs and keeps every link and path working | [Commands](docs/reference/COMMANDS.md#docs-kit-move) |
| `docs-kit audit` | Read-only inventory before a reorganisation: what must move, generators, ignored files, every reference to a doc | [Commands](docs/reference/COMMANDS.md#docs-kit-audit) |
| `docs-kit snapshot` | Where a generator writes today's snapshot, and archiving the older ones | [Route generated docs](docs/guides/howto/HOWTO-route-generated-docs.md) |
| `docs-kit index` | Writes the "How-tos by role" section of the front door | [Commands](docs/reference/COMMANDS.md#docs-kit-index) |
| `docs-kit print` | Makes `.docx` and `.pdf` print copies with pandoc | [Commands](docs/reference/COMMANDS.md#docs-kit-print) |
| `/docs-kit-init` | Claude Code: applies the setup defaults, explains what the check found, commits on your yes, and leads the reorganisation | [Adopt docs-kit](docs/guides/howto/HOWTO-adopt-docs-kit.md) |
| `/docs-kit-reorg` | Claude Code: audits the docs, writes one proposal, asks only for the roles and one approval, then moves the docs in slices | [Reorganise a docs folder](docs/guides/howto/HOWTO-reorganise-a-docs-folder.md) |
| `/docs-kit-pin` | Claude Code: saves a discussion as a dated note, or steps as a how-to | [DESIGN §6.4](docs/DESIGN.md#64-pins-and-how-tos--docs-kit-pin-skill) |
| `/docs-kit-help` | Claude Code: answers a question from the docs of the version you have | [FAQ](docs/FAQ.md) |

## Docs

- [Front door](docs/README.md): every doc, by subject.
- [How-tos](docs/guides/README.md): adopt, reorganise, route generated docs, print, upgrade, remove.
- [Commands](docs/reference/COMMANDS.md): every command, option, finding and exit code.
- [FAQ](docs/FAQ.md) and [Upgrading](docs/UPGRADING.md).
- [Design](docs/DESIGN.md): the layout rule, and why each part works the way it does.

## Develop

Run the tests with `npm test`. Work on a branch, open a pull request into `dev`, and sign off every commit (`git commit -s`). See [CONTRIBUTING](https://github.com/techsilon-oss/.github/blob/main/CONTRIBUTING.md), [CLAUDE.md](CLAUDE.md) and the [CHANGELOG](CHANGELOG.md).

docs-kit stands alone. [govkit](https://github.com/techsilon-oss/govkit) can use it through an optional module; docs-kit never depends on govkit. It follows the [techsilon-oss kit standard](https://github.com/techsilon-oss/.github/blob/main/KIT-STANDARD.md).

## License

Apache License 2.0 from version 0.3.1. Earlier releases were published under MIT and stay MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

---

Published by Techsilon LLC. Maintained by [@jisujit](https://github.com/jisujit). "docs-kit" and "Techsilon" are trademarks of Techsilon LLC: see [TRADEMARKS](https://github.com/techsilon-oss/.github/blob/main/TRADEMARKS.md).
