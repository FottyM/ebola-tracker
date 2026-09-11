# DATA-003: Implement source precedence and reconciliation rules

Status: Open  
Priority: Blocker  
Dependencies: DATA-001, DATA-002

## Objective

Turn the approved extraction and reconciliation policy into deterministic validation code that fails closed on materially misleading data.

## Scope

- Implement [the reconciliation contract](../live-data-reconciliation-contract.md).
- Reconcile national totals with province totals.
- Represent province-to-zone differences as unallocated values.
- Preserve mixed reporting dates and corrections.
- Validate cross-country totals and imported/medevac classifications.

## Non-goals

- Forcing geographic levels to add up through invented allocations.
- Rejecting legitimate corrections only because cumulative values decreased.
- Combining country totals with different cutoffs into a synthetic global headline.

## Deliverables

- Pure reconciliation functions with structured results.
- Blocking and non-blocking conflict types.
- Correction records retaining previous and new provenance.
- Fixture tests based on consecutive Ministry reports.

## Acceptance criteria

- National cases, deaths, and new cases reconcile with province tables before publication.
- Province/zone gaps become explicit unallocated observations.
- Newer source corrections are retained and flagged rather than rewritten.
- Mixed-date data becomes `partial` with section-specific dates.
- Germany treatment records cannot increase affected-country or global-case totals.
- Blocking conflicts preserve the last-known-good snapshot.

## Verification

Test reports for 6-9 September, including unallocated deaths and the 9 September upstream conflict. Run `vp check` and `vp test --run`.
