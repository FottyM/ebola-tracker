# DATA-014: Implement snapshot retention and rollback

Status: Open  
Priority: High  
Dependencies: DATA-006, DATA-009, DATA-013

## Objective

Ensure a bad source update, parser regression, or failed Pages build cannot replace or destroy the last-known-good deployment.

## Scope

- Retain content-addressed validated snapshots and their provenance.
- Update the manifest pointer atomically with a new snapshot.
- Gate Pages deployment on ingestion, validation, tests, and build success.
- Document rollback to a named prior manifest/snapshot pair.
- Define a minimum retention policy before any pruning is allowed.

## Non-goals

- Retaining failed or unvalidated snapshots as public candidates.
- Deleting historical snapshots without an approved retention threshold.
- Using hardcoded baseline data as rollback.

## Deliverables

- Retention policy and artifact layout.
- Deployment gating and rollback command/runbook.
- Last-known-good identification and validation.
- Failure and rollback tests.

## Acceptance criteria

- Failed ingestion, validation, tests, or build cannot invoke Pages deployment.
- The prior Pages deployment remains live after every simulated failure.
- Rollback selects an immutable snapshot with intact provenance.
- Manifest and snapshot cannot become mismatched.
- The only last-known-good snapshot cannot be pruned.

## Verification

Simulate bad source data, parser failure, build failure, corrupt manifest, and rollback. Confirm the prior deployment remains selectable and run the production checks.
