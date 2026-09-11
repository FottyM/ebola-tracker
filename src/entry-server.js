/**
 * @fileoverview Dynamic SSR Generator.
 * Renders universal country/regional listings, interactive chart sections,
 * two dedicated modal dialogs (Epidemic Curve & Total Cases Deep-Dive), and Schema.org metadata.
 */

import {
  defineChart,
  lineY,
  dot,
  areaY,
  barY,
  createChartScene,
  renderChartSvg,
} from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { createFreshnessViewModel } from "./pipeline/freshness-view-model.js";

/**
 * @typedef {import('../server/etl.js').DynamicOutbreakState} DynamicOutbreakState
 */

/**
 * Generates server-side rendered SVG string for Epidemic Spread Curve.
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
    ariaLabel: "Epidemic Spread Curve",
  });
}

/**
 * Generates server-side rendered SVG Bar Chart for Age Distribution.
 * @param {import('../server/etl.js').Demographics['ageGroups']} ageGroups
 * @param {number} [width]
 * @param {number} [height]
 * @returns {string}
 */
export function renderAgeChartSvg(ageGroups, width = 290, height = 130) {
  if (!ageGroups || ageGroups.length === 0) return "";

  const chart = defineChart({
    marks: [
      barY(ageGroups, {
        x: (d) => d.group,
        y: (d) => d.cases,
        fill: "#f5a623",
      }),
    ],
    x: {
      scale: () => scaleBand().padding(0.3),
    },
    y: {
      scale: scaleLinear,
      nice: true,
      grid: true,
    },
  });

  const scene = createChartScene(chart, { width, height });
  return renderChartSvg(scene, {
    ariaLabel: "Age Distribution Bar Chart",
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
    "@graph": [
      {
        "@type": "SpecialAnnouncement",
        "@id": "https://fottym.github.io/ebola-tracker/#announcement",
        name: "2026 Bundibugyo Ebola Outbreak — DRC & Central Africa Live Surveillance",
        text: `Active epidemiological surveillance for the 2026 Bundibugyo ebolavirus outbreak across the Democratic Republic of the Congo and Uganda border districts. Current cumulative confirmed cases: ${summary.totalCases.toLocaleString()}, cumulative fatalities: ${summary.totalDeaths.toLocaleString()} (${summary.overallCfr} case fatality rate) across ${summary.affectedCountriesCount} countries.`,
        url: "https://fottym.github.io/ebola-tracker/",
        dateModified: summary.lastUpdated || new Date().toISOString(),
        category: "https://www.wikidata.org/wiki/Q5199",
        spatialCoverage: [
          {
            "@type": "Country",
            name: "Democratic Republic of the Congo",
            identifier: "COD",
          },
          {
            "@type": "Country",
            name: "Uganda",
            identifier: "UGA",
          },
        ],
        diseaseSpreadStatistics: [
          {
            "@type": "Observation",
            name: "Cumulative Confirmed Cases",
            measuredProperty: "Cumulative Confirmed Cases",
            measuredValue: summary.totalCases,
          },
          {
            "@type": "Observation",
            name: "Cumulative Deaths",
            measuredProperty: "Cumulative Deaths",
            measuredValue: summary.totalDeaths,
          },
          {
            "@type": "Observation",
            name: "Case Fatality Rate",
            measuredProperty: "Case Fatality Rate",
            measuredValue: summary.overallCfr,
          },
        ],
        provider: [
          {
            "@type": "Organization",
            name: "World Health Organization",
            url: "https://www.who.int",
          },
          {
            "@type": "Organization",
            name: "Africa Centres for Disease Control and Prevention",
            url: "https://africacdc.org",
          },
          {
            "@type": "Organization",
            name: "UN OCHA Humanitarian Data Exchange",
            url: "https://data.humdata.org",
          },
        ],
      },
      {
        "@type": "Dataset",
        "@id": "https://fottym.github.io/ebola-tracker/#dataset",
        name: "2026 Bundibugyo Ebola Outbreak Epidemiological Surveillance Dataset",
        description:
          "Standardized surveillance dataset tracking the 2026 Bundibugyo ebolavirus outbreak across DRC provinces (Ituri, Haut-Uele, Bas-Uele, Tshopo, Nord-Kivu, Sud-Kivu) and Uganda border corridors. Contains cumulative caseloads, weekly epi curves, and demographic distribution.",
        url: "https://fottym.github.io/ebola-tracker/",
        license: "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
        isAccessibleForFree: true,
        creator: {
          "@type": "Person",
          name: "Fortunat Mutunda",
          url: "https://github.com/FottyM",
        },
        temporalCoverage: "2026-05/..",
        spatialCoverage: {
          "@type": "Place",
          name: "Democratic Republic of the Congo",
          geo: {
            "@type": "GeoCoordinates",
            latitude: -4.0383,
            longitude: 21.7587,
          },
        },
        variableMeasured: [
          "Cumulative Confirmed Cases",
          "Cumulative Deaths",
          "Case Fatality Rate",
          "Weekly Incidence Epi Curve",
          "Age Cohort Distribution",
        ],
      },
      {
        "@type": "MedicalCondition",
        name: "Bundibugyo ebolavirus disease",
        alternateName: [
          "Bundibugyo virus disease",
          "Ebola virus disease",
          "BDBV",
          "Ebola hemorrhagic fever",
        ],
        code: {
          "@type": "MedicalCode",
          code: "1D60",
          codingSystem: "ICD-11",
        },
      },
      {
        "@type": "WebSite",
        "@id": "https://fottym.github.io/ebola-tracker/#website",
        name: "2026 Bundibugyo Ebola Outbreak Live Tracker",
        url: "https://fottym.github.io/ebola-tracker/",
        author: {
          "@type": "Person",
          name: "Fortunat Mutunda",
          url: "https://github.com/FottyM",
        },
      },
    ],
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
  const timelineModalChartSvgHtml = renderEpiChartSvg(epiCurve, 620, 240);
  const ageChartSvgHtml = renderAgeChartSvg(demographics?.ageGroups, 290, 120);
  const casesModalAgeChartSvgHtml = renderAgeChartSvg(demographics?.ageGroups, 620, 180);
  const freshness = createFreshnessViewModel(data);
  const freshnessHtml = freshness.renderHtml();

  const appHtml = `
  <div id="map"></div>

  <aside class="info-panel" aria-label="Outbreak Intelligence">
    <div class="panel-grab-bar" id="panel-toggle" role="button" aria-label="Toggle panel" tabindex="0" data-umami-event="toggle-mobile-panel">
      <div class="panel-grab-handle"></div>
    </div>
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

    ${freshnessHtml}

    <section class="stats-grid" aria-label="Headline Metrics">
      <!-- Clickable Total Cases Card triggering Cases & Demographics Modal -->
      <button class="stat-card cases interactive" id="open-cases-modal" aria-haspopup="dialog" aria-controls="cases-dialog" data-umami-event="open-cases-modal">
        <div class="label">Total Cases <span class="click-hint">↗ Breakdown</span></div>
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

    <!-- ── Interactive Small Epidemic Spread Curve (Click to Enlarge) ── -->
    <section class="chart-section interactive-chart-card" id="open-timeline-modal" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="timeline-dialog" aria-label="Open Epidemic Timeline Modal" data-umami-event="open-timeline-modal">
      <div class="chart-header">
        <h3>Epidemic Spread Curve (Epi Week) <span class="click-hint">↗ Enlarge</span></h3>
        <span class="chart-tag">Weekly Cases & Fatalities</span>
      </div>
      <div class="chart-container" id="epi-chart">${sidebarChartSvgHtml}</div>
    </section>

    <!-- ── Demographics Breakdown (Sex & Age) ── -->
    ${
      demographics
        ? `
    <section class="demographics-section interactive-chart-card" id="open-demographics-modal" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="cases-dialog" aria-label="Open Demographics Modal" data-umami-event="open-demographics-modal">
      <div class="chart-header">
        <h3>Demographics (Sex & Age Cohort) <span class="click-hint">↗ Enlarge</span></h3>
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

      <!-- Age Distribution Chart -->
      <div class="age-chart-wrapper">
        <div class="chart-header" style="margin-bottom: 4px;">
          <h4 style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase;">Cases by Age Group</h4>
          <span style="font-size: 8.5px; color: var(--text-muted);">0–4 yrs: 58% CFR</span>
        </div>
        <div class="age-chart-container" id="age-chart">${ageChartSvgHtml}</div>
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

    <details class="seo-brief-accordion">
      <summary>Epidemiological Context & Surveillance Brief</summary>
      <div class="seo-brief-content">
        <p>This operational dashboard provides real-time geographic and clinical surveillance on the <strong>2026 Bundibugyo ebolavirus (BDBV)</strong> outbreak centered in northeastern <strong>Democratic Republic of the Congo (DRC)</strong>, with active cross-border surveillance across the Albertine Rift corridor and western <strong>Uganda</strong>.</p>
        <p>Telemetry integrates verified epidemiological reports from the <strong>World Health Organization (WHO)</strong>, <strong>Africa CDC</strong>, and the <strong>Humanitarian Data Exchange (UN OCHA)</strong>.</p>
      </div>
    </details>

    <footer class="sources">
      <strong>Data Sources & Synchronization</strong><br/>
      • <a href="${sources.who.url}" target="_blank" rel="noopener noreferrer">${sources.who.name}</a> [${sources.who.status}]<br/>
      • <a href="${sources.hdx.url}" target="_blank" rel="noopener noreferrer">${sources.hdx.name}</a> [${sources.hdx.status}]<br/>
      • <a href="${sources.reliefweb.url}" target="_blank" rel="noopener noreferrer">${sources.reliefweb.name}</a> [${sources.reliefweb.status}]
    </footer>
  </aside>

  <!-- ── MODAL 1: Epidemic Timeline Modal (Triggered by clicking small chart) ── -->
  <dialog id="timeline-dialog" class="analytics-dialog" aria-labelledby="timeline-dialog-title">
    <div class="dialog-content">
      <header class="dialog-header">
        <div>
          <span class="dialog-badge">Epidemiological Timeline</span>
          <h2 id="timeline-dialog-title">Epidemic Timeline (Weekly Cases vs Fatalities)</h2>
        </div>
        <button class="dialog-close-btn" id="close-timeline-modal" aria-label="Close dialog">✕</button>
      </header>

      <div class="dialog-stats-summary">
        <div class="dialog-kpi">
          <span class="kpi-label">Peak Weekly Influx</span>
          <span class="kpi-number orange">579 Cases</span>
          <span class="kpi-sub">Surveillance Week 31</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Latest Week Influx</span>
          <span class="kpi-number cases">480 Cases</span>
          <span class="kpi-sub">Surveillance Week 32</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Peak Fatalities</span>
          <span class="kpi-number" style="color: #e5484d;">271 Deaths</span>
          <span class="kpi-sub">Surveillance Week 31</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Active Trajectory</span>
          <span class="kpi-number" style="color: #f5a623;">Plateauing</span>
          <span class="kpi-sub">-17.1% vs previous week</span>
        </div>
      </div>

      <div class="dialog-chart-wrapper">
        <div class="chart-header">
          <h3>Full Epidemic Curve Timeline</h3>
          <span class="chart-tag">Epi Weeks 20–32</span>
        </div>
        <div class="modal-chart-container" style="height: 240px;" id="modal-timeline-chart">
          ${timelineModalChartSvgHtml}
        </div>
      </div>

      <div class="dialog-footer">
        <span class="dialog-note">Data source: WHO Disease Outbreak News & Africa CDC Epidemiological Updates.</span>
        <button class="dialog-action-btn" id="timeline-done-btn">Dismiss</button>
      </div>
    </div>
  </dialog>

  <!-- ── MODAL 2: Total Cases & Demographics Modal (Triggered by Total Cases card) ── -->
  <dialog id="cases-dialog" class="analytics-dialog" aria-labelledby="cases-dialog-title">
    <div class="dialog-content">
      <header class="dialog-header">
        <div>
          <span class="dialog-badge">Caseload & Demographics Intelligence</span>
          <h2 id="cases-dialog-title">Total Cases & Demographic Distribution</h2>
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
          <span class="kpi-label">Sex Distribution</span>
          <span class="kpi-number" style="color: #ff75c3;">56.4% ♀</span>
          <span class="kpi-sub">43.6% ♂</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Primary Epicenter</span>
          <span class="kpi-number" style="color: #f76b15;">Ituri (83.5%)</span>
          <span class="kpi-sub">3,912 Cases</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">Cross-Border Status</span>
          <span class="kpi-number contained">Contained</span>
          <span class="kpi-sub">Uganda & France</span>
        </div>
      </div>

      <!-- Age Cohort Breakdown Chart in Total Cases Modal -->
      <div class="dialog-chart-wrapper">
        <div class="chart-header">
          <h3>Age Cohort Distribution & Caseload Share</h3>
          <span class="chart-tag" style="color: var(--amber); border-color: rgba(245,166,35,0.3); background: rgba(245,166,35,0.1);">Demographics</span>
        </div>
        <div class="modal-chart-container" style="height: 180px;" id="modal-cases-age-chart">
          ${casesModalAgeChartSvgHtml}
        </div>
      </div>

      <div class="dialog-footer">
        <span class="dialog-note">Disaggregated age & sex distribution verified via WHO Field Reports.</span>
        <button class="dialog-action-btn" id="cases-done-btn">Dismiss</button>
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
