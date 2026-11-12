// docs-kit — configuration loader for docs-kit.json (JSON with comments).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_FILE = 'docs-kit.json';

export const DEFAULTS = Object.freeze({
  docsRoot: 'docs',
  subjects: [],
  rootAllowed: ['README.md'],
  rootAllowedTools: {},
  docMaps: [],
  protected: {},
  immutablePrefixes: [],
  snapshotTopics: {},
  howtoStaleDays: 90,
  snapshotStaleDays: 30,
});

export class ConfigError extends Error {}

/**
 * Strip // and /* *\/ comments and trailing commas outside strings,
 * so the documented `jsonc` form of docs-kit.json parses with JSON.parse.
 */
export function stripJsonComments(text) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') { inString = true; out += c; i++; continue; }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Trailing commas: `,` followed only by whitespace before `}` or `]`.
  return removeTrailingCommas(out);
}

function removeTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

export function parseConfig(text, source = CONFIG_FILE) {
  let raw;
  try {
    raw = JSON.parse(stripJsonComments(text));
  } catch (err) {
    throw new ConfigError(`${source}: not valid JSON (${err.message})`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError(`${source}: must be a JSON object`);
  }
  const cfg = { ...DEFAULTS, ...raw };
  const problems = [];
  const isStrArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const isStrMap = (v) => v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v).every((s) => typeof s === 'string');
  if (typeof cfg.docsRoot !== 'string' || !cfg.docsRoot) problems.push('docsRoot must be a non-empty string');
  for (const k of ['subjects', 'rootAllowed', 'immutablePrefixes']) {
    if (!isStrArray(cfg[k])) problems.push(`${k} must be an array of strings`);
  }
  for (const k of ['rootAllowedTools', 'protected', 'snapshotTopics']) {
    if (!isStrMap(cfg[k])) problems.push(`${k} must be an object of strings`);
  }
  if (!Array.isArray(cfg.docMaps) ||
      !cfg.docMaps.every((m) => m && typeof m.file === 'string' && typeof m.path === 'string')) {
    problems.push('docMaps must be an array of { "file": string, "path": string }');
  }
  for (const k of ['howtoStaleDays', 'snapshotStaleDays']) {
    if (!Number.isFinite(cfg[k]) || cfg[k] < 0) problems.push(`${k} must be a non-negative number`);
  }
  if (problems.length) throw new ConfigError(`${source}: ${problems.join('; ')}`);
  cfg.docsRoot = normalizeRel(cfg.docsRoot);
  cfg.protected = Object.fromEntries(Object.entries(cfg.protected).map(([k, v]) => [normalizeRel(k), v]));
  cfg.immutablePrefixes = cfg.immutablePrefixes.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''));
  return cfg;
}

/** Load docs-kit.json from repoRoot. Returns null when the file does not exist. */
export function loadConfig(repoRoot, file = CONFIG_FILE) {
  const path = join(repoRoot, file);
  if (!existsSync(path)) return null;
  return parseConfig(readFileSync(path, 'utf8'), file);
}

export function normalizeRel(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
