# Ultimate UI

**Make AI agents ship UI that holds up — without spelling out every detail.**

[한국어](README.ko.md)

Agents can write a screen that compiles, passes type checks and still gets the basics wrong:
- The thing you need first is below the fold.
- A failed request looks like "nothing here".
- A guess looks like a fact.
- Every screen invents its own colors and spacing.

Ultimate UI attacks this at three points:

| Layer | What it does | Enforced by |
|---|---|---|
| **Plan → screen contract** | Writes down who uses the screen and for what decision. Every item shown names the question it answers. Emphasis becomes relational rules with reasons and failure cases. Required states × viewports are listed. | `uui contract` (format + approved floor that cannot be lowered silently) |
| **Values → design tokens** | Spacing, radius, type and color must come from your tokens. Today's violations are frozen as debt that can only shrink. | `uui literals` before your build (the gate) + a Claude Code hook that reports a bypass to the agent right after an edit + a render audit on real pages (inline styles, approximate composite contrast) |
| **Review → real screenshots** | Required states are captured with fixtures. Every contract rule and eight quality criteria need a verdict, an observation and evidence. Images are hashed and their PNG structure is checked. | `uui review` (incomplete while any rule or criterion is unjudged, a state is missing, a check failed, the screen source changed since capture or a major finding is open) |

The skill also carries a **color guide** distilled from color-theory basics:
- Judge a color on its real surroundings.
- Plan lightness → chroma → hue.
- Keep accents small.
- Give one meaning per color.
- Look in grayscale first.

See [color.md](skills/ultimate-ui/references/color.md).

Before designing a new screen, the skill has the agent **look at how others solved the same decision** — searching by the user's question, not by "pretty dashboard" — and record what it saw, what it takes and what it avoids in `docs/ui-references/`. Patterns are translated into your tokens; nothing is copied. See [finding-references.md](skills/ultimate-ui/references/finding-references.md).

## Install

Two pieces: the **plugin** once per person (Claude Code finds the skill everywhere), and the **checker** once per project (pinned, so the build, the edit hook and every agent use the same version).

### 1. Once per person — Claude Code plugin

```
/plugin marketplace add harrysong961205/ultimate-ui
/plugin install ultimate-ui@ultimate-ui
```

The skill loads for UI work in every project. The edit hook does nothing in a project until it has `ultimate-ui.config.json`. When the project has its own pinned copy in `node_modules`, the hook hands the check to that copy.

### 2. Once per project — pinned checker + wiring

```bash
npm i -D github:harrysong961205/ultimate-ui#v0.2.0 postcss typescript
npx uui init
```

`uui init` is safe to re-run. It:
- creates `ultimate-ui.config.json`, `docs/screen-contracts/` and `docs/ui-references/` (with templates);
- adds one marked block to `AGENTS.md` and/or `CLAUDE.md` telling any agent when to use the skill, where the tokens are and which checks must pass — existing text is kept, and re-running only replaces that block (`--no-agents` to skip);
- enables the plugin for the project in `.claude/settings.json`, so teammates opening it in Claude Code are offered it (`--no-claude` to skip).

Then a human does the parts that are decisions:

1. Point `src` and `tokens` in `ultimate-ui.config.json` at this project. Put the config at each product's own root. The search for it walks up from the edited file and stops at the repository root (a folder with `.git`), so a config above a nested repository never applies inside it. In a monorepo without nested repositories, a sub-project without its own config inherits the nearest one above — give each product its own config (`npx uui init --here` in that folder).
2. Freeze today's debt once — the only time growth is allowed:
   ```bash
   npx uui literals --update-baseline --allow-growth
   ```
3. Gate the build:
   ```json
   { "scripts": { "build": "uui literals && vite build" } }
   ```
4. Check the setup:
   ```bash
   npx uui doctor
   ```

To upgrade, change the tag (`#v0.2.0` → the next one) in a branch, run `npm test`/your build and `npx uui init` again, and review the diff. Never let an upgrade grow the debt list or loosen a contract by itself.

### Other agents (Codex, Cursor, …)

`uui init` writes the instructions into `AGENTS.md`, which Codex and most agents read. The rules themselves are plain Markdown in [`skills/ultimate-ui/`](skills/ultimate-ui/). The build gate and `uui review` work the same, whoever wrote the code.

### Projects that already have their own UI rules

Keep the project's own guide as the source of truth for its brand, components and screens, and let it point to ultimate-ui for the general method. Do not run two token checkers on the same code: move to `uui literals` only after it gives the same findings as the existing check.

## Commands

| Command | |
|---|---|
| `uui init` | set up or update the project: config, folders, agent instructions, Claude Code plugin (safe to re-run) |
| `uui literals` | static token check over `src` (exit 1 on a new bypass) |
| `uui literals --files a.css b.tsx` | check only these files |
| `uui literals --update-baseline` | shrink the debt list to what remains (never grows) |
| `uui literals --update-baseline --allow-growth` | write new violations into the debt list — **human decision** |
| `uui doctor` | show what is set up and what is missing |
| `uui contract [id]` | validate screen contracts against their approved floor |
| `uui refs [id]` | validate reference records in `docs/ui-references/` |
| `uui review <dir> [--accept]` | check a review run; `--accept` records the floor and the source digest |

## Capturing evidence (Playwright)

```js
import { loadConfig } from 'ultimate-ui/lib/config.mjs';
import { createEvidence } from 'ultimate-ui/lib/evidence.mjs';

const ev = createEvidence(loadConfig(), 'artifacts/ui-review/run-1', { contract: 'orders' });
await ev.check('failed load is not an empty claim', async () => {
  // mock /api/orders with a 503, assert the error text, then:
  await ev.shot(page, 'orders-error-1440');
});
ev.finish();            // evidence.json + render-audit.json
// open the screenshots, write review.json, then:
// npx uui review artifacts/ui-review/run-1
```

A contract template is in [`templates/screen-contract.json`](templates/screen-contract.json). The format is in [screen-contracts.md](skills/ultimate-ui/references/screen-contracts.md).

## What it checks

**Static**
- Literal spacing, radius and type values (`padding: 13px`).
- Color literals and named colors, including inside borders, shadows and gradients.
- `var()` fallbacks with literals, undefined tokens, and literals inside `calc()` unless they multiply a token.
- CSS via PostCSS. TS/TSX/JS/JSX via the TypeScript syntax tree: JSX `style`, style variables followed to their declaration, both sides of `?:` and `??`.
- Text in comments and strings is never mistaken for a declaration.

**Rendered**
- Inline styles on the real DOM.
- Text contrast (WCAG 2 ratio) against stacked translucent backgrounds and ancestor opacity. It is an approximation from computed styles, not a pixel measurement.
- Text it cannot measure — animations, background images, unknown color formats — is counted as *unverified*, not as passed.

**References**
- Each record says how closely it was looked at, what was observed, what is adopted and why, what is avoided and what may be reused.
- A reference seen only in a search summary cannot be adopted. A contract may cite only adopted references.

**Review**
- Required states captured on the contract's route at the contract's viewport.
- Every rule judged with the screenshots of the states it names.
- Named behaviour checks passed.
- Images unchanged since capture; PNG chunks, CRCs and pixel-data length match the recorded viewport. Pixels are not inspected.
- One image cannot stand in for two states. The contract and the screen sources listed in it cannot change after capture.
- `reviewer`, `task` and all eight criteria (hierarchy, density, readability, actions, states, keyboard, responsive, motion) are judged. Keyboard and motion may be `unverified` with an observation — a screenshot does not prove them.

## What it does not do

- It cannot tell whether the questions in a contract are the right ones, or whether something really draws the eye first. That stays human or agent judgment, on real screenshots.
- It does not catch someone rewriting images, `evidence.json` and `review.json` together. Keep evidence in CI if that matters.
- When the project pins its own copy, the edit hook trusts that copy's answer. A pinned copy that exits cleanly without checking is not detected — it is project code, like the build script.
- The edit hook is a `PostToolUse` hook: the edit has already been written when it reports. It tells the agent to fix the bypass; it does not undo the edit. It only runs inside Claude Code. The build gate is what actually stops a bypass, for every editor.
- Ratios like 60/30/10 are not enforced. They are thinking aids.

## Development

```bash
npm install
npm test     # the checkers must reject the failures they exist for
```

## License

Code and documentation: MIT.

The color guide paraphrases a third-party video (BLACKSWAN, YouTube) for commentary, with attribution. It contains no verbatim quotes. The video's content belongs to its author and is **not** covered by the MIT license.
