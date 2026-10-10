// Render audit — catches what the static check cannot see, on a real rendered page (Playwright).
//  1. inline styles (React style objects, runtime values): same rule as the static check (lib/policy.mjs)
//  2. composite contrast: text color against the stacked backgrounds and ancestor opacity (WCAG 2 ratio)
// Counted as unverified: text inside running animations, text over background images, unreadable color formats.
// Not computed: elements overlapping from elsewhere (absolute overlays), mix-blend-mode, filter.
//
//   const audit = createRenderAudit(loadConfig());
//   await audit.page(page, 'home-1440');          // after each screenshot
//   const { fresh, coverage } = audit.finish(outDir); // fail on fresh; report coverage separately
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { judge } from './policy.mjs';
import { tokenNames, readBaseline } from './literals.mjs';

function inPage({ judgeSource, names, allowed }) {
  const judge = new Function(`return (${judgeSource})`)();
  const parse = (c) => { const m = String(c).match(/^rgba?\(([^)]+)\)$/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); if (p.some(Number.isNaN)) return null; return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bottom) => { const a = top[3] + bottom[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a); };
  const lum = (c) => c.slice(0, 3).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].slice(0, 3).map((c) => '.' + c).join(''));
  const out = { inline: [], contrast: [], audited: 0, unverified: 0 };
  for (const el of document.querySelectorAll('body *')) {
    for (const prop of [...el.style]) {
      const why = judge(prop, el.style.getPropertyValue(prop), names, allowed);
      if (why) out.inline.push({ el: label(el), detail: `${prop}: ${el.style.getPropertyValue(prop)}`, why });
    }
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent.trim();
    if (!own) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    // every painted text, including off-screen (same scope as a full-page screenshot)
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden') continue;
    if (el.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"],.sr-only,.visually-hidden') || parseFloat(cs.fontSize) < 6) continue;
    // ancestor effects (opacity, motion) all the way up; background layers until the first opaque one
    let opacity = 1, moving = false, image = false, layers = [], opaque = false, unreadable = false;
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a); opacity *= +s.opacity;
      if (a.getAnimations().some((x) => x.playState === 'running')) moving = true;
      if (opaque) continue;
      if (s.backgroundImage !== 'none') image = true;
      const bg = parse(s.backgroundColor);
      if (!bg) { unreadable = true; continue; }
      if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) opaque = true; }
    }
    if (opacity === 0) continue;
    const fg = parse(cs.color);
    if (image || moving || unreadable || !fg) { out.unverified++; continue; }
    let backdrop = [255, 255, 255, 1]; // no opaque layer: the default white canvas
    for (const l of layers.reverse()) backdrop = over(l, backdrop);
    // approximation: ancestor opacity fades the text toward the composite backdrop right under it
    const seen = over([fg[0], fg[1], fg[2], fg[3] * opacity], backdrop);
    const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    const min = large ? 3 : 4.5, got = ratio(seen, backdrop);
    out.audited++;
    if (got < min) out.contrast.push({ el: label(el), detail: `${got.toFixed(2)}<${min}`, text: own.slice(0, 40), opacity: +opacity.toFixed(2) });
  }
  return out;
}

export function createRenderAudit(cfg) {
  const names = tokenNames(cfg);
  const findings = [];
  let audited = 0, unverified = 0, pages = 0;
  return {
    async page(page, state) {
      const r = await page.evaluate(inPage, { judgeSource: judge.toString(), names, allowed: cfg.allowed });
      pages++; audited += r.audited; unverified += r.unverified;
      for (const f of r.inline) findings.push({ kind: 'inline', state, ...f });
      for (const f of r.contrast) findings.push({ kind: 'contrast', state, ...f });
    },
    // key = «state | kind | element | detail», value = count in that state. More than the baseline `render` list = new.
    // "No new violation" and "coverage" are separate results — never report one as the other.
    finish(outDir) {
      const counts = new Map();
      for (const f of findings) { const key = [f.state, f.kind, f.el, f.detail].join(' | '); const e = counts.get(key) ?? { key, count: 0, sample: f }; e.count++; counts.set(key, e); }
      const list = [...counts.values()];
      const known = readBaseline(cfg).render ?? {};
      const fresh = list.filter((f) => f.count > (known[f.key] ?? 0));
      const coverage = { pages, audited, unverified };
      if (outDir) writeFileSync(resolve(outDir, 'render-audit.json'), JSON.stringify({ method: 'computed style + alpha-composited contrast (WCAG 2), rule lib/policy.mjs', coverage, findings: list, new: fresh.map((f) => f.key) }, null, 2) + '\n');
      return { fresh, coverage };
    },
  };
}
