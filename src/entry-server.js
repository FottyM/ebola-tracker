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
import { renderEbolaHealthGuidance } from "./health-guidance.js";
import { m } from "./paraglide/messages.js";
import { getSeoMetadata } from "./seo-metadata.js";

/**
 * Localizes location status for French or English display.
 * @param {string} status
 * @param {"en"|"fr"} [locale="en"]
 * @returns {string}
 */
export function localizeStatus(status, locale = "en") {
  if (locale !== "fr") return status;
  if (status.includes("Contained") || status.includes("Over")) return "Contenu / Épidémie terminée";
  if (status.includes("Medical Evacuation"))
    return status.replace("Medical Evacuation", "Évacuation médicale");
  if (status.includes("Active Outbreak Epicenter") || status.includes("Epicenter"))
    return "Épicentre actif de l'épidémie";
  if (status.includes("Active Transmission") || status.includes("Active"))
    return "Transmission active";
  return status;
}

/**
 * Localizes country name for French or English display.
 * @param {string} country
 * @param {"en"|"fr"} [locale="en"]
 * @returns {string}
 */
export function localizeCountry(country, locale = "en") {
  if (locale !== "fr") return country;
  if (country === "Democratic Republic of the Congo" || country === "DRC") return "RDC";
  if (country === "Uganda") return "Ouganda";
  if (country === "France") return "France";
  if (country === "Germany") return "Allemagne";
  return country;
}

/**
 * Determines color indicator for province based on case load and containment status.
 * @param {{ cases: number, status: string }} loc
 * @returns {string}
 */
export function getProvinceDotColor(loc) {
  if (loc.cases > 100) return "#e5484d";
  if (loc.status.includes("Over") || loc.status.includes("Contained")) return "#30a46c";
  return "#f5a623";
}

/**
 * Calculates trajectory percentage and direction between current and previous epi curve points.
 * @param {import('../server/etl.js').EpiCurvePoint | null | undefined} latestPoint
 * @param {import('../server/etl.js').EpiCurvePoint | null | undefined} prevPoint
 * @returns {{ trajectoryPct: string, isDeclining: boolean, sign: string }}
 */
export function calculateTrajectory(latestPoint, prevPoint) {
  if (!latestPoint || !prevPoint || !prevPoint.weeklyCases) {
    return { trajectoryPct: "0.0", isDeclining: false, sign: "+" };
  }
  const pct = (
    ((latestPoint.weeklyCases - prevPoint.weeklyCases) / prevPoint.weeklyCases) *
    100
  ).toFixed(1);
  const isDeclining = Number(pct) < 0;
  return {
    trajectoryPct: pct,
    isDeclining,
    sign: isDeclining ? "" : "+",
  };
}

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
 * @param {{ locale?: "en" | "fr" }} [options]
 * @returns {{ appHtml: string, jsonLd: string, initialState: string }}
 */
export function render(data, options = {}) {
  const locale = options?.locale === "fr" ? "fr" : "en";
  const languageCodes = { fr: "fr-CD", en: "en-US" };
  const seo = getSeoMetadata(locale);
  const { summary, locations, sources, epiCurve, demographics } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SpecialAnnouncement",
        "@id": `${seo.url}#announcement`,
        name: m.schema_announcement_name({}, { locale }),
        inLanguage: languageCodes[locale] || "en-US",
        text: m.schema_announcement_text(
          {
            cases: summary.totalCases.toLocaleString(),
            deaths: summary.totalDeaths.toLocaleString(),
            cfr: summary.overallCfr,
            countries: summary.affectedCountriesCount,
          },
          { locale },
        ),
        url: seo.url,
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
            name: m.schema_metric_cases({}, { locale }),
            measuredProperty: m.schema_metric_cases({}, { locale }),
            measuredValue: summary.totalCases,
          },
          {
            "@type": "Observation",
            name: m.schema_metric_deaths({}, { locale }),
            measuredProperty: m.schema_metric_deaths({}, { locale }),
            measuredValue: summary.totalDeaths,
          },
          {
            "@type": "Observation",
            name: m.schema_metric_cfr({}, { locale }),
            measuredProperty: m.schema_metric_cfr({}, { locale }),
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
        "@id": `${seo.url}#dataset`,
        name: m.schema_dataset_name({}, { locale }),
        description: m.seo_dataset_description({}, { locale }),
        inLanguage: languageCodes[locale],
        url: seo.url,
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
          m.schema_metric_cases({}, { locale }),
          m.schema_metric_deaths({}, { locale }),
          m.schema_metric_cfr({}, { locale }),
          m.schema_metric_weekly({}, { locale }),
          m.schema_metric_age({}, { locale }),
        ],
      },
      {
        "@type": "MedicalCondition",
        name: m.schema_condition_name({}, { locale }),
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
        "@id": `${seo.url}#website`,
        name: m.schema_website_name({}, { locale }),
        inLanguage: languageCodes[locale],
        url: seo.url,
        author: {
          "@type": "Person",
          name: "Fortunat Mutunda",
          url: "https://github.com/FottyM",
        },
      },
    ],
  };

  const locationItemsHtml = locations
    .map((loc) => {
      const countryLabel = localizeCountry(loc.country, locale);
      const regionLabel = loc.region ? `${loc.region} (${countryLabel})` : countryLabel;
      const statusLabel = localizeStatus(loc.status, locale);
      return `
    <li class="province-item" data-center="${loc.center.join(",")}" data-region="${loc.region || loc.country}" data-country="${loc.countryCode || ""}" data-umami-event="select-location-sidebar" data-umami-event-location="${loc.region ? `${loc.region} (${loc.country})` : loc.country}">
      <span class="province-dot" style="background:${getProvinceDotColor(loc)}"></span>
      <div style="flex: 1; display: flex; flex-direction: column;">
        <span class="province-name">${regionLabel}</span>
        <span style="font-size: 10px; color: var(--text-muted);">${statusLabel}</span>
      </div>
      <span class="province-cases">${loc.cases.toLocaleString()}</span>
    </li>
  `;
    })
    .join("");

  const sidebarChartSvgHtml = renderEpiChartSvg(epiCurve, 310, 110);
  const timelineModalChartSvgHtml = renderEpiChartSvg(epiCurve, 620, 240);
  const ageChartSvgHtml = renderAgeChartSvg(demographics?.ageGroups, 290, 120);
  const casesModalAgeChartSvgHtml = renderAgeChartSvg(demographics?.ageGroups, 620, 180);
  const freshness = createFreshnessViewModel(data, locale);
  const freshnessHtml = freshness.renderHtml();

  // Dynamic calculation of timeline KPIs from active epiCurve
  const peakCasesPoint = epiCurve?.length
    ? epiCurve.reduce((max, p) => (p.weeklyCases > max.weeklyCases ? p : max), epiCurve[0])
    : null;
  const peakDeathsPoint = epiCurve?.length
    ? epiCurve.reduce((max, p) => (p.weeklyDeaths > max.weeklyDeaths ? p : max), epiCurve[0])
    : null;
  const latestEpiPoint = epiCurve?.length ? epiCurve[epiCurve.length - 1] : null;
  const prevEpiPoint = epiCurve?.length > 1 ? epiCurve[epiCurve.length - 2] : null;
  const { trajectoryPct, isDeclining, sign } = calculateTrajectory(latestEpiPoint, prevEpiPoint);
  const trajectoryLabel = isDeclining
    ? m.plateauing({}, { locale })
    : m.accelerating({}, { locale });
  const trajectoryColor = isDeclining ? "#f5a623" : "#e5484d";
  const startWeekTag = epiCurve?.length ? epiCurve[0].week.replace(/\s*\(.*?\)/, "") : "W20";
  const endWeekTag = latestEpiPoint ? latestEpiPoint.week.replace(/\s*\(.*?\)/, "") : "W36";

  const appHtml = `
  <div id="map"></div>

  <aside class="info-panel" aria-label="${m.outbreak_intelligence_aria({}, { locale })}">
    <div class="panel-grab-bar" id="panel-toggle" role="button" aria-label="${m.panel_toggle_aria({}, { locale })}" tabindex="0" data-umami-event="toggle-mobile-panel">
      <div class="panel-grab-handle"></div>
    </div>
    <header class="panel-header">
      <div class="icon" aria-hidden="true">🦠</div>
      <div class="header-titles">
        <h1>
          ${m.app_title({}, { locale })}
          <span>${m.app_subtitle({}, { locale })}</span>
        </h1>
      </div>
      <div class="lang-switcher" role="group" aria-label="${m.language_selector_aria({}, { locale })}">
        <button type="button" class="lang-btn ${locale === "en" ? "active" : ""}" data-lang="en" aria-pressed="${locale === "en"}" data-umami-event="switch-language" data-umami-event-language="en">EN</button>
        <span class="lang-sep" aria-hidden="true">|</span>
        <button type="button" class="lang-btn ${locale === "fr" ? "active" : ""}" data-lang="fr" aria-pressed="${locale === "fr"}" data-umami-event="switch-language" data-umami-event-language="fr">FR</button>
      </div>
    </header>

    <div class="pheic-badge" role="status">${m.pheic_badge({ count: summary.affectedCountriesCount }, { locale })}</div>

    ${freshnessHtml}

    <section class="stats-grid" aria-label="${m.headline_metrics_aria({}, { locale })}">
      <!-- Clickable Total Cases Card triggering Cases & Demographics Modal -->
      <button class="stat-card cases interactive" id="open-cases-modal" aria-haspopup="dialog" aria-controls="cases-dialog" data-umami-event="open-cases-modal">
        <div class="label">${m.total_cases({}, { locale })} <span class="click-hint">${m.breakdown_hint({}, { locale })}</span></div>
        <div class="value">${summary.totalCases.toLocaleString()}</div>
        <div class="sub">${m.across_zones({ count: locations.length }, { locale })}</div>
      </button>

      <article class="stat-card deaths">
        <div class="label">${m.total_deaths({}, { locale })}</div>
        <div class="value">${summary.totalDeaths.toLocaleString()}</div>
        <div class="sub">${m.case_fatality({ rate: summary.overallCfr }, { locale })}</div>
      </article>
      <article class="stat-card cfr">
        <div class="label">${m.affected_nations({}, { locale })}</div>
        <div class="value">${summary.affectedCountriesCount}</div>
        <div class="sub">${m.cross_border_monitoring({}, { locale })}</div>
      </article>
      <article class="stat-card zones">
        <div class="label">${m.active_hotspots({}, { locale })}</div>
        <div class="value">${locations.filter((l) => !l.status.includes("Over") && !l.status.includes("Contained")).length}</div>
        <div class="sub">${m.confirmed_transmission({}, { locale })}</div>
      </article>
    </section>

    <button type="button" class="symptoms-card" id="open-symptoms-modal" aria-haspopup="dialog" aria-controls="symptoms-dialog" data-umami-event="open-symptoms-modal">
      <span class="symptoms-card-icon" aria-hidden="true">✚</span>
      <span class="symptoms-card-copy">
        <strong>Symptoms & look-alike illnesses</strong>
        <span>Why early Ebola can resemble malaria, typhoid and other regional diseases</span>
      </span>
      <span class="symptoms-card-action" aria-hidden="true">View guide →</span>
    </button>

    <!-- ── Interactive Small Epidemic Spread Curve (Click to Enlarge) ── -->
    <section class="chart-section interactive-chart-card" id="open-timeline-modal" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="timeline-dialog" aria-label="${m.open_timeline_modal_aria({}, { locale })}" data-umami-event="open-timeline-modal">
      <div class="chart-header">
        <h3>${m.spread_curve_title({}, { locale })} <span class="click-hint">${m.enlarge_hint({}, { locale })}</span></h3>
        <span class="chart-tag">${m.weekly_cases_fatalities({}, { locale })}</span>
      </div>
      <div class="chart-legend" style="display: flex; gap: 10px; font-size: 9.5px; color: var(--text-muted); margin-bottom: 6px;">
        <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #f76b15; display: inline-block;"></span> ${m.cases_legend({}, { locale })}</span>
        <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #e5484d; display: inline-block;"></span> ${m.deaths_legend({}, { locale })}</span>
      </div>
      <div class="chart-container" id="epi-chart">${sidebarChartSvgHtml}</div>
    </section>

    <!-- ── Demographics Breakdown (Sex & Age) ── -->
    ${
      demographics
        ? `
    <section class="demographics-section interactive-chart-card" id="open-demographics-modal" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="cases-dialog" aria-label="${m.open_demographics_modal_aria({}, { locale })}" data-umami-event="open-demographics-modal">
      <div class="chart-header">
        <h3>${m.demographics_title({}, { locale })} <span class="click-hint">${m.enlarge_hint({}, { locale })}</span></h3>
        <span class="chart-tag" style="color: var(--cyan); border-color: rgba(64,196,170,0.3); background: rgba(64,196,170,0.1);">${m.who_cdc_source({}, { locale })}</span>
      </div>
      
      <!-- Sex Ratio Cards -->
      <div class="sex-ratio-container">
        <div class="sex-card female">
          <div class="sex-title">${m.female_cases({}, { locale })}</div>
          <div class="sex-val">${demographics.sex.femalePct}%</div>
          <div class="sex-sub">${m.pregnant_lactating({ count: demographics.sex.pregnantOrLactating }, { locale })}</div>
        </div>
        <div class="sex-card male">
          <div class="sex-title">${m.male_cases({}, { locale })}</div>
          <div class="sex-val">${demographics.sex.malePct}%</div>
          <div class="sex-sub">${m.community_exposure({}, { locale })}</div>
        </div>
      </div>

      <!-- Age Distribution Chart -->
      <div class="age-chart-wrapper">
        <div class="chart-header" style="margin-bottom: 4px;">
          <h4 style="font-size: 9.5px; color: var(--text-muted); text-transform: uppercase;">${m.cases_by_age_group({}, { locale })}</h4>
          <span style="font-size: 8.5px; color: var(--text-muted);">${m.cfr_stat({}, { locale })}</span>
        </div>
        <div class="age-chart-container" id="age-chart">${ageChartSvgHtml}</div>
      </div>

      <div class="hcw-banner">
        <strong>${m.healthcare_workers({}, { locale })}</strong> ${m.hcw_stats({ cases: demographics.vulnerableGroups.healthcareWorkersCases, deaths: demographics.vulnerableGroups.healthcareWorkersDeaths }, { locale })}
      </div>
    </section>
    `
        : ""
    }

    <section class="province-section">
      <h3>${m.active_locations_title({}, { locale })}</h3>
      <ul class="province-list" id="location-list">
        ${locationItemsHtml}
      </ul>
    </section>

    <details class="seo-brief-accordion" data-umami-event="toggle-surveillance-brief">
      <summary>${m.surveillance_brief_title({}, { locale })}</summary>
      <div class="seo-brief-content">
        <p>${m.surveillance_brief_p1({}, { locale })}</p>
        <p>${m.surveillance_brief_p2({}, { locale })}</p>
      </div>
    </details>

    <footer class="sources">
      <strong>${m.sources_header({}, { locale })}</strong><br/>
      • <a href="${sources.who.url}" target="_blank" rel="noopener noreferrer" data-umami-event="outbound-source-click" data-umami-event-source="WHO">${sources.who.name}</a> [${sources.who.status}]<br/>
      • <a href="${sources.hdx.url}" target="_blank" rel="noopener noreferrer" data-umami-event="outbound-source-click" data-umami-event-source="OCHA HDX">${sources.hdx.name}</a> [${sources.hdx.status}]<br/>
      • <a href="${sources.reliefweb.url}" target="_blank" rel="noopener noreferrer" data-umami-event="outbound-source-click" data-umami-event-source="ReliefWeb">${sources.reliefweb.name}</a> [${sources.reliefweb.status}]
    </footer>
  </aside>

  <!-- ── MODAL 1: Epidemic Timeline Modal (Triggered by clicking small chart) ── -->
  <dialog id="timeline-dialog" class="analytics-dialog" aria-labelledby="timeline-dialog-title">
    <div class="dialog-content">
      <header class="dialog-header">
        <div>
          <span class="dialog-badge">${m.dialog_badge_timeline({}, { locale })}</span>
          <h2 id="timeline-dialog-title">${m.timeline_dialog_title({}, { locale })}</h2>
        </div>
        <button class="dialog-close-btn" id="close-timeline-modal" aria-label="${m.close_dialog({}, { locale })}" data-umami-event="close-timeline-modal">✕</button>
      </header>

      <div class="dialog-stats-summary">
        <div class="dialog-kpi">
          <span class="kpi-label">${m.peak_weekly_influx({}, { locale })}</span>
          <span class="kpi-number orange">${peakCasesPoint ? m.cases_count({ count: peakCasesPoint.weeklyCases.toLocaleString() }, { locale }) : "N/A"}</span>
          <span class="kpi-sub">${peakCasesPoint ? m.surveillance_week({ week: peakCasesPoint.week }, { locale }) : ""}</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.latest_week_influx({}, { locale })}</span>
          <span class="kpi-number cases">${latestEpiPoint ? m.cases_count({ count: latestEpiPoint.weeklyCases.toLocaleString() }, { locale }) : "N/A"}</span>
          <span class="kpi-sub">${latestEpiPoint ? m.surveillance_week({ week: latestEpiPoint.week }, { locale }) : ""}</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.peak_fatalities({}, { locale })}</span>
          <span class="kpi-number" style="color: #e5484d;">${peakDeathsPoint ? m.deaths_count({ count: peakDeathsPoint.weeklyDeaths.toLocaleString() }, { locale }) : "N/A"}</span>
          <span class="kpi-sub">${peakDeathsPoint ? m.surveillance_week({ week: peakDeathsPoint.week }, { locale }) : ""}</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.active_trajectory({}, { locale })}</span>
          <span class="kpi-number" style="color: ${trajectoryColor};">${trajectoryLabel}</span>
          <span class="kpi-sub">${m.vs_previous_week({ sign, pct: trajectoryPct }, { locale })}</span>
        </div>
      </div>

      <div class="dialog-chart-wrapper">
        <div class="chart-header">
          <h3>${m.full_curve_timeline({}, { locale })}</h3>
          <span class="chart-tag">${m.epi_weeks_range({ start: startWeekTag, end: endWeekTag }, { locale })}</span>
        </div>
        <div class="chart-legend" style="display: flex; gap: 14px; font-size: 11px; color: var(--text-muted); margin: 6px 0 10px;">
          <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 9px; height: 9px; border-radius: 50%; background: #f76b15; display: inline-block;"></span> ${m.weekly_confirmed_cases_legend({}, { locale })}</span>
          <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 9px; height: 9px; border-radius: 50%; background: #e5484d; display: inline-block;"></span> ${m.weekly_fatalities_legend({}, { locale })}</span>
        </div>
        <div class="modal-chart-container" style="height: 240px;" id="modal-timeline-chart">
          ${timelineModalChartSvgHtml}
        </div>
      </div>

      <div class="dialog-footer">
        <span class="dialog-note">${m.timeline_note({}, { locale })}</span>
        <button class="dialog-action-btn" id="timeline-done-btn" data-umami-event="close-timeline-modal">${m.dismiss({}, { locale })}</button>
      </div>
    </div>
  </dialog>

  <!-- ── MODAL 2: Total Cases & Demographics Modal (Triggered by Total Cases card) ── -->
  <dialog id="cases-dialog" class="analytics-dialog" aria-labelledby="cases-dialog-title">
    <div class="dialog-content">
      <header class="dialog-header">
        <div>
          <span class="dialog-badge">${m.dialog_badge_cases({}, { locale })}</span>
          <h2 id="cases-dialog-title">${m.cases_dialog_title({}, { locale })}</h2>
        </div>
        <button class="dialog-close-btn" id="close-cases-modal" aria-label="${m.close_dialog({}, { locale })}" data-umami-event="close-cases-modal">✕</button>
      </header>

      <div class="dialog-stats-summary">
        <div class="dialog-kpi">
          <span class="kpi-label">${m.cumulative_confirmed({}, { locale })}</span>
          <span class="kpi-number cases">${summary.totalCases.toLocaleString()}</span>
          <span class="kpi-sub">${m.across_nations({}, { locale })}</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.sex_distribution({}, { locale })}</span>
          <span class="kpi-number" style="color: #ff75c3;">56.4% ♀</span>
          <span class="kpi-sub">43.6% ♂</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.primary_epicenter({}, { locale })}</span>
          <span class="kpi-number" style="color: #f76b15;">Ituri (83.5%)</span>
          <span class="kpi-sub">${m.cases_count({ count: "3,912" }, { locale })}</span>
        </div>
        <div class="dialog-kpi">
          <span class="kpi-label">${m.cross_border_status({}, { locale })}</span>
          <span class="kpi-number contained">${m.contained({}, { locale })}</span>
          <span class="kpi-sub">${m.cross_border_countries({}, { locale })}</span>
        </div>
      </div>

      <!-- Age Cohort Breakdown Chart in Total Cases Modal -->
      <div class="dialog-chart-wrapper">
        <div class="chart-header">
          <h3>${m.age_cohort_dist_title({}, { locale })}</h3>
          <span class="chart-tag" style="color: var(--amber); border-color: rgba(245,166,35,0.3); background: rgba(245,166,35,0.1);">${m.demographics_tag({}, { locale })}</span>
        </div>
        <div class="modal-chart-container" style="height: 180px;" id="modal-cases-age-chart">
          ${casesModalAgeChartSvgHtml}
        </div>
      </div>

      <div class="dialog-footer">
        <span class="dialog-note">${m.cases_note({}, { locale })}</span>
        <button class="dialog-action-btn" id="cases-done-btn" data-umami-event="close-cases-modal">${m.dismiss({}, { locale })}</button>
      </div>
    </div>
  </dialog>

  <!-- ── MODAL 3: Symptoms & Differential Diagnosis ── -->
  ${renderEbolaHealthGuidance()}

  <!-- ── Legend ──────────────────────────────────────── -->
  <div class="legend" role="region" aria-label="Map Legend">
    <h4>${m.legend_title({}, { locale })}</h4>
    <div class="legend-row">
      <div class="legend-circle" style="width:28px;height:28px;background:rgba(229,72,77,0.55);border:2px solid #e5484d;"></div>
      <span class="legend-label">${m.gt_500({}, { locale })}</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:20px;height:20px;background:rgba(247,107,21,0.50);border:2px solid #f76b15;"></div>
      <span class="legend-label">${m.range_100_500({}, { locale })}</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:14px;height:14px;background:rgba(245,166,35,0.45);border:2px solid #f5a623;"></div>
      <span class="legend-label">${m.range_10_99({}, { locale })}</span>
    </div>
    <div class="legend-row">
      <div class="legend-circle" style="width:10px;height:10px;background:rgba(239,201,64,0.40);border:2px solid #efc940;"></div>
      <span class="legend-label">${m.range_1_9({}, { locale })}</span>
    </div>
    <div class="legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid #252a36;">
      <div class="legend-circle" style="width:10px;height:10px;background:rgba(48,164,108,0.35);border:2px solid #30a46c;"></div>
      <span class="legend-label">${m.contained_over({}, { locale })}</span>
    </div>
  </div>
  `;

  return {
    appHtml,
    jsonLd: JSON.stringify(jsonLd),
    initialState: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}
