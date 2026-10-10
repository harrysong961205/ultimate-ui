// Self-test: the checkers must reject the failures they exist for. Run: npm test
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { checkLiterals } from '../lib/literals.mjs';
import { judge } from '../lib/policy.mjs';
import { validateContract, floorOf, reviewProblems, pngSize, sha, loadContract, sourcesDigest, CRITERIA, validateReference } from '../lib/contract.mjs';
import { setup, doctor } from '../lib/setup.mjs';
import { findConfig } from '../lib/config.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok ', name); };
const work = mkdtempSync(join(tmpdir(), 'uui-'));
cpSync(resolve(here, 'fixture'), work, { recursive: true });
const cfg = loadConfig(work);
const write = (p, s) => { mkdirSync(resolve(work, p, '..'), { recursive: true }); writeFileSync(resolve(work, p), s); };

// ── policy ──
const names = ['--s2', '--fg'];
t('token value passes', () => assert.equal(judge('padding', 'var(--s2)', names), null));
t('literal spacing fails', () => assert.match(judge('padding', '13px', names), /literal/));
t('color literal fails', () => assert.match(judge('color', '#ff0000', names), /color literal/));
t('named color fails', () => assert.match(judge('background', 'red', names), /color literal/));
t('undefined token fails', () => assert.match(judge('color', 'var(--nope)', names), /undefined token/));
t('literal fallback fails', () => assert.match(judge('color', 'var(--fg, #000)', names), /fallback/));
t('calc literal fails', () => assert.match(judge('margin', 'calc(777px * 1)', names), /calc/));
t('token multiple passes', () => assert.equal(judge('margin', 'calc(var(--s2) * 2)', names), null));
t('allowed zero/auto pass', () => assert.equal(judge('margin', '0 auto', names), null));
t('border width with token color passes', () => assert.equal(judge('border', '1px solid var(--fg)', names), null));

// ── static check ──
t('clean fixture passes', () => assert.equal(checkLiterals(cfg).code, 0));
write('src/pages/bad.css', '.x { padding: 13px; color: #f00; }');
t('new CSS literal fails', () => { const r = checkLiterals(cfg); assert.equal(r.code, 1); assert.match(r.err, /bad\.css:1/); });
t('--files narrows to one file', () => assert.equal(checkLiterals(cfg, { files: [resolve(work, 'src/pages/ok.css')] }).code, 0));
t('update without growth refuses new debt', () => assert.equal(checkLiterals(cfg, { update: true }).code, 1));
t('growth freezes debt (human decision)', () => assert.equal(checkLiterals(cfg, { update: true, allowGrowth: true }).code, 0));
t('frozen debt passes', () => assert.equal(checkLiterals(cfg).code, 0));
write('src/pages/bad.css', '.x { padding: 13px; color: #f00; } .y { padding: 13px; }');
t('copying a frozen violation fails', () => assert.equal(checkLiterals(cfg).code, 1));
write('src/pages/bad.css', '.x { padding: 14px; color: #f00; }');
t('changing a frozen value fails', () => assert.equal(checkLiterals(cfg).code, 1));
rmSync(resolve(work, 'src/pages/bad.css'));
t('fixing debt passes and shrinks', () => { assert.equal(checkLiterals(cfg).code, 0); assert.equal(checkLiterals(cfg, { update: true }).code, 0); assert.equal(JSON.parse(readFileSync(cfg.baselinePath, 'utf8')).total, 0); });
write('src/pages/Inline.tsx', 'const pad = 12; export const A = () => <div style={{ padding: pad, color: cond ? "#fff" : "var(--fg)" }} />;');
t('TSX inline literal through a variable fails', () => { const r = checkLiterals(cfg); assert.equal(r.code, 1); assert.match(r.err, /padding: 12px/); assert.match(r.err, /color: #fff/); });
rmSync(resolve(work, 'src/pages/Inline.tsx'));
t('src with no screen files fails', () => assert.equal(checkLiterals({ ...cfg, srcDir: resolve(work, 'docs') }).code, 2));
t('--files with only a token file fails', () => assert.equal(checkLiterals(cfg, { files: cfg.tokenFiles }).code, 2));
t('missing src directory fails', () => assert.equal(checkLiterals({ ...cfg, srcDir: resolve(work, 'srcc') }).code, 2));
t('missing token file fails', () => assert.equal(checkLiterals({ ...cfg, tokenFiles: [resolve(work, 'nope.css')] }).code, 2));
t('--files with no file fails', () => assert.equal(checkLiterals(cfg, { files: [] }).code, 2));
t('tokens given as a string is accepted', () => { const raw = JSON.parse(readFileSync(cfg.path, 'utf8')); write('strtok/ultimate-ui.config.json', JSON.stringify({ ...raw, src: '../src', tokens: '../' + (Array.isArray(raw.tokens) ? raw.tokens[0] : raw.tokens), baseline: '../' + (raw.baseline ?? 'design-baseline.json') })); const c2 = loadConfig(resolve(work, 'strtok')); assert.equal(c2.tokenFiles.length, 1); assert.equal(checkLiterals(c2).code, 0); });

// ── hook ──
const hook = (file) => spawnSync(process.execPath, [resolve(here, '../bin/uui.mjs'), 'hook'], { input: JSON.stringify({ tool_name: 'Edit', cwd: work, tool_input: { file_path: file } }), encoding: 'utf8' });
write('src/pages/bad.css', '.x { gap: 7px; }');
t('hook blocks a bypass after an edit', () => assert.match(hook(resolve(work, 'src/pages/bad.css')).stdout, /"decision":"block"/));
t('hook is silent on clean files', () => assert.equal(hook(resolve(work, 'src/pages/ok.css')).stdout, ''));
const pinnedPkg = (body) => { write('node_modules/ultimate-ui/package.json', JSON.stringify({ name: 'ultimate-ui', exports: { './bin/uui.mjs': './bin/uui.mjs' } })); write('node_modules/ultimate-ui/bin/uui.mjs', body); };
write('src/pages/bad.css', '.x { gap: 7px; }');
t('hook defers to the project\'s pinned copy', () => { pinnedPkg('process.stdout.write("pinned-copy")'); assert.equal(hook(resolve(work, 'src/pages/bad.css')).stdout, 'pinned-copy'); });
t('a failing pinned copy is reported, not skipped', () => { pinnedPkg('process.exit(3)'); const out = hook(resolve(work, 'src/pages/bad.css')).stdout; assert.match(out, /"decision":"block"/); assert.match(out, /pinned ultimate-ui/); });
rmSync(resolve(work, 'node_modules'), { recursive: true });
t('hook is silent outside an opted-in project', () => assert.equal(hook(join(tmpdir(), 'elsewhere.css')).stdout, ''));
rmSync(resolve(work, 'src/pages/bad.css'));

// ── contract ──
const contract = JSON.parse(readFileSync(resolve(here, '../templates/screen-contract.json'), 'utf8'));
write('docs/screen-contracts/orders.json', JSON.stringify(contract, null, 2));
t('template contract is valid', () => assert.deepEqual(validateContract(cfg, contract), []));
t('info without a question fails', () => assert.ok(validateContract(cfg, { ...contract, information: [...contract.information, { id: 'x', label: 'x', source: 's', answers: [], disclosure: 'initial' }] }).some((p) => /answers/.test(p))));
t('rule without why fails', () => assert.ok(validateContract(cfg, { ...contract, rules: [{ ...contract.rules[0], why: '' }] }).some((p) => /why/.test(p))));
const floor = floorOf(contract);
t('dropping an approved rule fails', () => assert.ok(validateContract(cfg, { ...contract, rules: contract.rules.slice(1) }, floor).some((p) => /R1 disappeared/.test(p))));
t('dropping it with the human\'s words passes', () => assert.deepEqual(validateContract(cfg, { ...contract, rules: contract.rules.slice(1).map((r) => ({ ...r })), changeLog: [{ at: 'x', items: ['R1'], reason: 'merged', userText: '"merge it"' }] }, floor).filter((p) => /R1/.test(p)), []));
t('changing an approved rule\'s meaning fails', () => assert.ok(validateContract(cfg, { ...contract, rules: [{ ...contract.rules[0], text: 'All orders first' }, ...contract.rules.slice(1)] }, floor).some((p) => /R1 changed its meaning/.test(p))));
t('changing the information a rule is about fails', () => assert.ok(validateContract(cfg, { ...contract, information: contract.information.map((i) => i.id === 'waiting' ? { ...i, source: 'GET /api/orders' } : i) }, floor).some((p) => /R1 changed its meaning/.test(p))));
t('an old changeLog entry does not license a new change', () => { const logged = { ...contract, changeLog: [{ at: 'x', items: ['R1'], reason: 'r', userText: 'u' }] }; const f = floorOf(logged); assert.ok(validateContract(cfg, { ...logged, rules: [{ ...contract.rules[0], text: 'All orders first' }, ...contract.rules.slice(1)] }, f).some((p) => /R1 changed its meaning/.test(p))); });
t('a new changeLog entry allows the change', () => { const f = floorOf(contract); assert.deepEqual(validateContract(cfg, { ...contract, rules: [{ ...contract.rules[0], text: 'All orders first' }, ...contract.rules.slice(1)], changeLog: [{ at: 'x', items: ['R1'], reason: 'r', userText: 'u' }] }, f), []); });
t('a floor without meaning hashes asks for a new accept', () => { const { ruleMeaning, ...old } = floor; assert.ok(validateContract(cfg, contract, old).some((p) => /predates/.test(p))); });
t('changing question rank fails', () => assert.ok(validateContract(cfg, { ...contract, questions: contract.questions.map((q) => ({ ...q, rank: q.id === 'Q1' ? 9 : q.rank })) }, floor).some((p) => /questions changed/.test(p))));
t('changing disclosure of a rule\'s information fails', () => assert.ok(validateContract(cfg, { ...contract, information: contract.information.map((i) => i.id === 'waiting' ? { ...i, disclosure: 'detail' } : i) }, floor).some((p) => /R1 changed its meaning/.test(p))));
t('new allowed gap fails', () => assert.ok(validateContract(cfg, { ...contract, knownGapRules: ['R2'] }, floor).some((p) => /known gap R2/.test(p))));

// ── review evidence ──
const png = (w, h, seed = 0) => { // minimal valid RGB PNG, pixels filled with `seed`
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((1 + w * 3) * h, seed);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
t('real PNG decodes', () => { write('p.png', png(3, 2)); assert.deepEqual(pngSize(resolve(work, 'p.png')), { w: 3, h: 2 }); });
t('PNG with a bad CRC is rejected', () => { const b = png(3, 2); b[b.length - 13] ^= 1; write('c.png', b); assert.equal(pngSize(resolve(work, 'c.png')), null); });
t('PNG with a bad row filter is rejected', () => { const crcT = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2; const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }; const b = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(14, 255))), chunk('IEND', Buffer.alloc(0))]); write('rf.png', b); assert.equal(pngSize(resolve(work, 'rf.png')), null); });
t('fake PNG is rejected', () => { const b = png(3, 2); b.writeUInt32BE(9, 16); write('f.png', b); assert.equal(pngSize(resolve(work, 'f.png')), null); });
const run = resolve(work, 'run');
const shotsFor = (list) => list.map(([state, vp, w, h, extra = ''], i) => { const path = `screenshots/${state}.png`; const b = png(w, h, i + 1); write(`run/${path}`, b); return { path, route: '/orders', state, viewport: vp, scale: 1, fullPage: false, sha256: sha(b) + extra }; });
const digest = loadContract(cfg, 'orders').digest;
const srcDigest = () => sourcesDigest(cfg, contract);
const allShots = () => shotsFor([['orders-1440', '1440x900', 1440, 900], ['orders-390', '390x900', 390, 900], ['orders-error-1440', '1440x900', 1440, 900], ['orders-empty-1440', '1440x900', 1440, 900]]);
const verdicts = { R1: { verdict: 'pass', observation: 'waiting first', evidence: ['screenshots/orders-1440.png', 'waiting orders are listed before all orders'] }, R2: { verdict: 'pass', observation: 'unknown beside approve', evidence: ['screenshots/orders-1440.png', 'screenshots/orders-390.png'] }, R3: { verdict: 'pass', observation: 'failed vs empty', evidence: ['screenshots/orders-error-1440.png', 'screenshots/orders-empty-1440.png', 'failed load is not an empty claim'] } };
const checks = [{ name: 'waiting orders are listed before all orders', passed: true }, { name: 'failed load is not an empty claim', passed: true }];
const criteria = Object.fromEntries(CRITERIA.map((k) => [k, ['keyboard', 'motion'].includes(k) ? { verdict: 'unverified', observation: 'not checked by a real interaction' } : { verdict: 'pass', observation: 'seen on desktop and mobile', evidence: ['screenshots/orders-1440.png'] }]));
const head = { reviewer: 'agent', task: 'see waiting orders first', criteria };
const setRun = (ev, rv) => { rv = { ...head, ...rv }; write('run/evidence.json', JSON.stringify(ev)); write('run/review.json', JSON.stringify(rv)); };
t('complete review passes', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { contractRules: verdicts }); assert.deepEqual(reviewProblems(cfg, run), []); });
t('missing required state fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots().slice(0, 3), checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /not captured: orders-empty-1440/.test(p))); });
t('unjudged rule fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { contractRules: { R1: verdicts.R1, R2: verdicts.R2 } }); assert.ok(reviewProblems(cfg, run).some((p) => /R3/.test(p))); });
t('failed named check fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks: [checks[0], { ...checks[1], passed: false }] }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /did not pass|check failed/.test(p))); });
t('wrong-size image fails', () => { const s = allShots(); const b = png(800, 600); write('run/' + s[1].path, b); s[1].sha256 = sha(b); setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: s, checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /size does not match/.test(p))); });
t('image changed after capture fails', () => { const s = allShots(); s[0].sha256 = 'x'; setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: s, checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /changed after capture/.test(p))); });
t('evidence from the wrong state fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { contractRules: { ...verdicts, R3: { ...verdicts.R3, evidence: ['screenshots/orders-1440.png', 'failed load is not an empty claim'] } } }); assert.ok(reviewProblems(cfg, run).some((p) => /state orders-error-1440/.test(p))); });
t('contract edited after capture fails', () => { setRun({ contract: { id: 'orders', digest: 'old', sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /changed after the evidence/.test(p))); });
t('open major finding fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { contractRules: verdicts, findings: [{ severity: 'major', problem: 'x', status: 'open' }] }); assert.ok(reviewProblems(cfg, run).some((p) => /unresolved major/.test(p))); });

t('empty evidence and review fail', () => { write('run/evidence.json', '{}'); write('run/review.json', '{}'); const p = reviewProblems(cfg, run); assert.ok(p.some((x) => /no screenshots/.test(x))); assert.ok(p.some((x) => /reviewer and task/.test(x))); assert.ok(p.some((x) => /criterion hierarchy/.test(x))); });
t('all criteria unverified fails', () => { setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { criteria: Object.fromEntries(CRITERIA.map((k) => [k, { verdict: 'unverified', observation: 'later' }])), contractRules: verdicts }); const p = reviewProblems(cfg, run); assert.ok(p.some((x) => /criterion hierarchy/.test(x))); assert.ok(!p.some((x) => /criterion keyboard/.test(x))); });
t('missing criterion fails', () => { const { hierarchy, ...rest } = criteria; setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }, { criteria: rest, contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /criterion hierarchy/.test(p))); });
t('screen source edited after capture fails', () => { const ev = { contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: allShots(), checks }; setRun(ev, { contractRules: verdicts }); write(contract.sources[0], 'export const Orders = () => null; // changed'); assert.ok(reviewProblems(cfg, run).some((p) => /sources changed/.test(p))); });
t('evidence without a source digest fails', () => { setRun({ contract: { id: 'orders', digest }, screenshots: allShots(), checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /sources changed/.test(p))); });
t('one image for two required states fails', () => { const s = allShots(); const b = readFileSync(resolve(run, s[0].path)); write('run/' + s[2].path, b); s[2].sha256 = sha(b); setRun({ contract: { id: 'orders', digest, sourcesDigest: srcDigest() }, screenshots: s, checks }, { contractRules: verdicts }); assert.ok(reviewProblems(cfg, run).some((p) => /same image/.test(p))); });

// ── references ──
const ref = JSON.parse(readFileSync(resolve(here, '../templates/ui-reference.json'), 'utf8'));
t('template reference is valid', () => assert.deepEqual(validateReference(ref.id, ref), []));
t('adopting from a search summary fails', () => assert.ok(validateReference(ref.id, { ...ref, seen: 'search-summary' }).some((p) => /opened/.test(p))));
t('adopted without patterns fails', () => assert.ok(validateReference(ref.id, { ...ref, adopt: [] }).some((p) => /adopt/.test(p))));
t('reference without rights fails', () => assert.ok(validateReference(ref.id, { ...ref, rights: '' }).some((p) => /rights/.test(p))));
t('contract citing a missing reference fails', () => assert.ok(validateContract(cfg, { ...contract, references: ['nope'] }).some((p) => /reference nope/.test(p))));
write(`docs/ui-references/${ref.id}.json`, JSON.stringify({ ...ref, status: 'candidate' }));
t('contract citing a candidate reference fails', () => assert.ok(validateContract(cfg, { ...contract, references: [ref.id] }).some((p) => /only adopted/.test(p))));
write(`docs/ui-references/${ref.id}.json`, JSON.stringify(ref));
t('bad date fails', () => assert.ok(validateReference(ref.id, { ...ref, checkedAt: '2026-99-99garbage' }).some((p) => /checkedAt/.test(p))));
t('bad url fails', () => assert.ok(validateReference(ref.id, { ...ref, url: 'https://?' }).some((p) => /url/.test(p))));
t('url with credentials fails', () => { assert.ok(validateReference(ref.id, { ...ref, url: 'https://u:pw@example.com/a' }).some((p) => /password/.test(p))); assert.ok(validateReference(ref.id, { ...ref, url: 'https://example.com/a?token=abc' }).some((p) => /credential/.test(p))); });
t('secret in other parameter names or the fragment fails', () => { for (const url of ['https://example.com/a?client_secret=x', 'https://example.com/a#access_token=x']) assert.ok(validateReference(ref.id, { ...ref, url }).some((p) => /credential/.test(p)), url); });
t('localhost, IPv6 and ordinary parameters are valid', () => { for (const url of ['http://localhost:3000/a', 'http://[::1]:8080/a', 'https://example.com/a#design', 'https://example.com/a?design=compact&author=alice', 'https://example.com/a?monkey=1']) assert.deepEqual(validateReference(ref.id, { ...ref, url }), [], url); });
t('internal reference needs a location, not a url', () => { const { url, ...rest } = ref; assert.deepEqual(validateReference(ref.id, { ...rest, kind: 'internal', location: 'Ops wiki — approval queue' }), []); });
t('contract citing an invalid adopted reference fails', () => { write(`docs/ui-references/${ref.id}.json`, JSON.stringify({ ...ref, seen: 'search-summary' })); assert.ok(validateContract(cfg, { ...contract, references: [ref.id] }).some((p) => /must have been opened/.test(p))); write(`docs/ui-references/${ref.id}.json`, JSON.stringify(ref)); });
t('reference linked to an unknown rule fails', () => { write(`docs/ui-references/${ref.id}.json`, JSON.stringify({ ...ref, adopt: [{ ...ref.adopt[0], rules: ['R9'] }] })); assert.ok(validateContract(cfg, { ...contract, references: [ref.id] }).some((p) => /unknown rule R9/.test(p))); write(`docs/ui-references/${ref.id}.json`, JSON.stringify(ref)); });
t('contract citing an adopted reference passes', () => assert.deepEqual(validateContract(cfg, { ...contract, references: [ref.id] }), []));

// ── setup ──
const proj = mkdtempSync(join(tmpdir(), 'uui-init-'));
writeFileSync(join(proj, 'CLAUDE.md'), '# Mine\nkeep me\n');
mkdirSync(join(proj, '.claude')); writeFileSync(join(proj, '.claude/settings.json'), '{ broken');
t('broken settings JSON changes nothing', () => { const res = setup(proj); assert.equal(res.ok, false); assert.ok(!existsSync(join(proj, 'ultimate-ui.config.json'))); assert.equal(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), '# Mine\nkeep me\n'); });
writeFileSync(join(proj, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['x'] } }));
t('init with only CLAUDE.md also writes AGENTS.md', () => { assert.equal(setup(proj).ok, true); assert.match(readFileSync(join(proj, 'AGENTS.md'), 'utf8'), /ultimate-ui:start/); });
t('init keeps existing instructions and adds one block', () => { const c = readFileSync(join(proj, 'CLAUDE.md'), 'utf8'); assert.match(c, /keep me/); assert.equal(c.split('ultimate-ui:start').length, 2); });
t('init merges Claude settings', () => { const st = JSON.parse(readFileSync(join(proj, '.claude/settings.json'), 'utf8')); assert.deepEqual(st.permissions, { allow: ['x'] }); assert.equal(st.enabledPlugins['ultimate-ui@ultimate-ui'], true); });
t('init twice changes nothing', () => { const before = readFileSync(join(proj, 'CLAUDE.md'), 'utf8'); const { lines } = setup(proj); assert.equal(readFileSync(join(proj, 'CLAUDE.md'), 'utf8'), before); assert.ok(lines.some((l) => /unchanged CLAUDE.md/.test(l))); });
t('duplicated markers change nothing', () => { const a = readFileSync(join(proj, 'AGENTS.md'), 'utf8'); writeFileSync(join(proj, 'AGENTS.md'), a + '\nmy note\n<!-- ultimate-ui:start -->\n'); const res = setup(proj); assert.equal(res.ok, false); assert.match(readFileSync(join(proj, 'AGENTS.md'), 'utf8'), /my note/); writeFileSync(join(proj, 'AGENTS.md'), a); });
t('a disabled plugin stays disabled', () => { const p = join(proj, '.claude/settings.json'); const st = JSON.parse(readFileSync(p, 'utf8')); st.enabledPlugins['ultimate-ui@ultimate-ui'] = false; writeFileSync(p, JSON.stringify(st)); setup(proj); assert.equal(JSON.parse(readFileSync(p, 'utf8')).enabledPlugins['ultimate-ui@ultimate-ui'], false); });
t('fresh project: second init changes nothing', () => { const f = mkdtempSync(join(tmpdir(), 'uui-fresh-')); setup(f); const snap = () => ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', 'ultimate-ui.config.json'].map((x) => readFileSync(join(f, x), 'utf8')).join('|'); const a = snap(); setup(f); assert.equal(snap(), a); assert.equal(readFileSync(join(f, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n'); rmSync(f, { recursive: true, force: true }); });
t('a dangling link out of the project is not followed', () => { const f = mkdtempSync(join(tmpdir(), 'uui-dl-')), outside = join(tmpdir(), `uui-dangling-${process.pid}.md`); symlinkSync(outside, join(f, 'AGENTS.md')); assert.equal(setup(f).ok, false); assert.ok(!existsSync(outside)); rmSync(f, { recursive: true, force: true }); });
t('a linked .claude folder out of the project is not touched', () => { const f = mkdtempSync(join(tmpdir(), 'uui-cl-')), outside = mkdtempSync(join(tmpdir(), 'uui-cl-out-')); symlinkSync(outside, join(f, '.claude')); assert.equal(setup(f).ok, false); assert.ok(!existsSync(join(outside, 'settings.json'))); rmSync(f, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
t('a file where a folder is needed changes nothing', () => { const f = mkdtempSync(join(tmpdir(), 'uui-nd-')); writeFileSync(join(f, 'docs'), 'x'); assert.equal(setup(f).ok, false); assert.ok(!existsSync(join(f, 'ultimate-ui.config.json'))); rmSync(f, { recursive: true, force: true }); });
t('a link out of the project is not touched', () => { const f = mkdtempSync(join(tmpdir(), 'uui-link-')), outside = join(tmpdir(), `uui-outside-${process.pid}.md`); writeFileSync(outside, 'outside\n'); symlinkSync(outside, join(f, 'AGENTS.md')); const res = setup(f); assert.equal(res.ok, false); assert.equal(readFileSync(outside, 'utf8'), 'outside\n'); rmSync(f, { recursive: true, force: true }); rmSync(outside); });
t('doctor does not take the words for a build gate', () => { writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { build: 'echo skipped', unused: 'echo "uui literals"', lint: 'uui literals' } })); const d = doctor(proj); assert.ok(d.lines.some((l) => /MISS build gate/.test(l))); for (const build of ['echo "ok && uui literals --files x"', 'uui literals || true', 'uui literals --files a.css && vite build', 'uui literals; vite build', 'uui literals && vite build; echo done', "echo 'uui literals'"]) { writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { build } })); assert.ok(doctor(proj).lines.some((l) => /MISS build gate/.test(l)), build); }
  for (const build of ['npx uui literals && vite build', 'uui literals && vite build --base "/app/"']) { writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { build } })); assert.ok(doctor(proj).lines.some((l) => /ok {3}build gate/.test(l)), build); } });
t('doctor reports what is missing', () => { const d = doctor(proj); assert.equal(d.ok, false); assert.ok(d.lines.some((l) => /MISS src/.test(l))); assert.ok(d.lines.some((l) => /ok {3}agent instructions/.test(l))); });
const nested = join(proj, 'app'); mkdirSync(join(nested, '.git'), { recursive: true });
t('config search stops at a nested repository root', () => assert.equal(findConfig(nested), null));
rmSync(proj, { recursive: true, force: true });

rmSync(work, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
