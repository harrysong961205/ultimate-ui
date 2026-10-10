// Screen contract — one JSON file per screen that ties planning (who, why, what decision) to presentation
// (what comes first, how) and to review (which states must be captured, which rules must be judged).
// Format: skills/ultimate-ui/references/screen-contracts.md. A contract reduces omissions and drift.
// It cannot tell whether the plan itself is right.
//
// Ledger (<contracts>/ledger.json): per contract, the approved floor (rules, the states each rule must be judged on,
// required states, allowed known gaps) and the digest of the screen sources at the last passing review.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

export const KINDS = ['order', 'distinct', 'state', 'reachable', 'visible', 'vocabulary', 'scale'];
// Screen-quality criteria every review judges (skills/ultimate-ui/references/review-loop.md)
export const CRITERIA = ['hierarchy', 'density', 'readability', 'actions', 'states', 'keyboard', 'responsive', 'motion'];
const UNPROVABLE = ['keyboard', 'motion'];
const DISCLOSURE = ['initial', 'secondary', 'detail'];
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
export const sha = (data) => createHash('sha256').update(data).digest('hex');
// Routers usually ignore case and a trailing slash
export const pathOf = (route) => String(route ?? '').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '') || '/';

export function contractPath(cfg, id) {
  if (!/^[a-z0-9-]+$/.test(id ?? '')) throw new Error(`not a contract id: ${id}`);
  return resolve(cfg.contractDir, `${id}.json`);
}
export function loadContract(cfg, id) {
  const path = contractPath(cfg, id);
  if (!existsSync(path)) throw new Error(`no screen contract: ${path}`);
  const text = readFileSync(path, 'utf8');
  return { contract: JSON.parse(text), digest: sha(text) };
}
export const contractIds = (cfg) => existsSync(cfg.contractDir) ? readdirSync(cfg.contractDir).filter((n) => n.endsWith('.json') && n !== 'ledger.json').map((n) => n.slice(0, -5)).sort() : [];
const ledgerPath = (cfg) => resolve(cfg.contractDir, 'ledger.json');
export const loadLedger = (cfg) => existsSync(ledgerPath(cfg)) ? JSON.parse(readFileSync(ledgerPath(cfg), 'utf8')) : {};
export const saveLedger = (cfg, ledger) => writeFileSync(ledgerPath(cfg), JSON.stringify(ledger, null, 2) + '\n');
/** Digest of the contract's source files. When it changes, the screen needs a contract review again. */
export function sourcesDigest(cfg, contract) {
  return sha((contract.sources ?? []).map((p) => `${p}:${existsSync(resolve(cfg.root, p)) ? sha(readFileSync(resolve(cfg.root, p))) : 'missing'}`).join('\n'));
}

/** Contract format. Everything shown must answer a question; every rule needs a reason, a target and states to judge it on. */
export function validateContract(cfg, c, floor) {
  const p = [];
  if (!nonEmpty(c?.id) || !nonEmpty(c?.route)) p.push('id and route are required.');
  if (!nonEmpty(c?.approval)) p.push('approval is required: who decided the purpose of this screen, and when (their words, or a reference to where they are recorded).');
  if (!nonEmpty(c?.audience?.who) || !c?.audience?.situation?.length) p.push('audience.who and audience.situation are required.');
  if (!c?.sources?.length) p.push('sources (the files of this screen) are required — when they change, the contract review is required again.');
  for (const s of c?.sources ?? []) if (!existsSync(resolve(cfg.root, s))) p.push(`missing source file: ${s}`);
  const qs = new Set();
  for (const q of c?.questions ?? []) {
    if (!/^Q\d+$/.test(q.id ?? '') || !nonEmpty(q.text) || !Number.isInteger(q.rank)) p.push(`bad question: ${JSON.stringify(q)}`);
    if (qs.has(q.id)) p.push(`duplicate question id: ${q.id}`);
    qs.add(q.id);
  }
  if (!qs.size) p.push('questions (what this screen answers) are required.');
  const ranks = (c?.questions ?? []).map((q) => q.rank);
  if (new Set(ranks).size !== ranks.length) p.push('question ranks overlap — decide what comes first.');
  if (!c?.success?.length) p.push('success (how we know the screen works) is required.');
  const info = new Set();
  for (const i of c?.information ?? []) {
    if (!nonEmpty(i.id) || !nonEmpty(i.label) || !nonEmpty(i.source)) p.push(`information needs id, label and source: ${i.id ?? '?'}`);
    if (info.has(i.id)) p.push(`duplicate information id: ${i.id}`);
    info.add(i.id);
    if (!i.answers?.length) p.push(`information ${i.id}: which question does it answer (answers)? Showing it has no reason yet.`);
    for (const a of i.answers ?? []) if (!qs.has(a)) p.push(`information ${i.id}: unknown question ${a}`);
    if (!DISCLOSURE.includes(i.disclosure)) p.push(`information ${i.id}: disclosure must be one of ${DISCLOSURE.join('/')}`);
  }
  const req = c?.evidence?.required ?? [];
  if (!req.length) p.push('evidence.required (states × viewports that must be captured) is required.');
  for (const e of req) if (!nonEmpty(e.state) || !/^\d+x\d+$/.test(e.viewport ?? '')) p.push(`bad required evidence: ${JSON.stringify(e)}`);
  const states = new Set(req.map((e) => e.state));
  const rules = new Set();
  for (const r of c?.rules ?? []) {
    if (!/^R\d+$/.test(r.id ?? '')) p.push(`bad rule id: ${r.id}`);
    if (rules.has(r.id)) p.push(`duplicate rule id: ${r.id}`);
    rules.add(r.id);
    if (!KINDS.includes(r.kind)) p.push(`rule ${r.id}: kind must be one of ${KINDS.join('/')}`);
    if (!nonEmpty(r.text) || !nonEmpty(r.why)) p.push(`rule ${r.id}: text and why are required — emphasis without a reason is not a rule.`);
    if (!r.about?.length) p.push(`rule ${r.id}: about (target information) is required.`);
    for (const a of r.about ?? []) if (!info.has(a)) p.push(`rule ${r.id}: unknown information ${a}`);
    if (!Array.isArray(r.failures)) p.push(`rule ${r.id}: failures (known failure examples) must be an array (empty is fine).`);
    if (!r.evidenceStates?.length) p.push(`rule ${r.id}: evidenceStates (required states this rule is judged on) are required.`);
    for (const s of r.evidenceStates ?? []) if (!states.has(s)) p.push(`rule ${r.id}: state ${s} is not in evidence.required`);
    for (const ch of r.checks ?? []) if (!nonEmpty(ch)) p.push(`rule ${r.id}: empty check name`);
  }
  if (!rules.size) p.push('rules are required.');
  for (const g of c?.knownGapRules ?? []) if (!rules.has(g)) p.push(`knownGapRules: unknown rule ${g}`);
  // references the design leans on must exist and be adopted (references/finding-references.md)
  if (c?.references !== undefined && !Array.isArray(c.references)) p.push('references must be an array of reference ids.');
  for (const id of Array.isArray(c?.references) ? c.references : []) {
    let ref = null;
    try { ref = loadReference(cfg, id); } catch (e) { p.push(`reference ${id}: not valid JSON (${e.message})`); continue; }
    if (!ref) { p.push(`reference ${id}: no file ${cfg.references}/${id}.json`); continue; }
    if (ref.status !== 'adopted') p.push(`reference ${id}: status is ${ref.status ?? 'missing'} — only adopted references can back a contract.`);
    for (const x of validateReference(id, ref, cfg)) p.push(`reference ${id}: ${x}`);
    for (const x of referenceLinkProblems(ref, c)) p.push(`reference ${id}: ${x}`);
  }
  // Floor — approved rules and states cannot shrink, and allowed gaps cannot grow, without a logged human decision
  if (floor) {
    // only changeLog entries written after the floor was approved count — an old approval is not a licence for a new change
    const logged = new Set((c?.changeLog ?? []).slice(floor.changeLogLength ?? 0).filter((x) => nonEmpty(x.userText) && nonEmpty(x.reason)).flatMap((x) => x.items ?? []));
    if (!floor.ruleMeaning) p.push('the approved floor predates rule-meaning tracking — review and accept again (uui review <dir> --accept).');
    for (const r of floor.rules ?? []) if (!rules.has(r) && !logged.has(r)) p.push(`approved rule ${r} disappeared — log it in changeLog with the human's decision (words or a reference) and a reason.`);
    for (const [rid, sts] of Object.entries(floor.ruleStates ?? {})) for (const st of sts) {
      const r = (c?.rules ?? []).find((x) => x.id === rid);
      if (r && !(r.evidenceStates ?? []).includes(st) && !logged.has(rid) && !logged.has(`${rid}:${st}`)) p.push(`rule ${rid} no longer looks at state ${st} — changeLog required.`);
    }
    for (const s of floor.required ?? []) if (!req.some((e) => `${e.state}@${e.viewport}` === s) && !logged.has(s)) p.push(`approved required state ${s} disappeared — changeLog required.`);
    for (const g of c?.knownGapRules ?? []) if (!(floor.knownGapRules ?? []).includes(g) && !logged.has(g)) p.push(`allowed known gap ${g} is new — changeLog required.`);
    if (floor.questions && floor.questions !== questionsMeaning(c) && !logged.has('questions')) p.push('approved questions changed (text or rank — the root of emphasis) — changeLog with item "questions" required.');
    for (const r of c?.rules ?? []) { const was = floor.ruleMeaning?.[r.id]; if (was && was !== ruleMeaning(r, c) && !logged.has(r.id)) p.push(`approved rule ${r.id} changed its meaning (text, why, kind, checks, or the label, source, disclosure or answers of the information it is about) — changeLog required.`); }
  }
  return p;
}
// What a rule means: changing any of these after approval is a decision, not an edit
const ruleMeaning = (r, c) => sha(JSON.stringify([r.kind, r.text, r.why, [...(r.checks ?? [])].sort(),
  [...(r.about ?? [])].sort().map((id) => { const i = (c.information ?? []).find((x) => x.id === id); return [id, i?.label, i?.source, i?.disclosure, [...(i?.answers ?? [])].sort()]; })]));
const questionsMeaning = (c) => sha(JSON.stringify((c.questions ?? []).map((q) => [q.id, q.rank, q.text]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
export const floorOf = (c) => ({ rules: (c.rules ?? []).map((r) => r.id), ruleMeaning: Object.fromEntries((c.rules ?? []).map((r) => [r.id, ruleMeaning(r, c)])), changeLogLength: (c.changeLog ?? []).length, questions: questionsMeaning(c), ruleStates: Object.fromEntries((c.rules ?? []).map((r) => [r.id, [...(r.evidenceStates ?? [])]])), required: (c.evidence?.required ?? []).map((e) => `${e.state}@${e.viewport}`), knownGapRules: [...(c.knownGapRules ?? [])] });

// ── references ────────────────────────────────────────────────────────────────
// One JSON per reference in <references>/<id>.json. The agent writes what it saw and what it takes — a pattern, never a copy.
const SEEN = ['opened', 'screenshot', 'search-summary'];
const STATUS = ['candidate', 'adopted', 'rejected'];
export const referenceIds = (cfg) => existsSync(cfg.referenceDir) ? readdirSync(cfg.referenceDir).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort() : [];
export function loadReference(cfg, id) {
  if (!/^[a-z0-9-]+$/.test(id ?? '')) return null;
  const path = resolve(cfg.referenceDir, `${id}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}
const KIND = ['web', 'project', 'internal'];
/** The questions and rules a reference says it serves must exist in a contract that cites it. */
export function referenceLinkProblems(ref, c) {
  const qs = new Set((c?.questions ?? []).map((q) => q.id)), rules = new Set((c?.rules ?? []).map((r) => r.id)), p = [];
  for (const a of ref?.adopt ?? []) {
    for (const q of a?.questions ?? []) if (!qs.has(q)) p.push(`adopts for unknown question ${q} in contract ${c.id}`);
    for (const r of a?.rules ?? []) if (!rules.has(r)) p.push(`adopts for unknown rule ${r} in contract ${c.id}`);
  }
  return p;
}
const realDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? ''); if (!m) return false; const d = new Date(`${v}T00:00:00Z`); return !isNaN(d) && d.toISOString().startsWith(v); };
// Credentials do not belong in a record that may be committed
// judged per word of the parameter name (access_token → access, token), so author or design are not secrets
const SECRET_WORDS = new Set(['token', 'secret', 'password', 'passwd', 'pwd', 'apikey', 'key', 'sig', 'signature', 'auth', 'session', 'sessionid', 'credential', 'credentials', 'code', 'jwt', 'bearer']);
const isSecretParam = (k) => /^x-amz-/i.test(k) || k.toLowerCase().split(/[^a-z0-9]+/).some((w) => SECRET_WORDS.has(w));
export function validateReference(id, r, cfg) {
  const p = [];
  if (r?.id !== id) p.push(`id must match the file name (${id}).`);
  const kind = r?.kind ?? 'web';
  if (!KIND.includes(kind)) p.push(`kind must be one of ${KIND.join('/')} (default web).`);
  if (kind === 'web') {
    let u = null; try { u = new URL(r?.url); } catch { /* below */ }
    if (!u || !['http:', 'https:'].includes(u.protocol) || !u.hostname) p.push('url (a real http or https address) is required for a web reference.');
    else {
      if (u.username || u.password) p.push('url contains a user name or password — remove it.');
      const keys = [...u.searchParams.keys(), ...new URLSearchParams(u.hash.replace(/^#/, '')).keys()];
      for (const k of keys) if (isSecretParam(k)) p.push(`url carries a credential-like parameter "${k}" — remove it.`);
    }
  }
  if (kind === 'project') {
    if (!nonEmpty(r?.path)) p.push('path (a file in this project) is required for a project reference.');
    else if (cfg && !existsSync(resolve(cfg.root, r.path))) p.push(`path not found in the project: ${r.path}`);
  }
  if (kind === 'internal' && !nonEmpty(r?.location)) p.push('location (where the internal material is, e.g. a wiki page title) is required for an internal reference.');
  if (!nonEmpty(r?.title)) p.push('title is required.');
  if (!realDate(r?.checkedAt)) p.push('checkedAt (a real date, YYYY-MM-DD, when it was looked at) is required.');
  if (!SEEN.includes(r?.seen)) p.push(`seen must be one of ${SEEN.join('/')} — say how closely it was looked at.`);
  if (!nonEmpty(r?.observed)) p.push('observed (what was actually seen, in your own words) is required.');
  if (!STATUS.includes(r?.status)) p.push(`status must be one of ${STATUS.join('/')}.`);
  if (!nonEmpty(r?.rights)) p.push('rights is required: what may be reused (usually "pattern only — no assets, copy or code").');
  if (!Array.isArray(r?.avoid)) p.push('avoid (what not to take from it) must be an array (empty is fine).');
  if (r?.status === 'adopted') {
    if (r.seen === 'search-summary') p.push('an adopted reference must have been opened, not only seen in a search summary.');
    if (!r.adopt?.length) p.push('adopt (the patterns taken, each with pattern and why) is required when adopted.');
    for (const a of r.adopt ?? []) if (!nonEmpty(a?.pattern) || !nonEmpty(a?.why)) p.push(`adopt item needs pattern and why: ${JSON.stringify(a)}`);
  }
  return p;
}

// ── evidence ──────────────────────────────────────────────────────────────────
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const CRC = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** Real PNG size: walks the chunks, checks each CRC, inflates the pixel data and checks its length. Returns null for anything else. */
export function pngSize(path) {
  try {
    const b = readFileSync(path); if (b.length < 57 || !b.subarray(0, 8).equals(PNG_SIG)) return null;
    let o = 8, ihdr = null, idat = [], end = false;
    while (o + 12 <= b.length) {
      const len = b.readUInt32BE(o), type = b.subarray(o + 4, o + 8).toString('latin1'); if (o + 12 + len > b.length) return null;
      const data = b.subarray(o + 8, o + 8 + len);
      if (crc32(b.subarray(o + 4, o + 8 + len)) !== b.readUInt32BE(o + 8 + len)) return null;
      if (!ihdr && type !== 'IHDR') return null;
      if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
      else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') { end = true; break; }
      o += 12 + len;
    }
    if (!ihdr || !end || !idat.length || ihdr.interlace !== 0 || !CHANNELS[ihdr.color]) return null;
    const raw = inflateSync(Buffer.concat(idat)), row = 1 + Math.ceil(ihdr.w * CHANNELS[ihdr.color] * ihdr.depth / 8);
    if (raw.length !== row * ihdr.h) return null;
    for (let y = 0; y < ihdr.h; y++) if (raw[y * row] > 4) return null; // every row starts with a filter type 0–4
    return { w: ihdr.w, h: ihdr.h };
  } catch { return null; }
}

/**
 * Check a review run directory against the evidence it claims.
 *   <dir>/evidence.json  written by lib/evidence.mjs while capturing: { contract?: {id, digest, sourcesDigest}, screenshots: [...], checks: [{name, passed}] }
 *   <dir>/review.json    written by the reviewer: { reviewer, task, criteria: { hierarchy: { verdict, observation, evidence } … },
 *                        contractRules: { R1: { verdict: pass|known-gap|fail, observation, evidence: [...] } }, findings: [...] }
 * Limit: someone who rewrites images, evidence.json and review.json together is not caught. Keep evidence in CI for that.
 */
export function reviewProblems(cfg, dir) {
  const p = [];
  const read = (n) => existsSync(resolve(dir, n)) ? JSON.parse(readFileSync(resolve(dir, n), 'utf8')) : null;
  const ev = read('evidence.json'), review = read('review.json');
  if (!ev) return ['evidence.json is missing — capture with lib/evidence.mjs.'];
  if (!review) return ['review.json is missing — write the judgments.'];
  const shots = Array.isArray(ev.screenshots) ? ev.screenshots : [];
  const passed = (ev.checks ?? []).filter((c) => c.passed).map((c) => c.name);
  if (!shots.length) p.push('evidence.json has no screenshots — capture with lib/evidence.mjs.');
  if (!ev.checks?.length) p.push('evidence.json has no checks — ev.finish() records at least the render audit.');
  const seen = new Set();
  for (const s of shots) { const k = `${s.path}`; if (seen.has(k)) p.push(`screenshot recorded twice: ${k}`); seen.add(k); }
  const known = (e) => shots.some((s) => s.path === e) || passed.includes(e);
  if (!nonEmpty(review.reviewer) || !nonEmpty(review.task)) p.push('review.json needs reviewer and task (the user task this screen was judged against).');
  for (const k of CRITERIA) {
    const c = review.criteria?.[k];
    // a screenshot cannot prove keyboard or motion: for those two, "unverified" is an honest answer. Everything else needs a pass with evidence.
    if (UNPROVABLE.includes(k) && c?.verdict === 'unverified' && nonEmpty(c.observation)) continue;
    if (c?.verdict !== 'pass' || !nonEmpty(c.observation) || !c.evidence?.length) { p.push(`criterion ${k}: needs verdict pass with observation and evidence${UNPROVABLE.includes(k) ? ' (or unverified with an observation)' : ''}${c?.verdict ? ` — it was ${c.verdict}` : ''}.`); continue; }
    for (const e of c.evidence) if (!known(e)) p.push(`criterion ${k}: unknown evidence ${e}`);
  }
  for (const c of ev.checks ?? []) if (!c.passed) p.push(`browser check failed: ${c.name}`);
  for (const s of shots) {
    const file = resolve(dir, s.path);
    if (!existsSync(file)) { p.push(`missing screenshot: ${s.path}`); continue; }
    if (sha(readFileSync(file)) !== s.sha256) p.push(`screenshot changed after capture: ${s.path}`);
    const size = pngSize(file), [w, h] = String(s.viewport ?? '').split('x').map(Number), k = s.scale ?? 1;
    // a full-page capture can be narrower by the scrollbar width
    if (!size || (s.fullPage ? (size.w > w * k || size.w < (w - 32) * k) : (size.w !== w * k || size.h !== h * k))) p.push(`image size does not match the recorded viewport: ${s.path} (${size ? `${size.w}x${size.h}` : 'not a PNG'} vs ${s.viewport}${k !== 1 ? ` @${k}x` : ''})`);
  }
  for (const f of review.findings ?? []) if (['critical', 'major'].includes(f.severity) && f.status !== 'fixed') p.push(`unresolved ${f.severity} finding: ${f.problem}`);
  if (!ev.contract) return p;
  const { id, digest } = ev.contract;
  const { contract, digest: now } = loadContract(cfg, id);
  const ledger = loadLedger(cfg);
  for (const x of validateContract(cfg, contract, ledger[id]?.floor)) p.push(`contract ${id}: ${x}`);
  if (digest !== now) p.push(`contract ${id} changed after the evidence was captured — capture again.`);
  if (ev.contract.sourcesDigest !== sourcesDigest(cfg, contract)) p.push(`contract ${id}: screen sources changed after the evidence was captured (or the capture did not record them) — capture again.`);
  const onRoute = (s) => pathOf(s.route) === pathOf(contract.route);
  const required = (state) => (contract.evidence?.required ?? []).find((e) => e.state === state);
  for (const e of contract.evidence?.required ?? [])
    if (!shots.some((s) => s.state === e.state && s.viewport === e.viewport && onRoute(s))) p.push(`contract ${id}: required state not captured: ${e.state} @ ${e.viewport} on ${contract.route}`);
  const gaps = new Set(contract.knownGapRules ?? []);
  for (const r of contract.rules ?? []) {
    const item = review.contractRules?.[r.id];
    const ok = item?.verdict === 'pass' || (item?.verdict === 'known-gap' && gaps.has(r.id));
    if (!ok || !nonEmpty(item.observation) || !item.evidence?.length) { p.push(`contract ${id} ${r.id}: ${item?.verdict === 'known-gap' ? 'not in knownGapRules' : 'no passing verdict with observation and evidence'} — ${r.text}`); continue; }
    for (const e of item.evidence) if (!shots.some((s) => s.path === e) && !passed.includes(e)) p.push(`contract ${id} ${r.id}: unknown evidence ${e}`);
    for (const st of r.evidenceStates ?? []) {
      const e = required(st);
      if (!item.evidence.some((x) => shots.some((s) => s.path === x && s.state === st && s.viewport === e?.viewport && onRoute(s)))) p.push(`contract ${id} ${r.id}: no screenshot of state ${st} in the evidence.`);
    }
    if (item.verdict === 'pass') for (const ch of r.checks ?? []) if (!passed.includes(ch)) p.push(`contract ${id} ${r.id}: check «${ch}» did not pass.`);
  }
  for (const k of Object.keys(review.contractRules ?? {})) if (!(contract.rules ?? []).some((r) => r.id === k)) p.push(`contract ${id}: verdict for a rule that is not in the contract: ${k}`);
  // one image cannot stand in for two different required states
  const byHash = new Map();
  for (const s of shots.filter((s) => !s.fullPage && onRoute(s) && required(s.state))) { if (byHash.has(s.sha256) && byHash.get(s.sha256) !== s.state) p.push(`contract ${id}: states ${byHash.get(s.sha256)} and ${s.state} are the same image.`); byHash.set(s.sha256, s.state); }
  return p;
}
