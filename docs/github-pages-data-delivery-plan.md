# GitHub Pages Data Delivery Plan

Status: Draft for review  
Production host: GitHub Pages  
Architecture: Validated static JSON, built and deployed by GitHub Actions

## Locked production decision

GitHub Pages remains the production host. Production does not depend on `server.js`, Hono routes, a Cloudflare Worker, or any other continuously running backend.

```text
GitHub Actions scheduled check
             |
             v
   source adapters and validation
             |
             v
     immutable snapshot JSON
             |
             v
      small manifest JSON
             |
             v
       Vite+ Pages build
             |
             v
   GitHub Pages deployment artifact
             |
             v
 browser checks manifest and loads snapshot
```

Each step below has an exit gate. Do not start the next step until the current gate passes.

## Step 1: Lock the Pages URL and base-path contract

### Work

- Define the production origin and repository base path as configuration.
- Require all generated asset, manifest, snapshot, and source-provenance links to respect the base path.
- Keep local development at `/` while production resolves under `/ebola-tracker/`.

### Exit gate

- A production build contains no accidental root-relative data URL such as `/data/outbreak.json`.
- The built application works when served from `/ebola-tracker/`.
- Direct navigation and refresh do not break asset or data loading.

## Step 2: Define the immutable snapshot artifact

### Work

Generate one content-addressed file per validated publication:

```text
data/snapshots/<snapshot-id>.json
```

The snapshot contains normalized observations, derived views, provenance, section-specific reporting dates, conflicts, and freshness status. `snapshot-id` is derived from normalized epidemiological content and source provenance, excluding volatile check times.

### Exit gate

- Identical validated source content produces the same snapshot ID and byte-equivalent epidemiological payload.
- Every displayed value can be traced to source records inside the snapshot.
- No manually authored epidemiological baseline is required.

## Step 3: Define the mutable manifest artifact

### Work

Generate:

```text
data/manifest.json
```

The manifest is small and contains:

```text
schemaVersion
snapshotId
snapshotUrl
sourceUpdatedAt
snapshotPublishedAt
scheduledCadenceMinutes
status
```

The manifest points to an immutable snapshot. It never points to an artifact that failed validation.

### Exit gate

- The manifest schema validates independently.
- `snapshotUrl` resolves under both local and Pages base paths.
- `sourceUpdatedAt` is not replaced with a build, fetch, or deployment timestamp.

## Step 4: Build the ingestion command as a standalone transaction

### Work

Create one command used by local execution and GitHub Actions:

```text
discover -> fetch -> parse -> normalize -> reconcile -> validate -> stage artifacts
```

Only after every blocking validation passes may the command atomically promote the staged snapshot and manifest.

### Exit gate

- Successful, unchanged, partial, stale, and failed scenarios have deterministic exit/results.
- An interrupted or failed run cannot modify publishable artifacts.
- Re-running unchanged sources does not generate a new snapshot ID.

## Step 5: Make Vite+ build consume generated data

### Work

- Copy or emit the validated manifest and referenced snapshot into the Pages build output.
- Make server-side prerendering use the same snapshot referenced by the manifest.
- Remove the hardcoded outbreak module as the production data source.

### Exit gate

- Prerendered totals equal the snapshot totals.
- The manifest and snapshot exist in the final Pages artifact.
- Static and hydrated rendering use the same snapshot ID.
- Existing HTML and CSS structure remains unchanged.

## Step 6: Add the browser manifest loader

### Work

- On startup, read the embedded snapshot for immediate rendering.
- Fetch the same-origin manifest using the configured base path.
- If it references a newer validated snapshot, fetch that immutable file and update existing map/chart/component state.
- Reject incompatible schema versions or malformed snapshots.

### Exit gate

- The application starts without waiting for the network.
- A newer snapshot updates data without reloading the page.
- A failed manifest or snapshot request leaves the current validated view intact and marks it stale when possible.
- No layout, component, map, chart, or modal redesign occurs.

## Step 7: Add cache-safe refresh behavior

### Work

- Poll the manifest every 30 minutes while the page is open.
- Use a cache-busting query based on the check time for the small mutable manifest.
- Use long-lived immutable caching for content-addressed snapshots.
- Pause or reduce polling while the document is hidden, then check immediately when it becomes visible.

### Exit gate

- A changed deployment is detected without a full page reload.
- Repeated polling does not redownload an unchanged snapshot.
- CDN/browser caching cannot indefinitely pin an old manifest.
- Polling failures do not erase displayed data.

## Step 8: Make local development match Pages

### Work

- Serve the generated manifest and snapshot through Vite development middleware.
- If `/api/ebola-data` is retained, make it a local compatibility route backed by the same snapshot loader.
- Do not make application code depend on the local API for production behavior.

### Exit gate

- Local static JSON and the optional local API return the same snapshot ID and schema.
- Development exercises the same base-path-aware loader used in production.
- `/api/ebola-data` is not referenced by the production Pages client.

## Step 9: Build the scheduled GitHub Actions workflow

### Work

- Schedule best-effort checks twice per hour.
- Use the repository's required package-manager and Vite+ versions.
- Prevent overlapping ingestion/deployment runs.
- Run the standalone ingestion transaction, checks, tests, and production build.
- Upload the complete Pages artifact only after validation succeeds.

### Exit gate

- Manual and scheduled workflow dispatches execute the same command path.
- A failed check or build leaves the previous Pages deployment live.
- An unchanged result does not create a source-data commit.
- The workflow clearly reports whether the outcome was changed, unchanged, partial, stale, or failed.

## Step 10: Decide publication behavior for unchanged checks

### Work

Use this policy:

- Do not rebuild or deploy merely to advance an operational check timestamp.
- Preserve the last deployed source reporting date and snapshot.
- Record operational check history in GitHub Actions logs.
- Deploy only when epidemiological content, provenance, meaningful status, or a source correction changes.

### Exit gate

- No timestamp-only commits or deployments occur.
- The UI does not claim a check occurred more recently than the deployed manifest proves.
- Operational logs retain check evidence without pretending it is source freshness.

## Step 11: Add failure, rollback, and retention behavior

### Work

- Treat the current successful Pages deployment as the last-known-good release.
- Retain enough immutable snapshots to investigate corrections and roll back.
- Prevent a failed workflow from replacing the Pages artifact.
- Document manual rollback to a prior validated snapshot/deployment.

### Exit gate

- Simulated source outage, malformed CSV, PDF drift, and failed build preserve the previous deployment.
- Rollback restores a named snapshot with intact provenance.
- No destructive cleanup can remove the only last-known-good snapshot.

## Step 12: Verify production end to end

### Work

Verify on the deployed Pages URL:

- correct base-path resolution;
- manifest and immutable snapshot retrieval;
- prerender/hydration agreement;
- 30-minute in-page polling;
- source timestamp and status presentation;
- stale behavior after simulated failures;
- desktop/mobile visual regression.

### Exit gate

- Displayed values match the validated source snapshot.
- The timestamp identifies the source reporting date.
- A new deployment becomes visible to an already-open page.
- Existing design and interactions remain intact.
- The previous deployment remains recoverable.

## Known GitHub Pages limitations

- Scheduled GitHub Actions runs may be delayed; twice-hourly cron is not an exact service-level guarantee.
- GitHub Pages cannot perform server-side freshness checks between deployments.
- A “last checked” timestamp can only reflect the last deployed manifest; operational checks that produce no deployment remain visible only in Actions logs.
- Pages/CDN caching requires a small cache-busted manifest plus immutable snapshot URLs.
- There is no production `/api/ebola-data` unless a separate runtime is deliberately introduced later.

## Completion condition

GitHub Pages delivery is complete when the deployed application obtains all epidemiological state from a validated, versioned static snapshot; detects newer deployments through the manifest; survives ingestion failures by retaining the previous deployment; and makes no runtime claim that requires a server GitHub Pages does not provide.
