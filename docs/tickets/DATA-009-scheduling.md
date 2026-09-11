# DATA-009: Schedule safe 30-minute ingestion

Status: Blocked  
Priority: Medium  
Dependencies: DATA-006, DATA-007

## Objective

Check sources every 30 minutes without overlapping runs, timestamp-only commits, or invalid publication.

The scheduler runs in GitHub Actions and publishes a GitHub Pages artifact. GitHub's cron is best-effort, so the application must not promise an exact 30-minute execution time.

## Scope

- Update scheduled ingestion to a 30-minute cadence.
- Add concurrency protection and bounded execution time.
- Compare normalized content and provenance before publication.
- Align package-manager and Vite+ commands with repository requirements.
- Record successful, unchanged, partial, stale, and failed outcomes.

## Non-goals

- Claiming publishers update every 30 minutes.
- Deploying when only `fetchedAt` changed.
- Publishing a snapshot that failed reconciliation.

## Deliverables

- Scheduler and concurrency configuration.
- Content-based change detection.
- Atomic publish/rollback flow.
- Operational run summary and retention policy.

## Acceptance criteria

- Checks start twice per hour.
- A second run cannot overlap an active run.
- Unchanged data creates no snapshot commit or deployment.
- Failed ingestion leaves public data unchanged and records the error.
- Manual and scheduled execution use the same path.
- Workflow toolchain versions match repository constraints.

## Verification

Exercise changed, unchanged, overlap, timeout, validation failure, and rollback scenarios. Validate workflow syntax and the production build.
