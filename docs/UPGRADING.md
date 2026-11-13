# Upgrading

One section per release that renames something or changes what you must do. For every change, see the [CHANGELOG](../CHANGELOG.md). For the steps, see [Upgrade docs-kit](guides/howto/HOWTO-upgrade-docs-kit.md).

## 0.3.1

- **`/pin` is now `/docs-kit-pin`.** The old name still works, and says it was renamed, until the first release on or after 2026-12-13. Change any doc or habit that says `/pin`.
- **License: Apache License 2.0 from 0.3.1.** Earlier releases were published under MIT and stay MIT. If you redistribute docs-kit, keep the `LICENSE` and `NOTICE` files with it.
- **The skills ask before they run git.** `/docs-kit-init` and `/docs-kit-pin` no longer run `git` commands without asking. Claude Code asks you the first time, as for any command.

Nothing in `docs-kit.json` or in the commands changed.
