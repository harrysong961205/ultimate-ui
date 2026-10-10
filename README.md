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

## Install

### As a Claude Code plugin (skill + edit hook)

```
/plugin marketplace add harrysong961205/ultimate-ui
/plugin install ultimate-ui@ultimate-ui
```

The skill loads for UI work. The edit hook does nothing until a project opts in with `ultimate-ui.config.json`.

### The checker in your project

```bash
npm i -D github:harrysong961205/ultimate-ui postcss typescript
npx uui init      # creates ultimate-ui.config.json and docs/screen-contracts/
```

Edit the paths in `ultimate-ui.config.json`:

```json
{
  "src": "src",
  "tokens": ["src/tokens.css"],
  "baseline": "design-baseline.json",
  "contracts": "docs/screen-contracts"
}
```

Freeze today's debt once. This is a human decision, the only time growth is allowed:

```bash
npx uui literals --update-baseline --allow-growth
```

Then gate your build:

```json
{ "scripts": { "build": "uui literals && vite build" } }
```

### Other agents (Codex, Cursor, …)

The rules are plain Markdown in [`skills/ultimate-ui/`](skills/ultimate-ui/). Point your agent instructions (`AGENTS.md` etc.) at `SKILL.md`. The build gate and `uui review` work the same, whoever wrote the code.

## Commands

| Command | |
|---|---|
| `uui init` | create config and contract folder |
| `uui literals` | static token check over `src` (exit 1 on a new bypass) |
| `uui literals --files a.css b.tsx` | check only these files |
| `uui literals --update-baseline` | shrink the debt list to what remains (never grows) |
| `uui literals --update-baseline --allow-growth` | write new violations into the debt list — **human decision** |
| `uui contract [id]` | validate screen contracts against their approved floor |
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
- The edit hook is a `PostToolUse` hook: the edit has already been written when it reports. It tells the agent to fix the bypass; it does not undo the edit. It only runs inside Claude Code. The build gate is what actually stops a bypass, for every editor.
- Ratios like 60/30/10 are not enforced. They are thinking aids.

## Development

```bash
npm install
npm test     # the checkers must reject the failures they exist for
```

## License

Code and documentation: MIT.

The color guide paraphrases and briefly quotes a third-party video (BLACKSWAN, YouTube) for commentary, with attribution. Those quotes and their translations belong to their author and are **not** covered by the MIT license.
