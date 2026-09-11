# Live Epidemiological Pipeline: Rollout Runbook & Verification Checklist

This runbook defines the standard operating procedures, automated gates, manual verification checklist, and emergency rollback operations for the 2026 Bundibugyo Ebola live surveillance pipeline (DATA-010).

---

## 1. Operational Architecture & Integrity Model

The surveillance pipeline enforces strict epidemiological boundaries:

1. **Surveillance Precision Hierarchy:** `country -> province -> health zone`. City-level precision is strictly forbidden by public health surveillance standards.
2. **Medical Evacuation Isolation:** International medical evacuations (e.g. patients evacuated to France or Germany) are quarantined and never summed into endemic outbreak totals.
3. **Reconciliation & Precedence:** DRC Ministry / INSP Situation Reports have priority over third-party aggregators. Sum of province totals must match national confirmed figures; sum of health zones within a province cannot exceed the province total (unallocated observations are created for the delta).
4. **Truthful Freshness:** HTTP 200 connectivity does NOT constitute data freshness. Public freshness is strictly derived from the authority's reported cutoff date.

---

## 2. Pre-Flight Verification Checklist

Before deploying any new pipeline release or applying manual data modifications, complete all verification steps:

- [ ] **Step 1: Automated Formatting, Linting, and Type Checking**

  ```bash
  ./node_modules/.bin/vp check
  ```

  _Pass criteria:_ 0 errors, 0 warnings across all project files.

- [ ] **Step 2: Full Test Suite Execution**

  ```bash
  ./node_modules/.bin/vp test --run
  ```

  _Pass criteria:_ All test suites pass (100% test success rate across contracts, adapters, parsers, crosswalk, rollback, and operational coverage).

- [ ] **Step 3: Ingestion Dry-Run Verification**

  ```bash
  node scripts/sync-data.js --dry-run
  ```

  _Pass criteria:_ Logs structured operational entry (`[SOURCE-RUN] ... parse=valid validation=valid freshness=current`), computes candidate snapshot without mutating disk files, and exits code 0.

- [ ] **Step 4: Authoritative Comparison**
      Compare dry-run candidate metrics against authoritative sources:
  - **DRC Ministry / INSP SitRep #118 (2026-09-09):**
    - Cumulative confirmed cases: `6,942`
    - Cumulative confirmed deaths: `3,349`
    - New confirmed cases: `99`
    - CFR: `48.2%`
  - **Provinces:**
    - Ituri: `5,542` cases, `2,511` deaths
    - North Kivu (Nord-Kivu): `1,109` cases, `718` deaths
    - Haut-Uélé: `260` cases, `107` deaths
    - Tshopo: `24` cases, `9` deaths
    - Bas-Uélé: `4` cases, `3` deaths
    - South Kivu (Sud-Kivu): `3` cases, `1` death
  - **Cross-Border Monitoring:**
    - Uganda (Bundibugyo): `4` cases, `2` deaths (status: `Contained / Outbreak Over`)

- [ ] **Step 5: Static Production Build Verification**
  ```bash
  ./node_modules/.bin/vp run build:pages
  ```
  _Pass criteria:_ Prerender succeeds, generating `dist/index.html` with server-side rendered SVG charts, accurate metadata, and freshness indicators.

---

## 3. Deployment Flow (GitHub Actions)

Deployments are governed by `.github/workflows/deploy.yml`:

1. **Schedule Trigger:** Cron `*/30 * * * *` (checks every 30 minutes).
2. **Execution Steps:**
   - Runs `node scripts/sync-data.js --dry-run` to verify upstream availability.
   - Runs `node scripts/sync-data.js` to execute atomic ingestion.
   - If content genuinely changed, commits updated snapshot to `master`.
   - Runs `./node_modules/.bin/vp check`.
   - Runs `./node_modules/.bin/vp test --run` (deployment gate).
   - Runs `./node_modules/.bin/vp run build:pages`.
   - Deploys static bundle to GitHub Pages.

---

## 4. Emergency Rollback Procedures

If an upstream source published invalid or corrupt data that bypassed checks, or if a manual revert is necessary, follow these steps:

### Rollback Execution

1. List available snapshots in the snapshot store:
   ```bash
   ls -lt public/data/snapshots/
   ```
2. Execute the atomic rollback script:
   ```bash
   node scripts/rollback-snapshot.js <target-snapshot-id>
   ```
   _Example:_
   ```bash
   node scripts/rollback-snapshot.js snapshot-2026-09-09-1789129949265
   ```
3. The rollback script automatically:
   - Verifies the integrity of the target snapshot.
   - Atomically updates `public/data/latest-snapshot.json`.
   - Updates `public/data/manifest.json` with a new content hash and timestamp.
   - Regenerates `src/data/outbreak-data.js` for SSR build parity.
   - Re-runs `./node_modules/.bin/vp check` and `./node_modules/.bin/vp test --run`.

### Cache Busting & Client Propagation

- The client background poller (`src/pipeline/static-client-refresh.js`) checks `manifest.json` every 5 minutes.
- Because `manifest.json` contains the updated content hash, connected clients will detect the snapshot swap and hot-swap their state without requiring a full page reload or altering map zoom/layers.

---

## 5. Observability, Logging, and Incident Classification

The pipeline logs all source interactions in standardized format:

```text
[SOURCE-RUN] <iso-timestamp> source=<id> transport=<reachable|unreachable> http=<status> parse=<valid|invalid> validation=<valid|conflict|blocking> freshness=<current|partial|stale|failed> duration=<ms> reportingDate=<iso-date>
```

### Failure Stage Classification

| Failure Stage             | Log Indicator                         | Root Cause                                               | Action Required                                                      |
| ------------------------- | ------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| **Transport Outage**      | `transport=unreachable` or `http=5xx` | Ministry portal or HDX server unreachable / DNS timeout  | No data publication. If >= 3 consecutive runs, alert infra team.     |
| **Format / Schema Drift** | `parse=invalid`                       | Source table layout, headers, or language format altered | Pipeline fails closed. Immediate parser fixture update required.     |
| **Integrity Breach**      | `validation=blocking`                 | Sum of provinces != national total, or negative counts   | Pipeline fails closed. Investigate source report for clerical error. |
| **Stale Data**            | `freshness=stale`                     | Reporting cutoff date exceeds 7 days without update      | Pipeline logs warning. Freshness pill displays "Stale Fallback".     |
