# Working with color — from color-theory basics to UI rules

Source: BLACKSWAN (블랙스완), "A color-theory roadmap for when you first study color" (색을 처음 공부할 때 필요한 색채학 로드맵), YouTube, 2026-10-04, 17:39. https://www.youtube.com/watch?v=j1wt9T-ZZig — the video sections below paraphrase the Korean auto-captions in our own words; none is a verbatim quote; check the video for the exact wording. The video's content belongs to its author and is not covered by this repository's MIT license. Korean version: [color.ko.md](color.ko.md).

The video is a reading roadmap of color-theory books. It does not state UI rules. Each section below has two layers:

- **The video, paraphrased**: our wording of what the video says, with timestamps. Nothing here is a verbatim quote.
- **For UI**: ultimate-ui's interpretation. It is not the video's claim.

## 1. Color is seen in relation — never pick it in isolation

- **The video, paraphrased** [02:22–02:55]
  - We never see a color as it is. We always perceive it through the surrounding colors and context. The same color looks different when the environment changes.
  - Someone who uses color must think about how the result will trick the viewer's eye. The core idea is simultaneous contrast.
- **For UI**
  - Judge a color on the **real background and neighbours it sits on**, not on a swatch sheet. The same token reads differently on a dark surface, a selected row and a warning box.
  - Measure contrast on the final composited colors. `lib/render-audit.mjs` does this on rendered pages.
  - Before adopting a new color, screenshot it on every surface it will live on: default, hover, selected, dialog.

## 2. Plan color in its three attributes

- **The video, paraphrased** [03:31–03:46]: Hue, saturation and lightness — the three attributes — are the first step to structuring and planning color. From there it extends to tone and nuance.
- **For UI**
  - Split roles **lightness → chroma → hue**, in that order.
    - Lightness builds the hierarchy of surfaces and text.
    - Chroma builds emphasis and state.
    - Hue tells kinds of state apart: success, warning, error, selection.
  - Colors with the same role share lightness and chroma steps. A warning badge and an error badge differ in hue, not in weight.

## 3. Contrast is decided by kind, position and area

- **The video, paraphrased** [03:56–04:04]: Color contrast is how a color looks different depending on its kind, position and area. Arranged well, it becomes harmony.
- **For UI**
  - Accents go on **small areas**: the primary action, the current selection, meaningful state.
  - A saturated color across a large area beats everything else, so nothing stands out anymore.
  - The same color reads differently as a small dot (a badge marker) and as a large background. Review both.

## 4. Good color comes from planning and order

- **The video, paraphrased**
  - [04:09–04:15] Good color is made from planning and order. Even colors that look spontaneous and irregular must play inside an order to be accepted.
  - [09:22–09:31] If every decision to choose and place a color is accidental, it can never leave a lasting impression.
- **For UI**
  - Do not pick colors per screen. Take them only from **role tokens**.
  - When a new color seems needed, first write down which role is missing. `uui literals` and the edit hook enforce this.
  - Every color has a reason. A color whose reason you cannot state goes back to neutral.

## 5. Value distribution first, then dominant and supporting proportions

- **The video, paraphrased** [07:43–07:57]: The moment a scene appears you should see its color split. Only after the value distribution, then the proportion of dominant and supporting colors, can you move to the next step.
- **For UI**
  - In review, **look in grayscale first**. Check that the hierarchy (title, body, supporting, disabled) reads from lightness alone.
  - Then look at area: large neutral surfaces, medium supporting areas, small accents.
  - The order must still read with color removed. This is the same direction as the accessibility rule "never convey state by color alone".
  - Ratios like 60/30/10 are thinking aids. Do not enforce them.

## 6. Limiting color makes it stronger

- **The video, paraphrased**
  - [10:48–10:52] The more you limit color, the stronger it can become.
  - [04:44–04:50] A minimal color combination makes an image that carries emotion more clearly.
- **For UI**
  - Keep few accent hues on screen at once.
  - Do not paint every state. Give color to states a person must act on (needs review, error, unverified). Leave done and archived neutral.
  - State certainty (fact vs guess) in words too, not by size or color alone.

## 7. Colors carry context and meaning

- **The video, paraphrased** [06:35–07:02]: Color has been used symbolically in every moment of human history. Once you know what injecting a color's context into an image feels like, the colors you use become persuasive.
- **For UI**
  - In one product, a color has **one meaning**. For example: red = error or danger, green = done or deployed, amber = needs checking, blue = primary action or selection.
  - Do not reuse a color for a second meaning. Decorative red reads as an error.
  - When your users' cultural convention collides with the product meaning, add words. For example, red means "price up" in East Asian finance.

## 8. Write color as a system and measure it

- **The video, paraphrased** [05:17–05:28]: A color system is a way to notate and manage color more precisely and efficiently. Set up the frame of objective notation and measurement first.
- **For UI**
  - Record and check colors by **token name and measured value** (contrast ratio, composited color), not by impression.
  - Turn requests like "a bit darker" into a step change in the token.

## Review questions (per screen)

1. Does the hierarchy read in grayscale? (lightness → §5)
2. Are accents only on small areas, with large areas neutral? (§3 · §6)
3. Can you name the role of each color? Is any color used with two meanings? (§4 · §7)
4. Did you measure composited contrast on the real background, including selected, hover and dialog? (§1 · §8)
5. Do states stay distinguishable by words or shape with color removed? (§5)

## Not covered by the video

These are not in the video. Use WCAG (4.5:1 for text, 3:1 for non-text) and real measurement:

- Accessibility contrast thresholds
- Dark mode
- Color-vision deficiency
- Display brightness

Pigment properties (transparency, lightfastness) [03:01] and Goethe's hue shift as contrast fades [14:34–14:49] belong to painting and image grading, so they were not turned into UI rules.

## Books the video introduces

| Book (Korean edition title) | Character |
|---|---|
| 색채의 비밀 | Introductory: light and the eye, pigments, the three attributes, contrast and harmony, planning a palette |
| 색채의 이해 | Professional: color systems, measurement, color science, marketing, color psychology |
| Color of Art (컬러 오브 아트) | Meaning of color in art history; color splits of paintings |
| 비전 (Vision) | How image elements steer emotion |
| Color and Light (two books) | Connects theory to practice |
| Goethe, *Theory of Colours*; Wittgenstein, *Remarks on Colour* | Advanced |
