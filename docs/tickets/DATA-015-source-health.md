# DATA-015: Separate source health from epidemiological freshness

Status: Complete  
Priority: Medium  
Dependencies: DATA-003, DATA-004, DATA-009

## Objective

Prevent network connectivity or HTTP 200 responses from being presented as proof that epidemiological data is current.

## Scope

- Record transport, parsing, validation, and freshness as separate states.
- Log source URL, response status, duration, content identity, reporting date, and validation result.
- Derive public freshness only from validated source reporting dates.
- Keep unchanged operational checks in Actions logs when no Pages deployment occurs.
- Define alert thresholds for repeated transport, parsing, and blocking-validation failures.

## Required states

```text
transportStatus: reachable | unreachable
parseStatus: valid | invalid
validationStatus: valid | conflict | blocking
freshnessStatus: current | partial | stale
```

## Non-goals

- Displaying `Live (200 OK)` as a data-quality status.
- Publishing timestamp-only deployments to advertise checks.
- Claiming the static site observed an operational check that was never deployed.

## Deliverables

- Structured source-run result and logging schema.
- Public freshness derivation function.
- Failure thresholds and notification documentation.
- Tests covering every state combination used by the pipeline.

## Acceptance criteria

- HTTP success alone cannot yield `current`.
- Parsing or validation failure preserves the previous validated snapshot.
- Public timestamps distinguish source reporting from snapshot publication.
- An unchanged check produces operational evidence without a data commit/deployment.
- Repeated failures are identifiable by source and failure stage.

## Verification

Test reachable-invalid, unreachable, valid-stale, valid-partial, unchanged, and fully current scenarios. Run `vp check` and `vp test --run`.
