---
name: ultimate-ui
description: Plan, build and review UI screens so they hold up without the user spelling out every detail. Use for any UI change, a new screen, a screen that "looks off", design-system work, or color decisions. Turns the user's purpose into a screen contract (questions → information → relational emphasis rules → required states), keeps every value on design tokens, and requires a real screenshot review before a screen is called done.
---

# Ultimate UI

Tokens keep **values** consistent. They do not decide what comes first, what is folded away, or what must be visible before a decision. That comes from the plan. Most UI regressions by agents happen because that plan lives only in the agent's head and is thrown away. This skill writes the plan down, builds against it, and reviews the rendered screen against it.

Read the project's own design documents and tokens first. The running product is the source of truth. This skill never overrides a project's brand, palette or approved layouts.

## 1. Decide the screen before styling it

Write a short brief before editing:

- **User and situation:** who opens this screen, and in what moment. Also say what this screen is *not* for.
- **Questions, ranked:** what they need to find out or decide (Q1 is answered first). Rank is the root of emphasis.
- **Information:** each item names the question it answers, its data source, and its disclosure: `initial`, `secondary` or `detail`. An item that answers no question has no reason to be shown.
- **Emphasis as relational rules, not levels:** "A before B", "C is visible before the decision and never folded", "in the error state, D says failed — not empty". Importance, certainty, urgency and selection are separate axes. "Important, so bigger, bolder, redder" makes a guess look like a fact.
- **States:** loading, empty, error, partial, large data, narrow viewport. Name each and say how it differs.
- **Pattern:** queue, searchable list, object detail, conversation or overview — and why. See [screen patterns](references/screen-patterns.md).

For a new screen, or a question the project has no settled pattern for, **look at how others solved the same decision first**: [finding references](references/finding-references.md). Record what you saw and what you take in `docs/ui-references/`. Translate patterns into this project's tokens; never copy a design.

For a new screen or an information-structure change, **persist the brief as a screen contract** (`docs/screen-contracts/<id>.json`, format in [screen contracts](references/screen-contracts.md)). Do not make one for small fixes. Record the user's words that set the purpose in `approval` (or, when the words are sensitive, a reference to where they are recorded). If the purpose is not in their words, ask that one question.

## 2. Build on tokens

- Use the project's semantic tokens for spacing, radius, type and color. A missing role is a token gap: ask for a token or an exception. Do not inline a literal.
- Color decisions follow [color](references/color.md):
  - Judge a color on its real surroundings.
  - Plan lightness → chroma → hue by role.
  - Keep accents to small areas, and give one meaning per color.
  - Check the screen in grayscale first.
- Never invent data or metrics to make a screen look full. Distinguish an opinion or a guess from an established fact, in words and not only with color.
- Failure is not empty. A failed query says "could not load" with a retry. It never shows "nothing here". A failed refresh keeps the previous content of the same scope and says it is stale.
- Truncated is not complete. Say "showing 50 of 2,830" and give the action that shows the rest.

If the project uses the `uui` checker (`ultimate-ui.config.json`), the edit hook reports token bypasses to you right after each edit (the edit is already written; the hook does not undo it). Fix them before moving on — the build gate (`uui literals`) is what actually stops them. Never grow the debt list yourself: `--allow-growth` is a human decision.

## 3. Review the rendered screen

Code and type checks do not judge a screen. Follow the [review loop](references/review-loop.md):

1. Add fixtures for every required state and viewport. Every API is mocked and external traffic is blocked.
2. Capture screenshots and run behaviour checks. In Playwright, use `lib/evidence.mjs`. It also runs the render audit for inline literals and composite contrast.
3. Actually open the images. Judge hierarchy, density, readability, actions, states, keyboard, responsive behaviour and motion. For each contract rule, write a verdict, the observation, and the evidence that proves it.
4. Fix important findings, then capture again from the final source.
5. Run `npx uui review <dir>`. A screen is not done while a rule is unjudged, a required state is missing, a check failed, or a major finding is open.

Report three things separately:
- Source, type and build checks.
- Rendered visual and interaction evidence.
- What was not verified.

A blocked browser means visual review is unverified. Never call it passed. Never inflate a verdict: if the first viewport only shows counts and links where the contract says "answers Q1–Q3", that rule fails.

## What machines can and cannot catch

**Caught:**
- A literal value instead of a token
- A new violation, a value that moved, or a growing count
- A required state that was not captured
- A rule that was not judged
- A screenshot that changed after capture
- A fake PNG
- A contract floor quietly lowered

**Not caught, so it stays your judgment:**
- Whether the questions are the right ones
- Whether the evidence is enough to decide
- Whether the intended thing really draws the eye first
