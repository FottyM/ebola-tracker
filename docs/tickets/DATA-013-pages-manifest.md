# DATA-013: Implement the GitHub Pages manifest and cache protocol

Status: Blocked  
Priority: High  
Dependencies: DATA-002, DATA-006

## Objective

Define and implement the static delivery protocol that lets an open GitHub Pages session discover validated data deployments without a runtime API.

## Scope

- Generate content-addressed immutable snapshot URLs.
- Generate a small mutable `data/manifest.json` pointing to the current snapshot.
- Resolve URLs through `import.meta.env.BASE_URL` for `/ebola-tracker/` production and `/` development.
- Fetch the manifest with cache bypass and poll every 30 minutes plus on visibility restoration.
- Download snapshots only when the manifest snapshot ID changes.
- Reject incompatible schema versions and malformed snapshots.

## Non-goals

- Creating a production `/api/ebola-data` endpoint.
- Redownloading unchanged snapshots on every poll.
- Replacing the current validated view when refresh fails.

## Deliverables

- Manifest schema and generator.
- Base-path-aware manifest/snapshot URL resolver.
- Browser polling and visibility-refresh controller.
- Cache and failure-behavior tests.

## Acceptance criteria

- The built Pages artifact contains the manifest and referenced snapshot.
- All production data URLs work under `/ebola-tracker/`.
- A changed manifest updates data without a full-page reload.
- An unchanged manifest causes no snapshot download.
- A failed or invalid refresh keeps the existing validated snapshot.
- Prerendered and hydrated views use the same snapshot ID.

## Verification

Test root and repository base paths, cached and changed manifests, offline refresh, schema mismatch, visibility restoration, production build, `vp check`, and `vp test --run`.
