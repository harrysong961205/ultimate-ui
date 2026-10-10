# Review loop — after the build, before "done"

Feature-complete and screen-quality are verified separately. The scripts collect evidence and check that it is complete. They do not judge aesthetics. The agent judges.

## Steps

1. **Plan the coverage.** Write down the changed routes, the user's next action, and the states and viewports to check. Add fixtures for them. Every API is answered by a fixture and external traffic is blocked. No product data writes, no model calls.
2. **Collect.** Build separately from what is being served. Run your Playwright fixture script with `lib/evidence.mjs`:
   - `ev.shot(page, state)` saves a viewport and a full-page PNG with their route, viewport and hash, and runs the render audit.
   - `ev.check(name, fn)` records behaviour checks (keyboard, dialogs, errors).
   - `ev.finish()` writes `evidence.json` and `render-audit.json`.
3. **Look.** Open the images with an image tool. Check at least desktop and a 390px mobile; add 320px for anything width-sensitive. Look beyond the first screen: open documents and menus, error, loading and empty states. Compare the full-page image with the real viewport for fixed headers, inputs and primary actions.
4. **Write `review.json`.**
   ```json
   {
     "reviewer": "…",
     "task": "the user's task",
     "criteria": {
       "hierarchy": { "verdict": "pass", "observation": "…", "evidence": ["screenshots/orders-1440.png"] },
       "keyboard": { "verdict": "unverified", "observation": "no real interaction check yet" }
     },
     "contractRules": { "R1": { "verdict": "pass", "observation": "…", "evidence": ["screenshots/orders-1440.png", "check name"] } },
     "findings": [{ "severity": "major", "problem": "…", "fix": "…", "status": "open" }],
     "iterations": [{ "run": "previous dir", "found": "…", "change": "…" }]
   }
   ```
   Observations name positions, overlaps, spacing, wording and behaviour. Never "clean", "best" or a score.
   All eight criteria below are required. Each needs `pass` with an observation and evidence. Only `keyboard` and `motion` may be `unverified` with an observation, because a screenshot cannot prove them. Anything else keeps the review incomplete.
5. **Fix and repeat.** Fix important findings and collect again from the final source. Record the previous run in `iterations`.
6. **Check.** `npx uui review <dir>`. Failed checks, unjudged rules, changed images and open major findings mean not done. "Passed" means the recorded review is complete. It is not a usability study.

## Criteria

| Key | Question |
| --- | --- |
| hierarchy | Does the first look go to the user's current task and main action? Are results distinct from chatter? |
| density | Do repeated metadata, logs or big gaps push the content away? Is width given to what is read? |
| readability | Are long texts, titles, tables, code and sources readable? Is the type hierarchy clear and the contrast measured? |
| actions | Can the main action be found and its result predicted? Do open, copy, edit, approve and close connect? |
| states | Are loading, failure, empty, in-progress, submitted and approved distinguishable? Are old and current versions never confused? |
| keyboard | Tab order, visible focus, dialog containment, Escape and focus return, IME input. |
| responsive | No horizontal overflow, covering or excessive shrinking on desktop and mobile. Input and close are checked in the real viewport. |
| motion | Do send, reply and document transitions keep the reading position? Is reduced motion respected? |

A static screenshot does not prove motion or keyboard behaviour. Link a real interaction check for those.

## When the browser is blocked

- Keep the logs and mark visual review as unverified.
- Continue with source review and whatever behaviour checks are possible, but never turn `pending` into `pass`.
- Don't retry the same environment error forever.
- Report "deployed" and "visually reviewed" separately.
