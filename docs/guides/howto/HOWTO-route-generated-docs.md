---
title: Route generated docs to snapshots
last_checked: 2026-11-13
---

# How to route generated docs to snapshots

**Purpose:** make a script that writes docs (a status report, an export, a briefing) put each one in its snapshot folder with a dated name, and archive the older ones.

## Before you start

- docs-kit is set up in the repo, as a devDependency: see [Adopt docs-kit](HOWTO-adopt-docs-kit.md).
- You know the topics your script writes, for example `status` and `briefing`, and the subject each belongs to, for example `operations`.

## Steps

1. In `docs-kit.json`, add one entry per topic to `snapshotTopics`, from the topic to its subject:

   ```json
   "snapshotTopics": { "status": "operations", "briefing": "operations" }
   ```

2. If the script's code is inside the docs folder (for example `docs/exports/_scripts/`), move it out. A docs folder holds docs. Use `docs-kit move`, so every path to it follows:

   ```sh
   npx docs-kit move docs/exports/_scripts scripts/docs-gen --dry-run   # example: use your own paths
   npx docs-kit move docs/exports/_scripts scripts/docs-gen   # example: use your own paths
   ```

3. In the script, ask docs-kit where to write, instead of building the path yourself. In Python:

   ```python
   import subprocess

   def snapshot_path(topic: str, ext: str = "md") -> str:
       """Where today's snapshot of a topic goes, from docs-kit.json."""
       out = subprocess.run(
           ["node", "node_modules/docs-kit/scripts/docs-kit.mjs", "snapshot", "path", topic, "--ext", ext],
           capture_output=True, text=True, check=True,
       )
       return out.stdout.strip()
   ```

   In Node:

   ```js
   import { execFileSync } from 'node:child_process';

   const snapshotPath = (topic, ext = 'md') => execFileSync(
     process.execPath, ['node_modules/docs-kit/scripts/docs-kit.mjs', 'snapshot', 'path', topic, '--ext', ext],
     { encoding: 'utf8' },
   ).trim();
   ```

   Run it from the repo root. The script still creates the folder (`os.makedirs`, `mkdirSync`) and writes the file.

4. After the script writes a topic, archive the older snapshots of that topic. Remove the script's own archive step:

   ```sh
   npx docs-kit snapshot archive status   # example: use your own topic
   ```

5. If your snapshots are not committed, keep them gitignored in the new place. Add a rule for the topic folder and one for its archive folder, for example:

   ```text
   docs/operations/snapshots/status/
   docs/archive/operations/snapshots/status/
   ```

6. Run the script once. Then run the check:

   ```sh
   npm run docs:check
   ```

## Check

- The new file is at the path `docs-kit snapshot path <topic>` prints, and its name is `<TOPIC>_<YYYY-MM-DD>.<ext>`.
- `npm run docs:check` passes. A gitignored topic shows under **Not checked … local-only**.

## If it fails

- **`unknown snapshot topic`:** add the topic to `snapshotTopics` (step 1).
- **`not a dated snapshot`:** a file in a `snapshots/<topic>/` folder does not have a dated name. Only the script's own snapshots belong there.
- **`DANGER: … no longer ignored in the archive`:** add the archive rule from step 5, before you stage anything.
- **`refusing to archive`:** the folder is not a configured `snapshots/<topic>/` folder. Archive by topic, as in step 4.

## Sources

- [Commands: `docs-kit snapshot`](../../reference/COMMANDS.md#docs-kit-snapshot)
- [DESIGN §6.6: Snapshot routing](../../DESIGN.md#66-snapshot-routing--a-small-library)
