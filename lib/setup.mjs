// Project setup — what `uui init` writes and `uui doctor` checks. Every step is safe to re-run:
// existing files are kept, and only the marked ultimate-ui block in AGENTS.md / CLAUDE.md is replaced.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, lstatSync, realpathSync, readlinkSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_NAME, DEFAULTS, findConfig, loadConfig, projectImport } from './config.mjs';
import { contractIds, referenceIds, loadReference, validateReference } from './contract.mjs';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
const REPO = 'harrysong961205/ultimate-ui';
const START = '<!-- ultimate-ui:start -->', END = '<!-- ultimate-ui:end -->';
export const PLUGIN = 'ultimate-ui@ultimate-ui';

// Where the agent can read the skill: the installed copy when it is inside the project, otherwise GitHub
function skillPath(root, file = 'SKILL.md') {
  const local = join(pkgRoot, 'skills', 'ultimate-ui', file === 'SKILL.md' ? file : join('references', file));
  return local.startsWith(root + sep) ? relative(root, local) : `https://github.com/${REPO}/blob/v${pkg.version}/skills/ultimate-ui/${file === 'SKILL.md' ? file : `references/${file}`}`;
}

export function agentBlock(root, cfg) {
  return [START,
    '## UI work — ultimate-ui',
    '',
    `For any UI change, follow ${skillPath(root)} (in Claude Code the ultimate-ui plugin loads it as a skill).`,
    `- New screen or information-structure change: write a screen contract in \`${cfg.contracts}/\`. Before designing it, look for references as in ${skillPath(root, 'finding-references.md')} and record them in \`${cfg.references}/\`.`,
    `- Values come from the tokens in ${cfg.tokens.map((t) => `\`${t}\``).join(', ')}. \`npx uui literals\` must pass; never run \`--allow-growth\` yourself.`,
    '- A screen is done only after `npx uui review <run dir>` passes on real screenshots. Report what was not verified.',
    END].join('\n');
}

// Plan the new text of an instruction file without writing it. Ambiguous markers are a problem, not a guess.
function planBlock(text, block) {
  const starts = text.split(START).length - 1, ends = text.split(END).length - 1;
  const a = text.indexOf(START), b = text.indexOf(END);
  if (starts > 1 || ends > 1 || starts !== ends || (starts && b < a)) return { problem: 'its ultimate-ui markers are duplicated or out of order — fix them by hand' };
  const next = starts ? text.slice(0, a) + block + text.slice(b + END.length) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}\n`;
  return { next, verb: next === text ? 'unchanged' : !text ? 'created' : starts ? 'updated' : 'added' };
}

// A path we write must stay inside the project: no link (even a dangling one) on the way that leads out,
// and no file where a folder has to be
function pathProblem(root, path) {
  const realRoot = realpathSync(root);
  const parts = relative(root, path).split(sep);
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    cur = join(cur, parts[i]);
    let st; try { st = lstatSync(cur); } catch { return null; } // the rest does not exist yet
    if (st.isSymbolicLink()) {
      const target = resolve(dirname(cur), readlinkSync(cur));
      let real = target; try { real = realpathSync(target); } catch { /* dangling */ }
      if (real !== realRoot && !real.startsWith(realRoot + sep)) return `${relative(root, cur)} is a link out of the project — not touching it`;
      try { st = statSync(cur); } catch { return `${relative(root, cur)} is a dangling link — not touching it`; }
    }
    if (i < parts.length - 1 && !st.isDirectory()) return `${relative(root, cur)} is a file where a folder is needed`;
    if (i === parts.length - 1 && st.isDirectory()) return `${relative(root, cur)} is a folder where a file is needed`;
  }
  return null;
}

/**
 * Set up a project. Everything is read and checked first; if anything is unclear nothing is written.
 * Returns { lines, ok }.
 */
export function setup(cwd, { agents = true, claude = true, here = false } = {}) {
  const out = [], problems = [], writes = [];
  const found = here ? (existsSync(join(resolve(cwd), CONFIG_NAME)) ? join(resolve(cwd), CONFIG_NAME) : null) : findConfig(cwd);
  const root = found ? dirname(found) : resolve(cwd);
  const raw = found ? null : { src: DEFAULTS.src, tokens: DEFAULTS.tokens, baseline: DEFAULTS.baseline, contracts: DEFAULTS.contracts, references: DEFAULTS.references };
  if (!found) { const bad = pathProblem(root, join(root, CONFIG_NAME)); if (bad) problems.push(bad); }
  if (found) out.push(`kept    ${relative(cwd, found) || CONFIG_NAME}${root !== resolve(cwd) ? `  (project root ${root}; use --here to set up ${resolve(cwd)} on its own)` : ''}`);
  else writes.push(() => { writeFileSync(join(root, CONFIG_NAME), JSON.stringify(raw, null, 2) + '\n'); out.push(`created ${CONFIG_NAME} — edit src and tokens to match this project`); });
  let cfg;
  try { cfg = found ? loadConfig(root) : { ...DEFAULTS, ...raw, root, tokens: raw.tokens, contractDir: resolve(root, raw.contracts), referenceDir: resolve(root, raw.references) }; }
  catch (e) { return { lines: [`${CONFIG_NAME} is not valid JSON: ${e.message} — nothing was changed.`], ok: false }; }
  for (const [dir, tpl] of [[cfg.contractDir, 'screen-contract.json'], [cfg.referenceDir, 'ui-reference.json']]) {
    const target = join(dir, 'example.json.template'), bad = pathProblem(root, target);
    if (bad) { problems.push(bad); continue; }
    if (!existsSync(target)) writes.push(() => { mkdirSync(dir, { recursive: true }); copyFileSync(join(pkgRoot, 'templates', tpl), target); out.push(`created ${relative(root, target)}`); });
  }
  if (agents) {
    // AGENTS.md (Codex and most agents) always carries the block. CLAUDE.md either imports AGENTS.md or carries the block too.
    const block = agentBlock(root, cfg);
    for (const f of ['AGENTS.md', 'CLAUDE.md']) {
      const path = join(root, f), bad = pathProblem(root, path);
      if (bad) { problems.push(bad); continue; }
      const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
      if (f === 'CLAUDE.md' && (!text || /^@AGENTS\.md\s*$/m.test(text)) && !text.includes(START)) {
        if (!text) writes.push(() => { writeFileSync(path, '@AGENTS.md\n'); out.push('created CLAUDE.md (imports AGENTS.md)'); });
        else out.push('kept    CLAUDE.md (imports AGENTS.md)');
        continue;
      }
      const plan = planBlock(text, block);
      if (plan.problem) { problems.push(`${f}: ${plan.problem}`); continue; }
      if (plan.verb === 'unchanged') out.push(`unchanged ${f} (ultimate-ui block)`);
      else writes.push(() => { writeFileSync(path, plan.next); out.push(`${plan.verb.padEnd(7)} ${f} (ultimate-ui block)`); });
    }
  }
  if (claude) {
    // Project-scope plugin: anyone opening this project in Claude Code is offered the plugin
    const path = join(root, '.claude', 'settings.json'), bad = pathProblem(root, path);
    let st = {};
    if (bad) problems.push(bad);
    else if (existsSync(path)) { try { st = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { problems.push(`.claude/settings.json is not valid JSON (${e.message}) — fix it, or run with --no-claude`); st = null; } }
    if (st) {
      const want = { source: { source: 'github', repo: REPO } }, have = st.extraKnownMarketplaces?.['ultimate-ui'];
      if (have && JSON.stringify(have) !== JSON.stringify(want)) out.push('kept    .claude/settings.json marketplace "ultimate-ui" (it points somewhere else — left as it is)');
      const next = { ...st, extraKnownMarketplaces: { ...(st.extraKnownMarketplaces ?? {}), 'ultimate-ui': have ?? want }, enabledPlugins: { ...(st.enabledPlugins ?? {}), [PLUGIN]: st.enabledPlugins?.[PLUGIN] ?? true } };
      if (st.enabledPlugins?.[PLUGIN] === false) out.push(`kept    ${PLUGIN} disabled in .claude/settings.json (someone turned it off)`);
      if (JSON.stringify(next) === JSON.stringify(st)) out.push('kept    .claude/settings.json');
      else writes.push(() => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(next, null, 2) + '\n'); out.push(`updated .claude/settings.json (${next.enabledPlugins[PLUGIN] ? `enables ${PLUGIN} for this project` : 'adds the marketplace'})`); });
    }
  }
  if (problems.length) return { lines: ['Nothing was changed:', ...problems.map((x) => `  ${x}`)], ok: false };
  for (const w of writes) w();
  out.push('', 'Next:', '  1. Point src and tokens in the config at this project.', '  2. npx uui literals --update-baseline --allow-growth   (once, a human decision: freezes today\'s debt)', '  3. Put "uui literals" in front of your build script.', '  4. npx uui doctor');
  return { lines: out, ok: true };
}

/** What is set up and what is missing. */
export function doctor(cwd) {
  const lines = [`ultimate-ui ${pkg.version}`];
  let ok = true;
  const mark = (good, text, fix) => { lines.push(`${good ? 'ok  ' : 'MISS'} ${text}${!good && fix ? ` — ${fix}` : ''}`); if (!good) ok = false; };
  const note = (text) => lines.push(`--   ${text}`);
  const path = findConfig(cwd);
  mark(!!path, `config ${path ? relative(cwd, path) || CONFIG_NAME : CONFIG_NAME}`, 'run: npx uui init');
  if (!path) return { lines, ok };
  const cfg = loadConfig(cwd), root = cfg.root;
  mark(existsSync(cfg.srcDir), `src ${cfg.src}`, 'fix "src" in the config');
  for (const t of cfg.tokens) mark(existsSync(resolve(root, t)), `tokens ${t}`, 'fix "tokens" in the config');
  for (const dep of ['postcss', 'typescript']) { let has = true; try { projectImport(root, dep); } catch { has = false; } mark(has, `dependency ${dep}`, `npm i -D ${dep}`); }
  mark(existsSync(cfg.baselinePath), `debt list ${cfg.baseline}`, 'a human runs once: npx uui literals --update-baseline --allow-growth');
  const scripts = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {} : {};
  // a step of build/prebuild, not just the words somewhere (scripts that call other scripts are not followed)
  // Only a plain "a && uui literals && b" chain counts: no quotes, ||, ;, pipes or background jobs, and no --files narrowing
  // Quoted arguments are fine; outside quotes only && may join commands (; || | & would let the build run past a failed check)
  const step = (v) => { const t = String(v ?? '').replace(/"[^"]*"|'[^']*'/g, '""'); if (/[;|`]|&/.test(t.replace(/&&/g, ''))) return false; return t.split('&&').some((c) => /^\s*(npx\s+)?uui\s+literals\s*$/.test(c)); };
  const gate = ['prebuild', 'build'].find((k) => step(scripts[k]));
  const elsewhere = Object.keys(scripts).filter((k) => step(scripts[k]) && k !== gate);
  mark(!!gate, gate ? `build gate: "uui literals" is a step of the ${gate} script (not executed here)` : 'build gate', `make "uui literals" a step of the build or prebuild script${elsewhere.length ? ` (found only in: ${elsewhere.join(', ')})` : ''}`);
  const blocks = ['AGENTS.md', 'CLAUDE.md'].filter((f) => existsSync(join(root, f)) && readFileSync(join(root, f), 'utf8').includes(START));
  mark(blocks.length > 0, `agent instructions ${blocks.join(', ') || ''}`.trim(), 'run: npx uui init');
  const settings = join(root, '.claude', 'settings.json');
  const enabled = existsSync(settings) && JSON.parse(readFileSync(settings, 'utf8')).enabledPlugins?.[PLUGIN] === true;
  if (enabled) note('Claude Code plugin enabled for this project (.claude/settings.json)');
  else note('Claude Code plugin not enabled for this project — fine if you installed it for your user; otherwise run: npx uui init');
  note(`${contractIds(cfg).length} screen contract(s) in ${cfg.contracts}/, ${referenceIds(cfg).length} reference(s) in ${cfg.references}/`);
  const badRefs = referenceIds(cfg).filter((id) => { try { return validateReference(id, loadReference(cfg, id), cfg).length > 0; } catch { return true; } });
  mark(!badRefs.length, 'reference records valid', `run: npx uui refs (${badRefs.join(', ')})`);
  return { lines, ok };
}
