---
title: Print a doc as .docx and .pdf
last_checked: 2026-11-13
---

# How to print a doc as .docx and .pdf

**Purpose:** make a Word and a PDF copy of a doc, beside the doc, named with its version and date.

## Before you start

- pandoc is installed. On Windows, in a PowerShell window: `winget install JohnMacFarlane.Pandoc`. On macOS: `brew install pandoc`.
- For the `.pdf`, pandoc also needs a PDF engine, for example MiKTeX on Windows or MacTeX on macOS. Without one, you get the `.docx` only.

## Steps

1. In the root folder of your repo, print the doc:

   ```sh
   npx docs-kit print docs/legal/TERMS.md
   ```

2. Read the output. It lists each copy it made, and each older copy it removed.
3. If it printed a `WARNING` about a wide table, open the PDF and look at that table. If the table runs off the page, split it, and print again.
4. Commit the new copies and the removed old ones.

To set the version yourself, add `--version 2.0`. Otherwise the version goes one minor up from the newest copy, or starts at `1.0`.

## Check

Beside the doc, there is one `<NAME>_v<X.Y>_<YYYY-MM-DD>.docx` and one `.pdf`, and no older copy.

## If it fails

- **`skipped, pandoc is not installed`:** install pandoc, or set `DOCS_KIT_PANDOC` to its full path.
- **`FAILED … .pdf`:** pandoc has no PDF engine. Install one, or use the `.docx`. The older `.pdf` stays.

## Sources

- [Commands: `docs-kit print`](../../reference/COMMANDS.md#docs-kit-print)
- [pandoc: installing](https://pandoc.org/installing.html)
