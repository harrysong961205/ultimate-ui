# Screen contracts — planning, presentation and review in one file

Tokens only guard **values**. What a screen shows first and what it folds away has to come from the plan. When the plan lives only in an agent's head, neither the build nor the review can be held to it. A screen contract writes the plan down so building and reviewing read the same standard.

```
who · in what situation
  → what they need to find out or decide   (questions, ranked)
  → the information that answers it         (information: which question · source · state axes · disclosure)
  → emphasis rules and why                  (rules: "A before B", "C visible before deciding", "in this state, D")
  → known failure examples                  (rules[].failures)
  → states × viewports that must be captured (evidence.required)
```

## When to write one

- **Write one** for a new screen or an information-structure change.
- **Skip it** for small fixes.
- **Don't ask for separate approval of the contract.** Record in `approval` the user's own words that set the purpose, or a reference to where they are recorded when the words are sensitive. If the purpose is not in their words, ask that one question.
- **Generalize late.** Start with one screen at a time. Only promote rules that keep holding across several contracts into shared patterns.

## Format — `docs/screen-contracts/<id>.json`

| Field | Meaning | Required by the checker |
|---|---|---|
| `id`, `route`, `title` | The screen | id, route |
| `approval` | Who decided the purpose, and when (their words — or, for a public repo, a reference to where they are recorded, e.g. an issue link, instead of sensitive text) | yes |
| `audience.who`, `situation[]`, `notFor[]` | Who looks, when they open it, what this screen is not | who, situation |
| `questions[]` `{id: Qn, rank, text}` | What the screen answers. Rank is the root of emphasis | ≥1, ranks unique |
| `nextActions[]`, `success[]` | Next actions, how we know it works | success |
| `information[]` `{id, label, answers[], source, axes?, disclosure}` | What to show. `answers` is *why* it is shown. `disclosure`: `initial` / `secondary` / `detail` | every item answers a real question |
| `information[].axes` | State axes that must not be mixed (owner, certainty, applied, time…) | free form |
| `rules[]` `{id: Rn, kind, text, why, about[], failures[], evidenceStates[], checks?[]}` | Emphasis and presentation rules. kind: `order`, `distinct`, `state`, `reachable`, `visible`, `vocabulary`, `scale` | text, why, about, failures; evidenceStates ⊆ required states |
| `rules[].checks[]` | Names of behaviour checks that prove the rule (`evidence.check(name, …)`) | must have passed for a `pass` verdict |
| `evidence.required[]` `{state, viewport, shows}` | States (screenshot names) and real viewport sizes that must be captured | ≥1 |
| `sources[]` | Source files of this screen. If they change after the last accepted review, the screen needs review again | ≥1, files exist |
| `knownGapRules[]` | Rules the current screen is known to break. Only these may be judged `known-gap` | real rules; growing needs changeLog |
| `knownGaps[]` | Notes on where the screen breaks the contract | — |
| `changeLog[]` `{at, items[], reason, userText}` | Approved removals of rules or states, new allowed gaps, or a changed rule meaning. `userText` is the user's words or a reference to them. Only entries added after the last accepted review count | needed to go below the floor |

A starting template is in `templates/screen-contract.json`.

### Write emphasis as relations, not levels

Importance, certainty, urgency and selection are different axes. "Important, so bigger, bolder, redder" makes a guess look like a fact.

| Role | Position and size | Color and disclosure |
|---|---|---|
| The current key judgment | Ahead of the main reading area, existing heading token | With the evidence needed to judge it |
| Constraints and unknowns that change the judgment | Right next to that judgment or action | Never folded. Semantic state color *and* words |
| Supporting context, comparisons | After the key part, body hierarchy | Aligned for comparison, repeated metadata reduced |
| History, full originals | Detail or expanded view | Readable even at low emphasis |

Examples of good rules:
- **order**: "The rules actually applied are shown before the relationship map and history." Why: the runtime decides with those, not with the map.
- **state**: "A failed query says failed, not empty. A failed refresh keeps the previous content." Why: an empty-looking failure makes the operator conclude there is nothing.
- **reachable**: "From a selected item, the original evidence is one step away — on mobile too."
- **vocabulary**: "No internal code names in user-facing text."
- **scale**: "At 5,000 objects the first screen still answers Q1–Q3. Search and lists are the default and the map is secondary."

## What the checker enforces

- `npx uui contract [id]`:
  - The contract format.
  - The approved **floor** from the ledger. Rules, the states each rule is judged on and required states cannot shrink, and allowed gaps cannot grow, unless a `changeLog` entry added since the last accepted review carries the user's decision and a reason. The meaning of each approved rule (text, why, kind, checks, and the label and source of the information it is about) is part of the floor too.
- `npx uui review <dir>`. A run is incomplete when any of these hold:
  - A required state × viewport was not captured on the contract's route.
  - A rule has no `pass` verdict with an observation and evidence, or is `known-gap` without being in `knownGapRules`.
  - A rule's evidence does not include a screenshot of each of its `evidenceStates`.
  - A check named in `rules[].checks` did not pass.
  - The contract changed after capture, or a screenshot changed after capture.
  - The image size does not match the recorded viewport, or a file fails the PNG structure check (chunks, CRCs, row filters and pixel-data length — pixels are not inspected).
  - One image stands in for two required states.
  - A verdict exists for a rule that is not in the contract.
- `npx uui review <dir> --accept` (after a complete review) records the floor and the digest of the screen sources in the ledger.

## Known limits

- **Coordinated forgery is not caught.** Someone who rewrites images, `evidence.json` and `review.json` together gets through. Keep evidence in CI for that.
- **The ledger is editable.** Treat ledger edits like debt-list edits: report them.
- **Shared files are not tracked.** Changes outside `sources` (for example a shared stylesheet) do not trigger a contract review.
- **State names are assigned by the capturing code.** Whether a state really is that situation is for the behaviour checks and the reviewer to confirm.

Three things stay judgment: whether the questions are the right ones, whether the evidence is enough to decide, and whether the intended thing really draws the eye first. A contract reduces omission and drift. It cannot tell you the plan is wrong.
