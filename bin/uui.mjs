#!/usr/bin/env node
// ultimate-ui command line.
//   uui init                         create ultimate-ui.config.json and a contract folder in the current project
//   uui literals [--files a b]       static design-token check (exit 1 on a new bypass) — put it in front of your build
//   uui literals --update-baseline   shrink the debt list to what remains (never grows)
//        … --allow-growth            write new violations into the list — a human decision, not the agent's
//   uui contract [id ...]            validate screen contracts against their approved floor
//   uui review <dir> [--accept]      check a review run (evidence.json + review.json); --accept records the floor and source digest
//   uui hook                         Claude Code PostToolUse hook (reads the hook JSON on stdin)
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, CONFIG_NAME, DEFAULTS } from '../lib/config.mjs';
import { checkLiterals } from '../lib/literals.mjs';
import { contractIds, loadContract, loadLedger, saveLedger, validateContract, floorOf, reviewProblems } from '../lib/contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [cmd, ...args] = process.argv.slice(2);
const need = () => { const c = loadConfig(); if (!c) { console.error(`No ${CONFIG_NAME} found. Run: npx uui init`); process.exit(2); } return c; };
const flag = (n) => args.includes(n);
const after = (n) => { if (!args.includes(n)) return null; const rest = args.slice(args.indexOf(n) + 1); const stop = rest.findIndex((a) => a.startsWith('--')); return stop < 0 ? rest : rest.slice(0, stop); };

if (cmd === 'init') {
  const path = resolve(CONFIG_NAME);
  if (existsSync(path)) { console.log(`${CONFIG_NAME} already exists.`); process.exit(0); }
  writeFileSync(path, JSON.stringify({ src: DEFAULTS.src, tokens: DEFAULTS.tokens, baseline: DEFAULTS.baseline, contracts: DEFAULTS.contracts }, null, 2) + '\n');
  mkdirSync(resolve(DEFAULTS.contracts), { recursive: true });
  const example = resolve(DEFAULTS.contracts, 'example.json.template');
  if (!existsSync(example)) copyFileSync(resolve(here, '../templates/screen-contract.json'), example);
  console.log(`Created ${CONFIG_NAME} and ${DEFAULTS.contracts}/. Edit the paths, then run: npx uui literals --update-baseline --allow-growth  (once, to freeze today's debt).`);
  process.exit(0);
}

if (cmd === 'literals') {
  const cfg = need();
  const r = checkLiterals(cfg, { files: after('--files'), update: flag('--update-baseline'), allowGrowth: flag('--allow-growth'), renderReport: after('--render')?.[0] });
  if (r.out) console.log(r.out); if (r.err) console.error(r.err);
  process.exit(r.code);
}

if (cmd === 'contract') {
  const cfg = need(), ledger = loadLedger(cfg);
  const ids = args.filter((a) => !a.startsWith('--'));
  let bad = 0;
  for (const id of ids.length ? ids : contractIds(cfg)) {
    const problems = validateContract(cfg, loadContract(cfg, id).contract, ledger[id]?.floor);
    console.log(problems.length ? `${id}: ${problems.length} problem(s)\n  ${problems.join('\n  ')}` : `${id}: ok`);
    bad += problems.length;
  }
  process.exit(bad ? 1 : 0);
}

if (cmd === 'review') {
  const cfg = need(), dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
  const problems = reviewProblems(cfg, dir);
  if (problems.length) { console.error(`review incomplete — ${problems.length} problem(s):\n  ${problems.join('\n  ')}`); process.exit(1); }
  console.log('review complete: evidence matches, every contract rule judged.');
  if (flag('--accept')) {
    const ev = JSON.parse(readFileSync(resolve(dir, 'evidence.json'), 'utf8'));
    if (ev.contract) {
      const { contract } = loadContract(cfg, ev.contract.id), ledger = loadLedger(cfg);
      ledger[ev.contract.id] = { floor: floorOf(contract), reviewed: { sourcesDigest: ev.contract.sourcesDigest, run: relative(cfg.root, dir), at: new Date().toISOString() } };
      saveLedger(cfg, ledger);
      console.log(`ledger updated for ${ev.contract.id}.`);
    }
  }
  process.exit(0);
}

if (cmd === 'hook') {
  // PostToolUse: after Claude edits a screen file, run the token check on that file and hand failures back to the model.
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  if (!['Edit', 'Write', 'MultiEdit'].includes(input.tool_name)) process.exit(0);
  const file = resolve(input.cwd ?? process.cwd(), input.tool_input?.file_path ?? '');
  const cfg = loadConfig(dirname(file));
  if (!cfg || !file.startsWith(cfg.srcDir + '/') || !cfg.extensions.some((e) => file.endsWith(e)) || cfg.tokenFiles.includes(file)) process.exit(0); // project has not opted in
  let r;
  try { r = checkLiterals(cfg, { files: [file] }); } catch (e) { r = { code: 2, err: String(e?.message ?? e) }; }
  if (r.code !== 0) {
    const why = r.code === 1 ? 'Design-token check failed — fix it before moving on.' : 'Could not run the design-token check.';
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${why}\n${(r.err || r.out || '').trim()}` }));
  }
  process.exit(0);
}

console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
process.exit(cmd ? 2 : 0);
