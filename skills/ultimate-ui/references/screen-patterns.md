# Screen patterns — choose by task

These are composition decisions, not components. Reuse your project's components and CSS roles. A new reusable composition should earn its place through actual repeated use.

| User task | Composition | Initial content | Avoid |
| --- | --- | --- | --- |
| Answer or review what is waiting on me | Decision queue | Open items, the decision required, the constraint that affects it, state, next action | Completed items competing with pending decisions; arbitrary urgency |
| Find an object or record | Searchable row list | Title, comparable metadata, state, search and filters | A card wall for long text; detail pasted into every row |
| Judge one object | Object detail | Goal, completion conditions, current decision, essential evidence | Asking for approval before enough context; evidence disconnected from the claim |
| Ask or unblock someone (human or agent) | Conversation | Who and in what context, a readable thread, input, the real processing state | A second global navigation column; invented "live" activity |
| Understand a person or agent | Task-focused overview | Identity plus the pending action or current work that matters now | Treating biography, history, idle state and my waiting decisions as equal |
| Inspect what something bases its decisions on | Basis → to-check → searchable knowledge, map as a secondary tab | Scope first, the rules actually applied, what needs checking with the answer action beside it | A graph as the default view; guesses shown with the same weight as facts |

An overview may hold several actions. Make their relationship clear rather than forcing one primary button onto every page. Row lists can repeat a row action without making every action a filled primary button.

## Reading order is the plan

When the viewer has items waiting on them, lead with that queue. Current work and "start a conversation" support it. When nothing waits on the viewer, bring real current work forward instead. Profile, goals and statistics are supporting content unless they are the current task.

A displayed total is not a pending count. Work out open and completed semantics from the real data. A row that shows a "close" control is not necessarily complete. Never promote a visible total into "N waiting".

Give one dominant readable list and secondary context where it helps. Mobile follows the same semantic order. Equal columns suit genuine comparisons and are not a default. Do not stretch a one-line idle section to match the height of a long neighbour.

## Summary and evidence

**Collapsed row:**
- A concise title and an explicit state.
- Owner and date when they exist.
- A short reason when it affects the choice.
- A descriptive action ("Review question", "Open order") that maps to an operation the system really supports. Do not invent answer buttons when the API only supports opening the detail.

**Expanded or detail view:**
- The full wording, with any agent memo clearly labelled.
- The exact original request and a link to its source.
- The available action and its result or error.

Disclosure is predictable: a labelled toggle or a detail link. Expanded content is keyboard reachable and survives a background refresh where it should.

**Decision-critical facts sit beside the decision.** Money, units, tax, scope, responsibility, uncertainty and irreversible consequences go next to the decision they affect, never in a tooltip. A summary may shorten prose. It must not quietly resolve "120 or 1,200 (unit unknown)" into one number. Keep the full source and where it came from.

"Preserve evidence" means the full evidence is reachable before deciding. It does not mean pasting the whole original into every collapsed row.

## Cases to render before calling it done

Use isolated fixtures: every API call is mocked and external traffic is blocked.

- **Long text:** long titles and body text in your users' language (including CJK if relevant), amounts with unresolved units, repeated source requests.
- **Mixed data:** open and completed items, a pending count that differs from the total, no due date, a missing source.
- **States:** loading, initial failure, a failed refresh that keeps the previous content, real empty data, and large data that has to be truncated.
- **Viewports and interaction:** desktop and narrow mobile (390/320px), expanded evidence, keyboard entry and exit, the real row action and its error feedback.

Source inspection can explain likely defects. It cannot certify the layout. Rendered review is not user testing, so do not claim faster completion or better understanding from screenshots.
