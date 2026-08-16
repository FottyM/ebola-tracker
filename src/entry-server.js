/**
 * @fileoverview Dynamic SSR Generator.
 * Renders universal country/regional listings, TanStack Charts epidemiological curve SVG,
 * and Schema.org metadata for all affected locations.
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
 * @returns {string}
 */
export function renderEpiChartSvg(epiData) {
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
        r: 3,
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
        r: 2.5,
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

  const scene = createChartScene(chart, { width: 310, height: 120 });
  return renderChartSvg(scene, {
    ariaLabel: "Ebola Epidemic Spread Curve",
  });
}

/**
 * @param {DynamicOutbreakState} data
 * @returns {{ appHtml: string, jsonLd: string, initialState: string }}
 */
export function render(data) {
  const { summary, locations, sources, epiCurve } = data;

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

  const chartSvgHtml = renderEpiChartSvg(epiCurve);

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
      <article class="stat-card cases">
        <div class="label">Total Cases</div>
        <div class="value">${summary.totalCases.toLocaleString()}</div>
        <div class="sub">across ${locations.length} reporting zones</div>
      </article>
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
      <div class="chart-container" id="epi-chart">${chartSvgHtml}</div>
    </section>

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
