#!/usr/bin/env node
// ultimate-ui command line.
//   uui init                         set up the project (safe to re-run): config, folders, agent instructions, Claude Code plugin
//        … --no-agents --no-claude   skip AGENTS.md/CLAUDE.md, skip .claude/settings.json
//        … --here                    set up this folder on its own even if a parent folder has a config
//   uui doctor                       show what is set up and what is missing
//   uui literals [--files a b]       static design-token check (exit 1 on a new bypass) — put it in front of your build
//   uui literals --update-baseline   shrink the debt list to what remains (never grows)
//        … --allow-growth            write new violations into the list — a human decision, not the agent's
//   uui contract [id ...]            validate screen contracts against their approved floor
//   uui refs [id ...]                validate the reference records (docs/ui-references/*.json)
//   uui review <dir> [--accept]      check a review run (evidence.json + review.json); --accept records the floor and source digest
//   uui hook                         Claude Code PostToolUse hook (reads the hook JSON on stdin)
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, CONFIG_NAME } from '../lib/config.mjs';
import { checkLiterals } from '../lib/literals.mjs';
import { contractIds, loadContract, loadLedger, saveLedger, validateContract, floorOf, reviewProblems, referenceIds, loadReference, validateReference, referenceLinkProblems } from '../lib/contract.mjs';
import { setup, doctor } from '../lib/setup.mjs';

const [cmd, ...args] = process.argv.slice(2);
const need = () => { const c = loadConfig(); if (!c) { console.error(`No ${CONFIG_NAME} found. Run: npx uui init`); process.exit(2); } return c; };
const flag = (n) => args.includes(n);
const after = (n) => { if (!args.includes(n)) return null; const rest = args.slice(args.indexOf(n) + 1); const stop = rest.findIndex((a) => a.startsWith('--')); return stop < 0 ? rest : rest.slice(0, stop); };

if (cmd === 'init') {
  const r = setup(process.cwd(), { agents: !flag('--no-agents'), claude: !flag('--no-claude'), here: flag('--here') });
  console.log(r.lines.join('\n'));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === 'doctor') {
  const { lines, ok } = doctor(process.cwd());
  console.log(lines.join('\n'));
  process.exit(ok ? 0 : 1);
}

if (cmd === 'refs') {
  const cfg = need();
  const ids = args.filter((a) => !a.startsWith('--'));
  let bad = 0;
  const all = ids.length ? ids : referenceIds(cfg);
  if (!all.length) console.log(`no references yet in ${cfg.references}/ — see skills/ultimate-ui/references/finding-references.md`);
  for (const id of all) {
    let problems;
    try {
      const ref = loadReference(cfg, id);
      problems = ref ? validateReference(id, ref, cfg) : [`no file ${cfg.references}/${id}.json`];
      // the same link check as `uui contract`, against every contract that cites this reference
      if (ref) for (const cid of contractIds(cfg)) { try { const { contract } = loadContract(cfg, cid); if ((contract.references ?? []).includes(id)) problems.push(...referenceLinkProblems(ref, contract)); } catch { /* uui contract reports it */ } }
    }
    catch (e) { problems = [`not valid JSON: ${e.message}`]; }
    console.log(problems.length ? `${id}: ${problems.length} problem(s)\n  ${problems.join('\n  ')}` : `${id}: ok`);
    bad += problems.length;
  }
  process.exit(bad ? 1 : 0);
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
  let raw = '', input = {};
  try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  if (!['Edit', 'Write', 'MultiEdit'].includes(input.tool_name)) process.exit(0);
  const file = resolve(input.cwd ?? process.cwd(), input.tool_input?.file_path ?? '');
  const cfg = loadConfig(dirname(file));
  if (!cfg || !file.startsWith(cfg.srcDir + '/') || !cfg.extensions.some((e) => file.endsWith(e)) || cfg.tokenFiles.includes(file)) process.exit(0); // project has not opted in
  // The project pins its own ultimate-ui version: that copy judges, so the edit hook and the build gate agree.
  // Resolved the way Node does from the project (so a monorepo's hoisted copy counts). A failing copy is reported, never skipped.
  let pinned = null;
  try { pinned = realpathSync(createRequire(resolve(cfg.root, 'package.json')).resolve('ultimate-ui/bin/uui.mjs')); } catch { /* not installed in the project */ }
  if (pinned && !flag('--delegated') && pinned !== realpathSync(fileURLToPath(import.meta.url))) {
    const r = spawnSync(process.execPath, [pinned, 'hook', '--delegated'], { input: raw, encoding: 'utf8', timeout: 30000 });
    if (r.status === 0 && !r.error) { process.stdout.write(r.stdout ?? ''); process.exit(0); }
    const why = r.error?.code === 'ETIMEDOUT' ? 'timed out after 30s' : `exited with ${r.status ?? r.signal}`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `The project's pinned ultimate-ui (${pinned}) could not check this edit: ${why}.\n${(r.stderr || '').trim().slice(0, 2000)}` }));
    process.exit(0);
  }
  let r;
  try { r = checkLiterals(cfg, { files: [file] }); } catch (e) { r = { code: 2, err: String(e?.message ?? e) }; }
  if (r.code !== 0) {
    const why = r.code === 1 ? 'Design-token check failed — fix it before moving on.' : 'Could not run the design-token check.';
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${why}\n${(r.err || r.out || '').trim()}` }));
  }
  process.exit(0);
}

console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
process.exit(cmd ? 2 : 0);
