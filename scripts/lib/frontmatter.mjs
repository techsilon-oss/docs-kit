// docs-kit — a small front-matter reader: scalars, flow lists and block lists.
// Enough for the keys docs-kit reads (title, last_checked, roles); not a YAML parser.

const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

/** Parse the `---` block at the top of a Markdown file. Returns {} when there is none. */
export function frontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return {};
  const out = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const item = /^\s+-\s*(.*?)\s*$/.exec(line) || /^-\s+(.*?)\s*$/.exec(line);
    if (item && listKey) {
      out[listKey].push(unquote(item[1]));
      continue;
    }
    listKey = null;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    // A trailing "# comment" is not part of the value (not inside quotes).
    const value = raw.startsWith('#') ? '' : /^["']/.test(raw) ? raw.replace(/^((["']).*?\2)\s+#.*$/, '$1') : raw.replace(/\s+#.*$/, '');
    if (value === '') {
      out[key] = [];
      listKey = key;
    } else if (/^\[.*\]$/.test(value)) {
      out[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      out[key] = unquote(value);
    }
  }
  return out;
}

/** First `# Heading` after the front matter, or null. */
export function firstHeading(text) {
  const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const m = /^#[ \t]+(.+?)[ \t#]*$/m.exec(body);
  return m ? m[1] : null;
}
