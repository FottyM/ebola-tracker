/**
 * @fileoverview Dynamic SSR Generator.
 * Renders universal country/regional listings, TanStack Charts epidemiological curves,
 * demographic sex/age breakdowns, accessible modal dialog for Total Cases analytics, and Schema.org metadata.
 */

import { defineChart, lineY, dot, areaY, createChartScene, renderChartSvg } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";

/**
 * @typedef {import('../server/etl.js').DynamicOutbreakState} DynamicOutbreakState
 */

/**
 * Generates server-side rendered SVG string using TanStack Charts.
 * @param {import('../server/etl.js').EpiCurvePoint[]} epiData
 * @param {number} [width]
 * @param {number} [height]
 * @returns {string}
 */
export function renderEpiChartSvg(epiData, width = 310, height = 120) {
  if (!epiData || epiData.length === 0) return "";

  const chart = defineChart({
    marks: [
      areaY(epiData, {
        x: (d) => d.week,
        y: (d) => d.weeklyCases,
        fill: "rgba(247, 107, 21, 0.15)",
      }),
      lineY(epiData, {
        x: (d) => d.week,
        y: (d) => d.weeklyCases,
        stroke: "#f76b15",
        strokeWidth: 2,
      }),
      dot(epiData, {
        x: (d) => d.week,
        y: (d) => d.weeklyCases,
        fill: "#f76b15",
        r: 3.5,
      }),
      lineY(epiData, {
        x: (d) => d.week,
        y: (d) => d.weeklyDeaths,
        stroke: "#e5484d",
        strokeWidth: 1.8,
      }),
      dot(epiData, {
        x: (d) => d.week,
        y: (d) => d.weeklyDeaths,
        fill: "#e5484d",
        r: 3,
      }),
    ],
    x: {
      scale: () => scaleBand().padding(0.2),
    },
    y: {
      scale: scaleLinear,
      nice: true,
      grid: true,
    },
  });

  const scene = createChartScene(chart, { width, height });
  return renderChartSvg(scene, {
    ariaLabel: "Ebola Epidemic Spread Curve",
  });
}

/**
 * @param {DynamicOutbreakState} data
 * @returns {{ appHtml: string, jsonLd: string, initialState: string }}
 */
export function render(data) {
  const { summary, locations, sources, epiCurve, demographics } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SpecialAnnouncement",
    name: "Global Ebola Outbreak Epidemiological Tracker",
    text: `Current outbreak tracking across ${summary.affectedCountriesCount} countries: ${summary.totalCases.toLocaleString()} confirmed cases and ${summary.totalDeaths.toLocaleString()} fatalities.`,
    diseaseSpreadStatistics: {
      "@type": "Observation",
      measuredProperty: "Cumulative Confirmed Cases",
      measuredValue: summary.totalCases,
    },
  };

  const locationItemsHtml = locations
    .map(
      (loc) => `
    <li class="province-item" data-center="${loc.center.join(",")}">
      <span class="province-dot" style="background:${loc.cases > 100 ? "#e5484d" : loc.status.includes("Over") || loc.status.includes("Contained") ? "#30a46c" : "#f5a623"}"></span>
      <div style="flex: 1; display: flex; flex-direction: column;">
        <span class="province-name">${loc.region ? `${loc.region} (${loc.country})` : loc.country}</span>
        <span style="font-size: 10px; color: var(--text-muted);">${loc.status}</span>
      </div>
      <span class="province-cases">${loc.cases.toLocaleString()}</span>
    </li>
  `,
    )
    .join("");

  const sidebarChartSvgHtml = renderEpiChartSvg(epiCurve, 310, 110);
  const modalChartSvgHtml = renderEpiChartSvg(epiCurve, 620, 240);

  const ageBreakdownHtml = demographics?.ageGroups
    ? demographics.ageGroups
        .map(
          (ag) => `
        <div class="demog-row">
          <span class="demog-label">${ag.group}</span>
          <div class="demog-bar-container">
            <div class="demog-bar" style="width: ${ag.percentage}%;"></div>
          </div>
          <span class="demog-val">${ag.percentage}% <small>(${ag.cases})</small></span>
        </div>
      `,
        )
        .join("")
    : "";

  const appHtml = `
  <div id="map"></div>

  <!-- ── Dynamic Info Panel (SSR) ──────────────── -->
  <aside class="info-panel" aria-label="Dynamic Outbreak Intelligence">
    <header class="panel-header">
      <div class="icon" aria-hidden="true">🦠</div>
      <div>
        <h1>
          Ebola Outbreak Tracker
          <span>Global Surveillance & Epidemiological Map</span>
        </h1>
      </div>
    </header>

    <div class="pheic-badge" role="status">Active Surveillance — ${summary.affectedCountriesCount} Countries Affected</div>

    <section class="stats-grid" aria-label="Headline Metrics">
      <!-- Clickable Total Cases Card triggering Analytics Modal -->
      <button class="stat-card cases interactive" id="open-cases-modal" aria-haspopup="dialog" aria-controls="cases-dialog">
        <div class="label">Total Cases <span class="click-hint">↗ Details</span></div>
        <div class="value">${summary.totalCases.toLocaleString()}</div>
        <div class="sub">across ${locations.length} reporting zones</div>
      </button>

      <article class="stat-card deaths">
        <div class="label">Total Deaths</div>
        <div class="value">${summary.totalDeaths.toLocaleString()}</div>
        <div class="sub">${summary.overallCfr} case fatality</div>
      </article>
      <article class="stat-card cfr">
        <div class="label">Affected Nations</div>
        <div class="value">${summary.affectedCountriesCount}</div>
        <div class="sub">cross-border monitoring</div>
      </article>
      <article class="stat-card zones">
        <div class="label">Active Hotspots</div>
        <div class="value">${locations.filter((l) => !l.status.includes("Over") && !l.status.includes("Contained")).length}</div>
        <div class="sub">confirmed transmission</div>
      </article>
    </section>

    <!-- ── TanStack Charts: Epidemiological Spread Curve ── -->
    <section class="chart-section" aria-label="Epidemic Curve">
      <div class="chart-header">
        <h3>Epidemic Spread Curve (Epi Week)</h3>
        <span class="chart-tag">Weekly Cases & CFR</span>
      </div>
      <div class="chart-container" id="epi-chart">${sidebarChartSvgHtml}</div>
    </section>

    <!-- ── Demographics Breakdown (Sex & Age) ── -->
    ${
      demographics
        ? `
    <section class="demographics-section" aria-label="Demographic Distribution">
      <div class="chart-header">
        <h3>Demographics (Sex & Age)</h3>
        <span class="chart-tag" style="color: var(--cyan); border-color: rgba(64,196,170,0.3); background: rgba(64,196,170,0.1);">WHO & CDC</span>
      </div>
      
      <!-- Sex Ratio Cards -->
      <div class="sex-ratio-container">
        <div class="sex-card female">
          <div class="sex-title">♀ Female Cases</div>
          <div class="sex-val">${demographics.sex.femalePct}%</div>
          <div class="sex-sub">${demographics.sex.pregnantOrLactating} pregnant/lactating</div>
        </div>
        <div class="sex-card male">
          <div class="sex-title">♂ Male Cases</div>
          <div class="sex-val">${demographics.sex.malePct}%</div>
          <div class="sex-sub">Community exposure</div>
        </div>
      </div>

      <!-- Age Distribution -->
      <div class="age-distribution">
        <div class="demog-header-row">
          <span>Age Cohort</span>
          <span>Caseload Share</span>
        </div>
        ${ageBreakdownHtml}
      </div>

      <div class="hcw-banner">
        <strong>Healthcare Workers:</strong> ${demographics.vulnerableGroups.healthcareWorkersCases} infected (${demographics.vulnerableGroups.healthcareWorkersDeaths} deaths)
      </div>
    </section>
    `
        : ""
    }

    <section class="province-section">
      <h3>Active Affected Locations & Countries</h3>
      <ul class="province-list" id="location-list">
        ${locationItemsHtml}
      </ul>
    </section>

    <footer class="sources">
      <strong>ETL Ingestion Telemetry</strong><br/>
      • <a href="${sources.who.url}" target="_blank" rel="noopener noreferrer">${sources.who.name}</a> [${sources.who.status}]<br/>
      • <a href="${sources.hdx.url}" target="_blank" rel="noopener noreferrer">${sources.hdx.name}</a> [${sources.hdx.status}]<br/>
      • <a href="${sources.reliefweb.url}" target="_blank" rel="noopener noreferrer">${sources.reliefweb.name}</a> [${sources.reliefweb.status}]
    </footer>
  </aside>

  <!-- ── Total Cases Analytics Modal Dialog (Native HTML5 <dialog>) ── -->
  <dialog id="cases-dialog" class="analytics-dialog" aria-labelledby="cases-dialog-title">
    <div class="dialog-content">
      <header class="dialog-header">
        <div>
          <span class="dialog-badge">Epidemiological Analytics</span>
          <h2 id="cases-dialog-title">Total Cases & Transmission Dynamics</h2>
        </div>
        <button class="dialog-close-btn" id="close-cases-modal" aria-label="Close dialog">✕</button>
      </header>

      <div class="dialog-stats-summary">
        <div class="dialog-kpi">
          <span class="kpi-label">Cumulative Confirmed</span>
          <span class="kpi-number cases">${summary.totalCases.toLocaleString()}</span>
          <span class="kpi-sub">Across 3 Nations</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Weekly Peak Caseload</span>
          <span class="kpi-number orange">579</span>
          <span class="kpi-sub">Week 31 (Aug 3)</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Primary Epicenter</span>
          <span class="kpi-number" style="color: #ff75c3;">Ituri (83.5%)</span>
          <span class="kpi-sub">3,912 Confirmed</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Cross-Border Status</span>
          <span class="kpi-number contained">Contained</span>
          <span class="kpi-sub">Uganda & France</span>
        </div>
      </div>

      <div class="dialog-chart-wrapper">
        <div class="chart-header">
          <h3>Full Resolution Epidemic Curve (@tanstack/charts)</h3>
          <span class="chart-tag">Weekly Cases vs Deaths</span>
        </div>
        <div class="modal-chart-container" id="modal-epi-chart">
          ${modalChartSvgHtml}
        </div>
      </div>

      <div class="dialog-footer">
        <span class="dialog-note">Data source: WHO DONs & Africa CDC Epidemiological Bulletin (Synchronized via ETL).</span>
        <button class="dialog-action-btn" id="dialog-done-btn">Dismiss</button>
      </div>
    </div>
  </dialog>

  <!-- ── Legend ──────────────────────────────────────── -->
  <div class="legend" role="region" aria-label="Map Legend">
    <h4>Caseload Severity</h4>
    <div class="legend-row">
      <div class="legend-circle" style="width:28px;height:28px;background:rgba(229,72,77,0.55);border:2px solid #e5484d;"></div>
      <span class="legend-label">&gt; 500 cases</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:20px;height:20px;background:rgba(247,107,21,0.50);border:2px solid #f76b15;"></div>
      <span class="legend-label">100 – 500 cases</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:14px;height:14px;background:rgba(245,166,35,0.45);border:2px solid #f5a623;"></div>
      <span class="legend-label">10 – 99 cases</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:10px;height:10px;background:rgba(239,201,64,0.40);border:2px solid #efc940;"></div>
      <span class="legend-label">1 – 9 cases</span>
    </div>
    <div class="legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid #252a36;">
      <div class="legend-circle" style="width:10px;height:10px;background:rgba(48,164,108,0.35);border:2px solid #30a46c;"></div>
      <span class="legend-label">Contained / Over</span>
    </div>
  </div>
  `;

  return {
    appHtml,
    jsonLd: JSON.stringify(jsonLd),
    initialState: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}
