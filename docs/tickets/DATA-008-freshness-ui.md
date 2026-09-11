# DATA-008: Present truthful freshness and provenance

Status: Blocked  
Priority: High  
Dependencies: DATA-007

## Objective

Show when source data applies, when it was checked, and whether it is current, partial, stale, or failed without changing the established design.

## Scope

- Expose source reporting date, snapshot publication date, and the scheduled check cadence.
- Add one compact treatment using existing typography, colors, spacing, and responsive patterns.
- Provide accessible status descriptions and source provenance.
- Show section-specific dates when geographic levels differ.

## Non-goals

- Restyling existing cards, panels, maps, charts, or dialogs.
- Calling `fetchedAt` the source update time.
- Hiding partial or stale status behind a generic live label.

## Deliverables

- Freshness view model.
- Compact timestamp/status presentation.
- Accessible labels and provenance access.
- Desktop and mobile visual-regression baselines.

## Acceptance criteria

- “Updated” refers to the authority's reporting date.
- Operational checks that did not deploy remain in Actions logs and are not claimed by the static page.
- Failed checks never produce a live/current label.
- Mixed-date sections expose their actual dates.
- Existing desktop and mobile layouts remain usable.
- Visual review confirms no unrelated design change.

## Verification

Run rendering, accessibility, visual-regression, `vp check`, and `vp test --run` checks.
