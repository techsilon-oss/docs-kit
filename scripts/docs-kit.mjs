#!/usr/bin/env node
// docs-kit — one layout for docs/, and the tools to keep it.
// https://github.com/techsilon-oss/docs-kit  (MIT)
// If this file is vendored into another repo, keep this banner and VERSION,
// and send fixes back upstream.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, ConfigError, DEFAULTS, loadConfig } from './lib/config.mjs';
import { check, formatCheck, listDocFiles, parseDate } from './lib/check.mjs';
import { InitError, formatInit, nextSteps, runInit } from './lib/init.mjs';
import { repoRootOf } from './lib/git.mjs';
import { MoveError, formatMove, move } from './lib/move.mjs';
import { writeIndex } from './lib/roles.mjs';

export const VERSION = '0.2.1';

const USAGE = `docs-kit ${VERSION}

Usage:
  docs-kit init [--dry-run] [--docs-root <dir>] [--test <file>] [--no-package]
                                                 set up this repo: docs-kit.json and more
  docs-kit check [--json] [--today YYYY-MM-DD]
  docs-kit move <old> <new> [<old> <new> ...] [--dry-run]
  docs-kit index                                 write "How-tos by role" in docs/README.md
  docs-kit print <file.md> [--version X.Y]      (arrives in 0.3)
  docs-kit --version | --help

Run from anywhere inside the repo. Configuration: ${CONFIG_FILE} at the repo root.

Exit codes: 0 ok; 1 check failed, or the move made an ignored file visible;
2 usage or configuration error, or the move was refused (nothing moved).`;

function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} needs a value`);
  args.splice(i, 2);
  return v;
}

class UsageError extends Error {}

export function main(argv, { cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  const args = [...argv];
  try {
    if (!args.length) {
      err(USAGE);
      return 2;
    }
    if (takeFlag(args, '--help') || takeFlag(args, '-h')) {
      out(USAGE);
      return 0;
    }
    if (takeFlag(args, '--version')) {
      out(VERSION);
      return 0;
    }
    const cmd = args.shift();
    const root = repoRootOf(cwd) || cwd;

    if (cmd === 'init') {
      const dryRun = takeFlag(args, '--dry-run');
      const docsRoot = takeValue(args, '--docs-root');
      const testFile = takeValue(args, '--test');
      const noPackage = takeFlag(args, '--no-package');
      if (args.length) throw new UsageError(`unexpected argument "${args[0]}"`);
      if (!repoRootOf(cwd)) throw new UsageError('init must run inside a git repository');
      const { plan, result } = runInit(root, { docsRoot, testFile, version: VERSION, noPackage, dryRun });
      out(formatInit(plan, { dryRun }));
      out('');
      out(formatCheck(result, plan.config.docsRoot));
      out(nextSteps(plan, result));
      return 0;
    }

    if (cmd === 'check') {
      const json = takeFlag(args, '--json');
      const todayArg = takeValue(args, '--today');
      if (args.length) throw new UsageError(`unexpected argument "${args[0]}"`);
      let today = new Date();
      if (todayArg) {
        const t = parseDate(todayArg);
        if (t === null) throw new UsageError(`--today: "${todayArg}" is not a YYYY-MM-DD date`);
        today = new Date(t);
      }
      const cfg = loadConfig(root);
      if (!cfg) throw new ConfigError(`${CONFIG_FILE} not found at the repo root (${root}); see examples/docs-kit.json`);
      const result = check(root, cfg, { today });
      out(json ? JSON.stringify(result, null, 2) : formatCheck(result, cfg.docsRoot));
      return result.ok ? 0 : 1;
    }

    if (cmd === 'move') {
      const dryRun = takeFlag(args, '--dry-run');
      const unknown = args.find((a) => a.startsWith('--'));
      if (unknown) throw new UsageError(`unknown option "${unknown}"`);
      if (!args.length || args.length % 2) throw new UsageError('move needs <old> <new> pairs');
      if (!repoRootOf(cwd)) throw new UsageError('move must run inside a git repository');
      const pairs = [];
      for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
      const cfg = loadConfig(root) || DEFAULTS;
      const report = move(root, pairs, { cfg, dryRun });
      out(formatMove(report));
      if (!dryRun && cfg !== DEFAULTS) {
        const result = check(root, cfg);
        out('');
        out(formatCheck(result, cfg.docsRoot));
        report.check = result;
      } else if (!dryRun) {
        out(`\n(no ${CONFIG_FILE}: layout check skipped)`);
      }
      return report.newlyVisible.length ? 1 : 0;
    }

    if (cmd === 'index') {
      if (args.length) throw new UsageError(`unexpected argument "${args[0]}"`);
      const cfg = loadConfig(root);
      if (!cfg) throw new ConfigError(`${CONFIG_FILE} not found at the repo root (${root})`);
      if (!cfg.roles.length) throw new ConfigError(`${CONFIG_FILE} has no "roles" list; how-tos by role need one (DESIGN §4.1)`);
      const files = listDocFiles(root, cfg.docsRoot).map((f) => f.slice(cfg.docsRoot.length + 1));
      let r;
      try {
        r = writeIndex(root, cfg, files);
      } catch (e) {
        err(`docs-kit index: ${e.message}`);
        return 1;
      }
      out(r.changed
        ? `${cfg.docsRoot}/README.md: "How-tos by role" ${r.created ? 'added' : 'updated'}`
        : `${cfg.docsRoot}/README.md: "How-tos by role" is up to date`);
      return 0;
    }

    if (cmd === 'print') {
      err('docs-kit print arrives in 0.3 (DESIGN §10). Nothing was printed.');
      return 2;
    }

    throw new UsageError(`unknown command "${cmd}"`);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`docs-kit: ${e.message}\n\n${USAGE}`);
      return 2;
    }
    if (e instanceof ConfigError) {
      err(`docs-kit: ${e.message}`);
      return 2;
    }
    if (e instanceof InitError) {
      err(`docs-kit init: ${e.message}${e.partial ? '' : '\nNothing was written.'}`);
      return 2;
    }
    if (e instanceof MoveError) {
      err(`docs-kit move: ${e.message}\nNothing was moved.`);
      return 2;
    }
    throw e;
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) process.exitCode = main(process.argv.slice(2));
