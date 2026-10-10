// Project configuration — `ultimate-ui.config.json` at the project root.
// Every path is relative to the directory that holds the config file.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';

export const CONFIG_NAME = 'ultimate-ui.config.json';

export const DEFAULTS = {
  // Directory with the screen code to check (CSS, TS, TSX, JS, JSX).
  src: 'src',
  // Files that define the design tokens (CSS custom properties). Literal values are allowed only here.
  tokens: ['src/tokens.css'],
  // Debt list of existing violations. New violations, moved violations and growth fail.
  baseline: 'design-baseline.json',
  // Screen contracts (one JSON per screen) and the ledger of approved floors.
  contracts: 'docs/screen-contracts',
  // Extensions to scan under `src`.
  extensions: ['.css', '.ts', '.tsx', '.js', '.jsx'],
  // Values allowed without a token, per category (see lib/policy.mjs).
  allowed: { spacing: ['0', 'auto'], radius: ['0', '50%', '999px'], 'line-height': ['1'], 'letter-spacing': ['0'] },
};

/** Find the config by walking up from `start`. Returns null when the project has not opted in. */
export function findConfig(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, CONFIG_NAME);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadConfig(start = process.cwd()) {
  const path = findConfig(start);
  if (!path) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const root = dirname(path);
  const c = { ...DEFAULTS, ...raw, allowed: { ...DEFAULTS.allowed, ...(raw.allowed ?? {}) } };
  c.tokens = Array.isArray(c.tokens) ? c.tokens : [c.tokens];
  c.extensions = Array.isArray(c.extensions) ? c.extensions : [c.extensions];
  const tokens = c.tokens.map((t) => resolve(root, t));
  return { ...c, root, path, srcDir: resolve(root, c.src), tokenFiles: tokens, baselinePath: resolve(root, c.baseline), contractDir: resolve(root, c.contracts) };
}

/** Load a dependency from the project first (postcss, typescript, playwright), then from this package. */
export function projectImport(root, name) {
  for (const base of [join(root, 'package.json'), import.meta.url]) {
    try { return createRequire(base)(name); } catch { /* try next */ }
  }
  throw new Error(`ultimate-ui needs "${name}". Install it in your project: npm i -D ${name}`);
}
