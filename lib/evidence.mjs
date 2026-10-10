// Evidence capture for a review run — use it inside your own Playwright fixture script.
//
//   import { loadConfig } from 'ultimate-ui/lib/config.mjs';
//   import { createEvidence } from 'ultimate-ui/lib/evidence.mjs';
//   const ev = createEvidence(loadConfig(), 'artifacts/ui-review/2026-10-10T10-00', { contract: 'checkout' });
//   await ev.check('empty cart says empty, not failed', async () => { ...; await ev.shot(page, 'cart-empty-1440'); });
//   ev.finish(); // writes evidence.json + render-audit.json, then: npx uui review <dir>
//
// Every screenshot is taken twice (viewport and full page) and the render audit runs on it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRenderAudit } from './render-audit.mjs';
import { loadContract, sha, sourcesDigest } from './contract.mjs';

export function createEvidence(cfg, dir, { contract } = {}) {
  mkdirSync(resolve(dir, 'screenshots'), { recursive: true });
  const audit = createRenderAudit(cfg);
  const screenshots = [], checks = [], taken = new Set();
  // the contract and the screen sources as they were when captured — `uui review` fails if either changed since
  const loaded = contract ? loadContract(cfg, contract) : null;
  const record = loaded ? { id: contract, digest: loaded.digest, sourcesDigest: sourcesDigest(cfg, loaded.contract) } : undefined;
  return {
    async shot(page, state) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(state ?? '') || state.endsWith('-full')) throw new Error(`bad state name: ${state} — letters, digits, . _ - only, not ending in -full.`);
      // reserved before any await, so two concurrent calls with the same state cannot both write
      if (taken.has(state)) throw new Error(`state ${state} was already captured — name each state × viewport once (e.g. orders-390).`);
      taken.add(state);
      await audit.page(page, state);
      const url = new URL(page.url()), vp = page.viewportSize();
      const scale = await page.evaluate(() => devicePixelRatio);
      for (const fullPage of [false, true]) {
        const path = `screenshots/${state}${fullPage ? '-full' : ''}.png`;
        await page.screenshot({ path: resolve(dir, path), fullPage });
        screenshots.push({ path, route: url.pathname + url.search, state, viewport: `${vp.width}x${vp.height}`, scale, fullPage, sha256: sha(readFileSync(resolve(dir, path))) });
      }
    },
    /** Run a named behaviour check. Contract rules can require it by name (rules[].checks). */
    async check(name, fn) {
      try { await fn(); checks.push({ name, passed: true }); }
      catch (e) { checks.push({ name, passed: false, error: String(e?.stack ?? e) }); }
    },
    finish() {
      const { fresh, coverage } = audit.finish(dir);
      checks.push({ name: `render audit: no new token bypass or contrast failure (${coverage.audited} text checked, ${coverage.unverified} unverified, ${coverage.pages} shots)`, passed: fresh.length === 0 && coverage.audited > 0 });
      writeFileSync(resolve(dir, 'evidence.json'), JSON.stringify({ createdAt: new Date().toISOString(), contract: record, screenshots, checks }, null, 2) + '\n');
      return { screenshots, checks, fresh, coverage };
    },
  };
}
