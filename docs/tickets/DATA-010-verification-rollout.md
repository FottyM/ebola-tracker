# DATA-010: Add integrity tests, observability, and rollout checks

Status: Blocked  
Priority: High  
Dependencies: DATA-004 through DATA-009, DATA-011 through DATA-015

## Objective

Prevent silent source drift and prove that published data, delivery paths, and the preserved UI remain correct.

## Scope

- Replace literal-value smoke tests with fixture-derived assertions.
- Test schema changes, reconciliation, duplicates, corrections, and outages.
- Test API/static parity and freshness presentation.
- Add structured ingestion logs and actionable failure reporting.
- Define staged verification and rollback procedures.

## Non-goals

- Using live network tests as a substitute for deterministic fixtures.
- Suppressing upstream conflicts to keep deployment green.
- Approving rollout only because the application renders.

## Deliverables

- Parser, schema, reconciliation, and failure-mode suites.
- API/static parity and UI-regression coverage.
- Structured logs with source versions and validation results.
- Manual verification checklist and rollback runbook.

## Acceptance criteria

- Tests prove values derive from source fixtures rather than hardcoded totals.
- Source schema changes cannot silently publish incorrect data.
- CI validates formatting, linting, types, tests, ingestion dry run, and build.
- Generated values are compared with authoritative reports before rollout.
- Rollback restores the previous validated snapshot without altering the UI.
- Monitoring distinguishes source outages from application failures.

## Verification

Run `vp check`, `vp test --run`, the production build, an ingestion dry run, authoritative comparison, and desktop/mobile visual regression.
