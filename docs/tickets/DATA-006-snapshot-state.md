# DATA-006: Replace mutable hardcoded outbreak state

Status: Complete  
Priority: High  
Dependencies: DATA-004, DATA-005

## Objective

Replace `liveOutbreakState` and manually authored epidemiological truth with atomic validated snapshots.

## Scope

- Build snapshots only from validated normalized observations.
- Store snapshot version, provenance, conflicts, and freshness.
- Retain the last-known-good snapshot for stale fallback.
- Write snapshots atomically and prevent partial replacement.
- Separate operational run logs from publishable data.

## Deliverables

- Snapshot builder and loader.
- Atomic write/replace mechanism.
- Last-known-good and stale-state behavior.
- Removal of `liveOutbreakState` and timestamp-only mutation.

## Acceptance criteria

- Every aggregate links to the observations and sources used to derive it.
- Interrupted writes cannot create a partial public snapshot.
- Failed validation leaves the last-known-good snapshot unchanged.
- No-data startup returns an explicit failure instead of fabricated values.
- An unchanged run creates no publishable snapshot difference.

## Verification

Test successful, unchanged, partial, stale, corrupt-write, and no-snapshot scenarios. Run `vp check` and `vp test --run`.
