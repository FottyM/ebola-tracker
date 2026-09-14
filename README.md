# 🦠 2026 Ebola Outbreak Live Tracker & Epidemiological Map

[![Deploy to GitHub Pages](https://github.com/FottyM/ebola-tracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/FottyM/ebola-tracker/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-fottym.github.io%2Febola--tracker-40c4aa?style=flat-square&logo=github)](https://fottym.github.io/ebola-tracker/)
[![Ingestion](https://img.shields.io/badge/Ingestion-Every%204%20Hours-33b5e5?style=flat-square&logo=githubactions&logoColor=white)](.github/workflows/deploy.yml)
[![Toolchain](https://img.shields.io/badge/Toolchain-Vite%2B-f76b15?style=flat-square)](https://viteplus.dev/)
[![Map](https://img.shields.io/badge/Map-OpenStreetMap-30a46c?style=flat-square&logo=openstreetmap)](https://www.openstreetmap.org/)
[![Charts](https://img.shields.io/badge/Charts-@tanstack/charts-e5484d?style=flat-square)](https://tanstack.com/)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg?style=flat-square)](LICENSE)

An operational-grade, real-time epidemiological surveillance map and situation dashboard tracking the **2026 Bundibugyo ebolavirus outbreak** across the Democratic Republic of the Congo (DRC), Uganda border districts, and international medical evacuation routes.

🔗 **Live Deployment:** [https://fottym.github.io/ebola-tracker/](https://fottym.github.io/ebola-tracker/)

---

## 📸 Screenshots

### Desktop Intelligence Dashboard

![Ebola Tracker Desktop View](docs/images/desktop-preview.png)

### Mobile Experience (Responsive Bottom Sheet)

<p align="center">
  <img src="docs/images/mobile-preview.png" width="340" alt="Ebola Tracker Mobile View" />
</p>

---

## 📱 Mobile-Friendly Design

The tracker is engineered to adapt smoothly to smartphones, tablets, and desktop displays:

- **Interactive Bottom Sheet:** On mobile devices (`< 768px`), the analytics panel shifts into a native-feeling bottom drawer that stays out of the way.
- **Tap-to-Collapse Handle:** Tap the grab bar at the top of the mobile sheet to collapse it into a slim bottom pill, giving you an unobstructed, full-screen view of the Central Africa map.
- **Touch-Optimized Map Navigation:** Full pinch-to-zoom, smooth pan gestures, and enlarged tap targets for markers and regional list items.
- **Responsive Dialogs:** Both the _Epidemic Timeline Modal_ and _Total Cases & Demographics Modal_ reflow into clean 2-column KPI grids with touch-friendly dismiss buttons.
- **Uncluttered Canvas:** Floating controls and legends are streamlined on mobile screens to preserve maximum map visibility.

---

## ✨ Key Capabilities

1. **100% Free OpenStreetMap Dark Basemap:**
   - Powered directly by public OpenStreetMap raster tiles with a GPU-accelerated CSS dark filter.
   - **Zero API keys required**, no third-party vendor lock-in, and zero watermarks.

2. **Layered GIS Administrative Boundaries:**
   - **Global Sovereign Nations:** All 258 world countries (`world-countries.json`) dynamically loaded to eliminate main thread blocking, with ISO3 matching and dynamic status styling.
   - **Sub-national Provincial Boundaries:** DRC 26 provinces (`drc-provinces.json`) code-split and asynchronously loaded, featuring caseload fill styling and hover telemetry.

3. **Dynamic Outbreak Telemetry & Medevac Corridors:**
   - Color-coded severity beacons with dynamic sizing based on caseload.
   - Active epicenter pulsing beacon over the primary transmission cluster (Bunia / Ituri).
   - Cross-border transport routes and long-distance biocontainment flight corridors (quarantining international medical evacuations in France and Germany from national DRC statistics).

4. **Official TanStack Charts Visualization:**
   - High-resolution **Epidemic Spread Curve** (weekly confirmed cases vs. fatalities).
   - **Age Cohort Distribution** bar chart highlighting vulnerable demographic groups.
   - Interactive crosshairs, tooltips, and deep-dive modals.

5. **Truthful Freshness & Provenance Telemetry:**
   - Real-time freshness status pill (**Current**, **Stale**, or **Degraded**).
   - Official Ministry reporting timestamp formatted in European notation (`DD/MM/YYYY HH:mm`).
   - Clean separation of source transport reachability from underlying epidemiological freshness.

---

## 🔄 Automated Data Ingestion & Snapshot Pipeline

The platform uses a scheduled, fail-closed automated ingestion pipeline running both locally and on GitHub Actions every 4 hours. It dynamically ingests official health bulletins, reconciles hierarchical boundaries, detects genuine epidemiological changes, and publishes versioned snapshots:

```mermaid
flowchart TD
    subgraph Trigger ["⏰ 1. Pipeline Triggers (Every 4 Hours)"]
        Cron["⏱️ GitHub Actions Cron<br/><b>Every 4 Hours</b><br/><code>0 */4 * * *</code>"]
        Dispatch["⚡ Manual Workflow Dispatch<br/>& Local Ingestion<br/><code>npm run sync</code> / <code>node scripts/sync-data.js</code>"]
    end

    subgraph DynamicIngestion ["📡 2. Live Network Ingestion (Zero Test Fixture Dependencies)"]
        FetchPortal["🌐 <b>DRC Ministry Portal Scraper</b><br/><code>https://sante.gouv.cd/documents/sitreps</code><br/>Discovers latest <code>SitRep_MVEBDB_*.pdf</code>"]
        ParsePDF["📄 <b>In-Memory PDF Parser</b> (<code>pdf-parse</code>)<br/>Extracts vector text in ~500ms<br/>Parses National totals & 6 Provinces"]
        FetchHDX["🇺🇳 <b>UN OCHA HDX Feed</b><br/><code>drc_ebola_cases_consolidated.csv</code><br/>43+ Health Zones, pcodes, time series"]
        Fallback["📁 <b>Offline Baseline Fallback</b><br/><code>server/pipeline/data/baseline-sitrep.txt</code><br/>(Used if remote endpoints time out)"]
    end

    subgraph ValidationEngine ["⚖️ 3. Boundary Crosswalk & Reconciliation"]
        Crosswalk["🗺️ <b>Health Zone Crosswalk</b><br/>Resolves pcodes, aliases & DHIS2 IDs"]
        Reconcile{"⚖️ <b>Hierarchical Check</b><br/>National >= Sum(Provinces)<br/>Provinces >= Sum(Health Zones)"}
        Candidate["📋 Candidate Snapshot Generated<br/>(In-Memory / Dry-Run Safe)"]
        Halt["🛑 Halt Run & Retain Last-Known-Good"]
    end

    subgraph StorageEngine ["📦 4. Atomic Snapshot Engine & Retention"]
        Diff{"🔍 Epidemiological<br/>Content Changed?"}
        Store["💾 Atomically Write New Snapshot<br/><code>public/data/snapshots/snapshot-*.json</code>"]
        Manifest["📑 Atomic Manifest & Hash Sync<br/><code>public/data/manifest.json</code>"]
        Retain["🛡️ Retention & Rollback Safety<br/>(Preserve Min 10 Snapshots)"]
        Noop["ℹ️ Unchanged: Retain Active Snapshot<br/>(Skip Git Commit & Mutation)"]
    end

    subgraph Delivery ["🚀 5. Production Edge Delivery & Local Dev"]
        SSGBuild["🌐 <b>GitHub Pages (Production Host)</b><br/>100% pure static edge hosting (0 backend servers)<br/>Pre-rendered HTML, SVG & Schema.org"]
        SSRServer["💻 <b>Local Dev Server (Hono + Vite)</b><br/><code>node server.js</code> (port 3000 / 3001)<br/>Emulates SSR & <code>/api/*</code> routes locally"]
    end

    Cron --> FetchPortal
    Dispatch --> FetchPortal
    FetchPortal -->|Live PDF stream| ParsePDF
    FetchPortal -.->|On HTTP Timeout/Error| Fallback
    ParsePDF --> Crosswalk
    Fallback --> Crosswalk
    FetchHDX --> Crosswalk
    Crosswalk --> Reconcile
    Reconcile -- "Valid & Reconciled" --> Candidate
    Reconcile -- "Discrepancy / Corrupted" --> Halt
    Candidate --> Diff
    Diff -- "Yes (New Cases / Deaths)" --> Store
    Diff -- "No (Timestamps Only)" --> Noop
    Store --> Manifest
    Manifest --> Retain
    Retain --> SSGBuild
    Retain -.->|Local dev inspection| SSRServer
    Noop --> SSGBuild

    classDef holoBlue fill:#081c2e,stroke:#33b5e5,stroke-width:2px,color:#ffffff;
    classDef holoDarkBlue fill:#051424,stroke:#0099cc,stroke-width:2px,color:#ffffff;
    classDef holoPurple fill:#210e30,stroke:#aa66cc,stroke-width:2px,color:#ffffff;
    classDef holoGreen fill:#142907,stroke:#99cc00,stroke-width:2px,color:#ffffff;
    classDef holoOrange fill:#2e1f04,stroke:#ffbb33,stroke-width:2px,color:#ffffff;
    classDef holoRed fill:#330e0e,stroke:#ff4444,stroke-width:2px,color:#ffffff;
    classDef holoGray fill:#1c1c1c,stroke:#777777,stroke-width:1.5px,color:#cccccc;

    class Cron,Dispatch holoBlue;
    class FetchPortal,ParsePDF,FetchHDX,Candidate holoPurple;
    class Fallback holoGray;
    class Diff,Reconcile,Crosswalk holoOrange;
    class Store,Manifest,Retain holoGreen;
    class SSGBuild,SSRServer holoDarkBlue;
    class Halt holoRed;
    class Noop holoGray;
```

### How Ingestion Works in Detail

1. **Dynamic DRC Ministry PDF Scraping (`drc-ministry-adapter.js`)**:
   - Instead of reading static mock files or importing test fixtures, the pipeline scrapes `https://sante.gouv.cd/documents/sitreps` to discover the newest daily situation report (e.g., `SitRep_MVEBDB_119_10_09_2026.pdf`).
   - It streams the PDF into memory and parses the digital text using `pdf-parse` in ~500ms without external Python runtime dependencies.
   - Extracts national confirmed cases, new cases, confirmed deaths, recoveries, overall CFR, and the 6 affected provinces (Ituri, Nord-Kivu, Haut-Uélé, Tshopo, Bas-Uélé, Sud-Kivu).

2. **Live UN OCHA HDX Consolidated Feed (`hdx-adapter.js`)**:
   - Fetches `drc_ebola_cases_consolidated.csv` directly from the UN OCHA Humanitarian Data Exchange.
   - Normalizes operational health zones using the canonical crosswalk, aligning historical names with standard pcodes and DHIS2 IDs.
   - Aggregates latest cumulative caseloads for 43+ active health zones with zero duplicate entries.

3. **Offline Baseline Fallback (`server/pipeline/data/baseline-sitrep.txt`)**:
   - Production code is strictly decoupled from the `test/` directory.
   - If the government portal or HDX is temporarily unreachable (e.g. during maintenance or network failure), the pipeline gracefully falls back to the server-side baseline cache without failing closed or breaking the build.

4. **Idempotent Change Detection & Atomic Snapshots (`pipeline-ingest.js`)**:
   - Compares the candidate snapshot against `public/data/latest-snapshot.json`.
   - Volatile fetch timestamps (`fetchedAt`, `generatedAt`) are strictly ignored.
   - If genuine epidemiological metrics have changed, it writes an immutable timestamped snapshot to `public/data/snapshots/`, updates the manifest with SHA-256 hashes, and refreshes the prerender dataset.
   - If metrics are unchanged, zero mutations occur, skipping git commit churn.

5. **Static Production vs. Local Hono Development**:
   - **Production (GitHub Pages):** Operates with **zero backend servers**. The site is 100% pre-rendered into static HTML, client JS/CSS bundles, and JSON snapshots deployed directly to GitHub Pages CDN.
   - **Local Development (`server.js`):** Hono (`@hono/node-server`) is used **strictly for local dev**. It embeds Vite's dev middleware, provides in-memory HTML pre-warming for instant 0ms TTFB, and simulates the `/api/*` endpoints on `http://localhost:3000` (or `PORT=3001`).

---

## 🛠️ Local Development & Operational Commands

This project uses [Vite+](https://viteplus.dev/), the unified toolchain for the web:

```bash
# 1. Install dependencies
vp install

# 2. Run local Hono + Vite+ SSR development server (http://localhost:3000 or custom port)
node server.js
# Or specify an alternate port if 3000 is occupied:
PORT=3001 node server.js

# 3. Ingestion Dry-Run (Verifies live portal & HDX without mutating disk)
node scripts/sync-data.js --dry-run

# 4. Live Ingestion Run (Fetches SitRep PDF & HDX feed, validates, and persists new snapshot)
node scripts/sync-data.js

# 5. Roll back active deployment to a prior validated snapshot
node scripts/rollback-snapshot.js <snapshotId>

# 6. Verify Ministry remote portal & fixture integrity
node scripts/verify-ministry-live.js

# 7. Format, lint, and type check the entire codebase
vp check --fix

# 8. Run test suite (105+ unit, integration, and operational tests)
vp test --run

# 9. Build static production bundle for GitHub Pages
vp run build:pages

# 10. Preview the static production build locally
vp run preview
```

---

## 📂 Project Structure

```text
ebola/
├── .github/workflows/
│   └── deploy.yml            # GitHub Actions 4-hour scheduled ETL & Pages deployment
├── docs/                     # Architectural tickets, specifications, and runbooks
├── public/
│   ├── data/
│   │   ├── manifest.json     # Current snapshot manifest with SHA-256 hash
│   │   ├── latest-snapshot.json # Active validated outbreak snapshot
│   │   └── snapshots/        # Historical immutable snapshot archive (min 10 retained)
│   └── geography/            # Health zone points and boundary crosswalks
├── scripts/
│   ├── sync-data.js          # Live ingestion runner (DRC PDF + HDX CSV + dry-run)
│   ├── rollback-snapshot.js  # Atomic rollback tool for prior snapshots
│   └── verify-ministry-live.js # Remote portal probe & fixture hashing
├── server/
│   ├── pipeline/             # Ingestion, validation, and snapshot engine
│   │   ├── contracts.js      # Normalized outbreak schema & validation
│   │   ├── manifest.js       # Manifest generation & atomic disk writer
│   │   ├── pipeline-ingest.js # Change detection & transaction orchestrator
│   │   ├── prerender-loader.js # SSG loader for pre-rendering
│   │   ├── reconciliation.js # Hierarchical boundary & metric reconciliation
│   │   ├── rollback-retention.js # Retention policy & rollback implementation
│   │   ├── snapshot-store.js # Atomic filesystem writes & snapshot archive
│   │   ├── source-health.js  # Source transport health tracking
│   │   ├── sources.js        # Authoritative source registry
│   │   ├── adapters/         # DRC Ministry PDF, OCHA HDX, and international adapters
│   │   ├── data/             # Server baseline caches (baseline-sitrep.txt)
│   │   └── parsers/          # Ministry SitRep digital PDF and text parsers
│   └── server.js             # Local development server (Hono + Vite SSR middleware)
├── src/
│   ├── data/
│   │   ├── outbreak-data.js  # Fallback baseline epidemiological dataset
│   │   ├── drc-provinces.json # Code-split DRC provincial shapefiles
│   │   └── world-countries.json # Code-split global country boundaries
│   ├── entry-client.js       # Leaflet map, TanStack Charts, modal controllers
│   ├── entry-server.js       # Pre-rendered HTML, SVG generation, Schema.org
│   ├── style.css             # Dark theme design system & mobile media queries
│   └── worker.js             # Cloudflare Workers entry point (optional edge proxy)
├── test/                     # Test suite (105+ tests across 17 test suites)
├── index.html                # Shell HTML with safe JSON-LD & state injection
├── vite.config.ts            # Vite+ configuration & SSG pre-render plugin
└── package.json              # Project manifest & toolchain scripts
```

---

## 🌐 Official Data Sources

- **DRC Ministry of Public Health / INSP:** [https://sante.gouv.cd/documents/sitreps](https://sante.gouv.cd/documents/sitreps) (Canonical authority for national and provincial totals)
- **HDX Humanitarian Data Exchange (UN OCHA):** [https://data.humdata.org/](https://data.humdata.org/) (Health-zone incidence feeds)
- **World Health Organization (WHO):** [https://www.who.int/emergencies/disease-outbreak-news](https://www.who.int/emergencies/disease-outbreak-news) (DONs and acute event tracking)
- **Uganda Ministry of Health:** [https://evd-daily.health.go.ug/](https://evd-daily.health.go.ug/) (Border district surveillance)
- **Ministère du Travail, de la Santé et des Solidarités (France) & BMG (Germany):** International medical evacuation verification
- **Africa CDC:** [https://africacdc.org/](https://africacdc.org/) (Epidemic briefs)

---

## 📄 License

Copyright (C) 2026 Fortunat Mutunda.

This project is licensed under the **GNU General Public License v2.0 (GPL-2.0)** - see the [LICENSE](LICENSE) file for details.
