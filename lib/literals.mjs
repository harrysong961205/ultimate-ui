// Static check: does screen code bypass the design tokens?
// CSS is parsed with PostCSS and TS/TSX/JS/JSX with the TypeScript syntax tree, so text inside strings and
// comments is never mistaken for a declaration. Existing violations are frozen in the baseline as
// «file | scope (selector or component) | property | value → count». A new violation, a changed or moved
// value, or a higher count fails.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { judge } from './policy.mjs';
import { projectImport } from './config.mjs';

const walk = (dir) => existsSync(dir) ? readdirSync(dir).flatMap((n) => { if (n === 'node_modules' || n.startsWith('.')) return []; const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
// React does not append px to these (within the checked categories)
const UNITLESS = new Set(['line-height', 'font-weight']);
const kebab = (k) => k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** Token names: every custom property defined in the token files and in project CSS (local tokens are judged separately). */
export function tokenNames(cfg) {
  const postcss = projectImport(cfg.root, 'postcss');
  const names = new Set();
  for (const f of [...cfg.tokenFiles, ...walk(cfg.srcDir).filter((f) => f.endsWith('.css'))])
    if (existsSync(f)) postcss.parse(readFileSync(f, 'utf8')).walkDecls((d) => { if (d.prop.startsWith('--')) names.add(d.prop); });
  return [...names];
}

function cssDeclarations(postcss, text, file) {
  const out = [];
  postcss.parse(text, { from: file }).walkDecls((d) => {
    const chain = []; for (let p = d.parent; p && p.type !== 'root'; p = p.parent) chain.unshift(p.type === 'atrule' ? `@${p.name} ${p.params}` : p.selector);
    out.push({ scope: chain.join(' >> ').replace(/\s+/g, ' '), prop: d.prop.toLowerCase(), value: d.value + (d.important ? ' !important' : ''), line: d.source?.start?.line ?? 0 });
  });
  return out;
}

function scriptDeclarations(ts, program, checker, file) {
  const sf = program.getSourceFile(file);
  const out = [];
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const scopeOf = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name) return p.name.text;
      if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) return p.parent.name.text;
    }
    return 'module';
  };
  // identifier → the initializer of its real declaration in the same file (respects scope)
  const resolveId = (id) => {
    const sym = checker.getSymbolAtLocation(id);
    const d = sym?.valueDeclaration ?? sym?.declarations?.[0];
    if (d && d.getSourceFile() === sf && ts.isVariableDeclaration(d) && d.initializer) return d.initializer;
    if (d && ts.isShorthandPropertyAssignment(d)) { const v = checker.getShorthandAssignmentValueSymbol(d)?.valueDeclaration; if (v && v.getSourceFile() === sf && ts.isVariableDeclaration(v) && v.initializer) return v.initializer; }
    return null;
  };
  // statically knowable candidate values (both sides of ?:, ?? and ||, fixed parts of templates)
  const candidates = (e, depth = 0) => {
    if (!e || depth > 4) return [];
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e)) return candidates(e.expression, depth);
    if (ts.isNumericLiteral(e)) return [{ num: true, text: e.text }];
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return [{ num: true, text: '-' + e.operand.text }];
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ text: e.text }];
    if (ts.isTemplateExpression(e)) return [{ text: [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(' T ') }];
    if (ts.isConditionalExpression(e)) return [...candidates(e.whenTrue, depth + 1), ...candidates(e.whenFalse, depth + 1)];
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) return [...candidates(e.left, depth + 1), ...candidates(e.right, depth + 1)];
    if (ts.isIdentifier(e)) { const init = resolveId(e); return init ? candidates(init, depth + 1) : []; }
    return []; // only known at run time — the render audit covers it
  };
  const styleObject = (e, scope, depth = 0) => {
    if (!e || depth > 4) return;
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e)) return styleObject(e.expression, scope, depth);
    if (ts.isConditionalExpression(e)) { styleObject(e.whenTrue, scope, depth + 1); styleObject(e.whenFalse, scope, depth + 1); return; }
    if (ts.isIdentifier(e)) { const init = resolveId(e); if (init) styleObject(init, scope, depth + 1); return; }
    if (!ts.isObjectLiteralExpression(e)) return;
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) { styleObject(p.expression, scope, depth + 1); continue; }
      let key = null, init = null;
      if (ts.isPropertyAssignment(p)) {
        const n = ts.isComputedPropertyName(p.name) ? p.name.expression : p.name;
        key = ts.isIdentifier(n) || ts.isStringLiteralLike(n) ? n.text : null; init = p.initializer;
      } else if (ts.isShorthandPropertyAssignment(p)) { key = p.name.text; init = p.name; }
      if (!key) continue;
      const prop = kebab(key);
      for (const c of candidates(init)) {
        const value = c.num && c.text !== '0' && !UNITLESS.has(prop) ? `${c.text}px` : c.text;
        out.push({ scope, prop, value, line: lineOf(p), pos: p.getStart(sf) });
      }
    }
  };
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'style' && n.initializer && ts.isJsxExpression(n.initializer)) styleObject(n.initializer.expression, scopeOf(n));
    // variables or properties named *style*, objects typed as CSSProperties
    if (ts.isVariableDeclaration(n) && n.initializer && ((ts.isIdentifier(n.name) && /style/i.test(n.name.text)) || (n.type && /CSSProperties/.test(n.type.getText(sf))))) styleObject(n.initializer, scopeOf(n));
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && /^style$/i.test(n.name.text) && !ts.isJsxAttribute(n.parent)) styleObject(n.initializer, scopeOf(n));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // the same source node reached by two paths (variable and style attribute) counts once
  const seen = new Set();
  return out.filter((d) => { const k = `${d.pos}|${d.scope}|${d.prop}|${d.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const readBaseline = (cfg) => existsSync(cfg.baselinePath) ? JSON.parse(readFileSync(cfg.baselinePath, 'utf8')) : { entries: {}, exceptions: {}, render: {} };

/**
 * Run the static check.
 * opts.files: check only these files (edit hook). opts.update: shrink the baseline to what remains (never grows).
 * opts.allowGrowth: with update, write new violations into the baseline — a human decision.
 * Returns { code, out, err } — code 0 pass, 1 violations, 2 usage error.
 */
export function checkLiterals(cfg, opts = {}) {
  const out = [], err = [];
  const usage = (m) => ({ code: 2, out: '', err: m });
  if (!existsSync(cfg.srcDir)) return usage(`src directory not found: ${cfg.srcDir} — check "src" in the config.`);
  for (const t of cfg.tokenFiles) if (!existsSync(t)) return usage(`token file not found: ${t} — check "tokens" in the config.`);
  if (opts.files && !opts.files.length) return usage('--files needs at least one file.');
  if (opts.files && opts.update) return usage('--update-baseline needs the full check (a partial update would drop entries outside the files).');
  const exts = new Set(cfg.extensions);
  const isTarget = (f) => f.startsWith(cfg.srcDir + '/') && exts.has(f.slice(f.lastIndexOf('.'))) && !/\.d\.ts$/.test(f) && !cfg.tokenFiles.includes(f);
  const files = opts.files ? opts.files.map((f) => resolve(f)) : walk(cfg.srcDir);
  for (const f of files) if (!existsSync(f)) return usage(`missing file: ${f}`);
  const targets = files.filter(isTarget);
  const names = tokenNames(cfg);
  const scripts = targets.filter((f) => !f.endsWith('.css'));
  const ts = scripts.length ? projectImport(cfg.root, 'typescript') : null;
  const postcss = targets.some((f) => f.endsWith('.css')) ? projectImport(cfg.root, 'postcss') : null;
  const program = ts ? ts.createProgram(scripts, { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve, allowJs: true, types: [] }) : null;
  const checker = program?.getTypeChecker();

  const found = new Map();
  for (const f of targets) {
    const rel = relative(cfg.root, f);
    let decls;
    try { decls = f.endsWith('.css') ? cssDeclarations(postcss, readFileSync(f, 'utf8'), f) : scriptDeclarations(ts, program, checker, f); }
    catch (e) { return usage(`cannot read ${rel}: ${e.message}`); }
    for (const d of decls) {
      const why = judge(d.prop, d.value, names, cfg.allowed); if (!why) continue;
      const key = [rel, d.scope, d.prop, d.value].join(' | ');
      const e = found.get(key) ?? { count: 0, where: [], why }; e.count++; e.where.push(`${rel}:${d.line}`); found.set(key, e);
    }
  }
  const baseline = readBaseline(cfg);
  const allowedCount = (key) => (baseline.entries?.[key] ?? 0) + (baseline.exceptions?.[key]?.count ?? 0);
  const violations = [...found].filter(([k, e]) => e.count > allowedCount(k));

  if (opts.update) {
    const next = {};
    for (const [key, e] of found) { const n = opts.allowGrowth ? e.count : Math.min(e.count, baseline.entries?.[key] ?? 0); if (n > 0) next[key] = n; }
    let render = baseline.render ?? {};
    let refused = violations.length && !opts.allowGrowth ? violations.length : 0;
    if (opts.renderReport) {
      const report = JSON.parse(readFileSync(resolve(opts.renderReport), 'utf8'));
      const counts = {}; for (const f of report.findings) counts[f.key] = f.count;
      const grown = Object.entries(counts).filter(([k, n]) => n > (render[k] ?? 0));
      if (grown.length && !opts.allowGrowth) refused += grown.length;
      render = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, opts.allowGrowth ? n : Math.min(n, render[k] ?? 0)]).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
    }
    const entries = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(cfg.baselinePath, JSON.stringify({
      note: 'Design-token debt. Shrinking is the default; growing or adding exceptions is a human decision (ultimate-ui).',
      total: Object.values(entries).reduce((a, b) => a + b, 0), entries, exceptions: baseline.exceptions ?? {}, render,
    }, null, 1) + '\n');
    out.push(`baseline updated: static ${Object.keys(baseline.entries ?? {}).length} → ${Object.keys(entries).length} entries, render ${Object.keys(baseline.render ?? {}).length} → ${Object.keys(render).length}`);
    if (refused) { err.push(`${refused} new violation(s) were not added — fix them, or (with a human decision) use --allow-growth.`); return { code: 1, out: out.join('\n'), err: err.join('\n') }; }
    return { code: 0, out: out.join('\n'), err: '' };
  }

  const shrinkable = Object.keys(baseline.entries ?? {}).filter((k) => targets.some((t) => k.startsWith(relative(cfg.root, t) + ' | ')) && (found.get(k)?.count ?? 0) < baseline.entries[k]);
  if (shrinkable.length) out.push(`${shrinkable.length} existing violation(s) fixed — shrink the baseline with: uui literals --update-baseline`);
  if (violations.length) {
    err.push(`${violations.length} design-token bypass(es) — use a token from ${cfg.tokens.join(', ')}, or ask a human to add a token or approve an exception.`);
    for (const [k, e] of violations) {
      const [, scope, prop, val] = k.split(' | ');
      err.push(`  ${e.where.join(', ')}  ${prop}: ${val}  (${e.why}${baseline.entries?.[k] ? `, was ${baseline.entries[k]} → now ${e.count}` : ''})  [${scope}]`);
    }
    return { code: 1, out: out.join('\n'), err: err.join('\n') };
  }
  if (!targets.length) return { code: 2, out: '', err: `no screen files to check (src: ${cfg.srcDir}, extensions: ${cfg.extensions.join(' ')}; token files are skipped) — check the config or --files.` };
  out.push(`design-token check passed — ${targets.length} file(s), ${[...found.values()].reduce((a, e) => a + e.count, 0)} existing violation(s) in the baseline`);
  return { code: 0, out: out.join('\n'), err: '' };
}
