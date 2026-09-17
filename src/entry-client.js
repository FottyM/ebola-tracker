/**
 * @fileoverview Dynamic Client-Side Hydration Controller.
 * Renders layered GIS boundaries:
 * 1. Global World Countries (all 258 sovereign nations with ISO/name matching)
 * 2. Official Regional Subdivisions / Provinces (DRC 26 provinces + sub-regions)
 * 3. Outbreak Hotspots, Case Fatality markers, Epicenter Pulse beacons, and Medevac Corridors.
 * 4. Interactive Epidemiological Spread Curve Chart & Age Distribution Charts.
 * 5. Two Modal Controllers:
 *    - Timeline Modal (opens when clicking the small epidemic curve chart)
 *    - Total Cases & Demographics Modal (opens when clicking Total Cases)
 */

import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";
import { mountChart, defineChart, areaY, lineY, dot, barY, crosshair } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";

import defaultOutbreakData from "./data/outbreak-data.js";
import { render, localizeStatus, localizeCountry, calculateTrajectory } from "./entry-server.js";
import { createStaticRefreshController } from "./pipeline/static-client-refresh.js";
import { applyUpdatedSnapshot } from "./pipeline/client-state-updater.js";
import { createFreshnessViewModel } from "./pipeline/freshness-view-model.js";
import { getProvinceFallbackStyle } from "./pipeline/map-boundary-styles.js";
import {
  trackEvent,
  identifySession,
  detectInitialLocaleWithSource,
  detectInitialLocale,
} from "./pipeline/locale-detector.js";
import { m } from "./paraglide/messages.js";
import { setLocale } from "./paraglide/runtime.js";
import { localizeSeoDocument } from "./seo-metadata.js";

export { trackEvent, identifySession, detectInitialLocaleWithSource, detectInitialLocale };

/**
 * @typedef {import('../server/etl.js').DynamicOutbreakState} DynamicOutbreakState
 * @typedef {import('../server/etl.js').GeoLocation} GeoLocation
 * @typedef {import('../server/etl.js').EpiCurvePoint} EpiCurvePoint
 * @typedef {import('../server/etl.js').Demographics} Demographics
 */

/**
 * Computes marker radius from case count.
 * @param {number} cases
 * @returns {number}
 */
function casesToRadius(cases) {
  return Math.max(9, Math.min(38, Math.sqrt(cases) * 1.15));
}

/**
 * Maps severity colors based on status and case count.
 * @param {GeoLocation} loc
 * @returns {{ color: string, fill: string, radius: number }}
 */
function getSeverity(loc) {
  if (loc.status.includes("Over") || loc.status.includes("Contained")) {
    return {
      color: "#30a46c",
      fill: "rgba(48,164,108,0.50)",
      radius: Math.max(10, casesToRadius(loc.cases)),
    };
  }
  if (loc.cases >= 500) {
    return {
      color: "#e5484d",
      fill: "rgba(229,72,77,0.40)",
      radius: casesToRadius(loc.cases),
    };
  }
  if (loc.cases >= 100) {
    return {
      color: "#f76b15",
      fill: "rgba(247,107,21,0.35)",
      radius: casesToRadius(loc.cases),
    };
  }
  if (loc.cases >= 10) {
    return {
      color: "#f5a623",
      fill: "rgba(245,166,35,0.30)",
      radius: casesToRadius(loc.cases),
    };
  }
  return {
    color: "#efc940",
    fill: "rgba(239,201,64,0.25)",
    radius: casesToRadius(loc.cases),
  };
}

/**
 * Resolves province polygon fill opacity based on confirmed caseload tier.
 * @param {number} cases
 * @returns {number}
 */
export function getProvinceFillOpacity(cases) {
  if (cases > 1000) return 0.32;
  if (cases > 100) return 0.24;
  if (cases > 10) return 0.16;
  return 0.1;
}

/**
 * Resolves province boundary stroke color based on confirmed caseload tier.
 * @param {number} cases
 * @returns {string}
 */
export function getProvinceStrokeColor(cases) {
  if (cases > 1000) return "#e5484d";
  if (cases > 100) return "#f76b15";
  if (cases > 10) return "#f5a623";
  return "#efc940";
}

/**
 * Resolves province boundary stroke weight.
 * @param {number} cases
 * @returns {number}
 */
export function getProvinceWeight(cases) {
  return cases > 1000 ? 2.5 : 1.8;
}

/**
 * Resolves province fill color based on caseload.
 * @param {number} cases
 * @returns {string}
 */
export function getProvinceFillColor(cases) {
  return cases > 500 ? "#e5484d" : "#f76b15";
}

/**
 * Normalizes province names between international shapefile and health dataset.
 * @param {string} shapeName
 * @returns {string}
 */
function normalizeProvinceName(shapeName) {
  if (!shapeName) return "";
  const s = shapeName.toLowerCase().trim();
  if (s.includes("ituri")) return "Ituri";
  if (s.includes("north kivu") || s.includes("nord-kivu")) return "North Kivu";
  if (s.includes("upper uele") || s.includes("haut-uele") || s.includes("haut-uélé"))
    return "Haut-Uélé";
  if (s.includes("tshopo")) return "Tshopo";
  if (s.includes("south kivu") || s.includes("sud-kivu")) return "South Kivu";
  if (s.includes("lower uele") || s.includes("bas-uele") || s.includes("bas-uélé"))
    return "Bas-Uélé";
  if (s.includes("sud-ubangi") || s.includes("sud ubangi")) return "Sud-Ubangi";
  return shapeName;
}

/**
 * Initializes the interactive epidemiological spread curve chart.
 * @param {HTMLElement} container
 * @param {EpiCurvePoint[]} epiData
 * @param {number} height
 * @returns {void}
 */
function renderTanstackChart(container, epiData, height = 120) {
  if (!container || !epiData || epiData.length === 0) return;

  container.innerHTML = "";

  const chartDef = defineChart({
    marks: [
      areaY(epiData, {
        x: "week",
        y: "weeklyCases",
        fill: "rgba(247, 107, 21, 0.15)",
      }),
      lineY(epiData, {
        x: "week",
        y: "weeklyCases",
        stroke: "#f76b15",
        strokeWidth: 2,
      }),
      dot(epiData, {
        x: "week",
        y: "weeklyCases",
        fill: "#f76b15",
        r: 3.5,
      }),
      lineY(epiData, {
        x: "week",
        y: "weeklyDeaths",
        stroke: "#e5484d",
        strokeWidth: 1.8,
      }),
      dot(epiData, {
        x: "week",
        y: "weeklyDeaths",
        fill: "#e5484d",
        r: 3,
      }),
      crosshair({
        stroke: "rgba(255, 255, 255, 0.25)",
        strokeDasharray: "3 3",
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

  mountChart(container, {
    definition: chartDef,
    height,
    ariaLabel: "Epidemic Spread Curve",
  });
}

/**
 * Initializes the interactive Age Distribution bar chart.
 * @param {HTMLElement} container
 * @param {Demographics['ageGroups']} ageGroups
 * @param {number} height
 * @returns {void}
 */
function renderAgeChart(container, ageGroups, height = 120) {
  if (!container || !ageGroups || ageGroups.length === 0) return;

  container.innerHTML = "";

  const chartDef = defineChart({
    marks: [
      barY(ageGroups, {
        x: "group",
        y: "cases",
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

  mountChart(container, {
    definition: chartDef,
    height,
    ariaLabel: "Age Distribution Bar Chart",
  });
}

/**
 * Sets up both modal dialog controllers:
 * 1. Timeline Modal (when clicking small epidemic curve)
 * 2. Total Cases & Demographics Modal (when clicking Total Cases card)
 * @param {EpiCurvePoint[]} epiCurve
 * @param {Demographics['ageGroups']} [ageGroups]
 * @returns {void}
 */
function initModalControllers(epiCurve, ageGroups) {
  // ── 1. Timeline Modal Controller (Clicking small chart) ──
  const timelineDialog = /** @type {HTMLDialogElement | null} */ (
    document.getElementById("timeline-dialog")
  );
  const openTimelineBtn = document.getElementById("open-timeline-modal");
  const closeTimelineBtn = document.getElementById("close-timeline-modal");
  const doneTimelineBtn = document.getElementById("timeline-done-btn");
  const timelineModalContainer = document.getElementById("modal-timeline-chart");

  function openTimelineModal() {
    trackEvent("open-timeline-modal");
    timelineDialog?.showModal();
    document.body.style.overflow = "hidden";
    if (timelineModalContainer && epiCurve) {
      renderTanstackChart(timelineModalContainer, epiCurve, 240);
    }
  }

  function closeTimelineModal(method = "button") {
    trackEvent("close-timeline-modal", { method });
    timelineDialog?.close();
    document.body.style.overflow = "";
  }

  openTimelineBtn?.addEventListener("click", openTimelineModal);
  openTimelineBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTimelineModal();
    }
  });
  closeTimelineBtn?.addEventListener("click", () => closeTimelineModal("close-button"));
  doneTimelineBtn?.addEventListener("click", () => closeTimelineModal("dismiss-button"));
  timelineDialog?.addEventListener("click", (e) => {
    if (e.target === timelineDialog) closeTimelineModal("backdrop");
  });
  timelineDialog?.addEventListener("cancel", () => {
    trackEvent("close-timeline-modal", { method: "escape-key" });
    document.body.style.overflow = "";
  });

  // ── 2. Cases & Demographics Modal Controller (Clicking Total Cases) ──
  const casesDialog = /** @type {HTMLDialogElement | null} */ (
    document.getElementById("cases-dialog")
  );
  const openCasesBtn = document.getElementById("open-cases-modal");
  const openDemoBtn = document.getElementById("open-demographics-modal");
  const closeCasesBtn = document.getElementById("close-cases-modal");
  const doneCasesBtn = document.getElementById("cases-done-btn");
  const modalAgeContainer = document.getElementById("modal-cases-age-chart");

  function openCasesModal(source = "stat-card") {
    trackEvent("open-cases-modal", { source });
    casesDialog?.showModal();
    document.body.style.overflow = "hidden";
    if (modalAgeContainer && ageGroups) {
      renderAgeChart(modalAgeContainer, ageGroups, 180);
    }
  }

  function closeCasesModal(method = "button") {
    trackEvent("close-cases-modal", { method });
    casesDialog?.close();
    document.body.style.overflow = "";
  }

  openCasesBtn?.addEventListener("click", () => openCasesModal("total-cases-card"));
  openDemoBtn?.addEventListener("click", () => openCasesModal("demographics-section"));
  openDemoBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openCasesModal("demographics-section");
    }
  });
  closeCasesBtn?.addEventListener("click", () => closeCasesModal("close-button"));
  doneCasesBtn?.addEventListener("click", () => closeCasesModal("dismiss-button"));
  casesDialog?.addEventListener("click", (e) => {
    if (e.target === casesDialog) closeCasesModal("backdrop");
  });
  casesDialog?.addEventListener("cancel", () => {
    trackEvent("close-cases-modal", { method: "escape-key" });
    document.body.style.overflow = "";
  });

  // ── 3. Symptoms & Look-Alike Illnesses Modal Controller ──
  const symptomsDialog = /** @type {HTMLDialogElement | null} */ (
    document.getElementById("symptoms-dialog")
  );
  const openSymptomsBtn = document.getElementById("open-symptoms-modal");
  const closeSymptomsBtn = document.getElementById("close-symptoms-modal");
  const doneSymptomsBtn = document.getElementById("symptoms-done-btn");

  function openSymptomsModal() {
    symptomsDialog?.showModal();
    document.body.style.overflow = "hidden";
  }

  function closeSymptomsModal() {
    symptomsDialog?.close();
    document.body.style.overflow = "";
  }

  openSymptomsBtn?.addEventListener("click", openSymptomsModal);
  closeSymptomsBtn?.addEventListener("click", closeSymptomsModal);
  doneSymptomsBtn?.addEventListener("click", closeSymptomsModal);
  symptomsDialog?.addEventListener("click", (e) => {
    if (e.target === symptomsDialog) closeSymptomsModal();
  });
  symptomsDialog?.addEventListener("cancel", () => {
    document.body.style.overflow = "";
  });
}

/**
 * Generates popup HTML for a given location and locale.
 * @param {GeoLocation} loc
 * @param {"en"|"fr"} locale
 * @returns {string}
 */
function getPopupHtml(loc, locale) {
  const country = localizeCountry(loc.country, locale);
  const region = loc.region ? `${loc.region}, ${country}` : country;
  const status = localizeStatus(loc.status, locale);
  return `
    <div class="popup-content">
      <h3>${region}</h3>
      <div class="pop-province">${m.status_label({}, { locale })} ${status}</div>
      <div class="pop-row"><span class="pop-label">${m.confirmed_cases_label({}, { locale })}</span><span class="pop-val cases">${loc.cases.toLocaleString()}</span></div>
      <div class="pop-row"><span class="pop-label">${m.recorded_deaths_label({}, { locale })}</span><span class="pop-val deaths">${loc.deaths.toLocaleString()}</span></div>
      <div class="pop-row"><span class="pop-label">${m.case_fatality({ rate: "" }, { locale }).trim()}</span><span class="pop-val cfr">${loc.cfr}%</span></div>
      ${loc.note ? `<div class="pop-note">${loc.note}</div>` : ""}
      <div class="pop-note" style="margin-top:4px;">${m.reported_date_label({}, { locale })} ${loc.lastReported}</div>
    </div>
  `;
}

/**
 * Hydrates map with global boundary layers, provincial sub-regions, dynamic markers, charts, and modal controllers.
 * @returns {void}
 */
export function initClient() {
  /** @type {Window & { __INITIAL_DATA__?: DynamicOutbreakState }} */
  const win = window;
  let data = win.__INITIAL_DATA__;

  if (!data) {
    data = defaultOutbreakData;
    win.__INITIAL_DATA__ = data;
  }

  const initialLocaleInfo = detectInitialLocaleWithSource();
  let currentLocale = initialLocaleInfo.locale;

  // Track initial active language and session state in Umami
  identifySession({
    language: currentLocale,
    app_language: currentLocale,
    detection_source: initialLocaleInfo.source,
  });

  trackEvent("active-language", {
    language: currentLocale,
    locale: currentLocale,
    source: initialLocaleInfo.source,
  });

  // Pure client-side fallback: If pre-rendered SSR HTML is missing, mount it into document.body
  if (!document.getElementById("map")) {
    const { appHtml } = render(data, { locale: currentLocale });
    document.body.insertAdjacentHTML("afterbegin", appHtml);
  }

  const { locations, corridors, epiCurve, demographics } = data;

  // 1. Mount sidebar charts & Modal Controllers
  if (epiCurve) {
    const sidebarChartEl = document.getElementById("epi-chart");
    if (sidebarChartEl) {
      try {
        renderTanstackChart(sidebarChartEl, epiCurve, 110);
      } catch (e) {
        console.warn("Client Spread Chart hydration:", e);
      }
    }
    const sidebarAgeEl = document.getElementById("age-chart");
    if (sidebarAgeEl && demographics?.ageGroups) {
      try {
        renderAgeChart(sidebarAgeEl, demographics.ageGroups, 120);
      } catch (e) {
        console.warn("Client Age Chart hydration:", e);
      }
    }
    initModalControllers(epiCurve, demographics?.ageGroups);
  }

  // 2. Initialize Leaflet Map
  const map = L.map("map", {
    center: [1.2, 29.5],
    zoom: 6,
    minZoom: 3,
    maxZoom: 13,
    maxBounds: [
      [-85, -180],
      [85, 180],
    ],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    zoomControl: true,
    attributionControl: true,
  });

  // Dedicated custom panes to guarantee correct layer stacking:
  // - worldCountriesPane (z-index 250): visual background vector boundaries (strictly non-interactive)
  // - provincesPane (z-index 350): DRC sub-provincial administrative boundaries
  // - corridorsPane (z-index 400): international evacuation flight corridors
  // - bubblesPane (z-index 500): outbreak location circle markers & pulse rings
  const worldPane = map.createPane("worldCountriesPane");
  worldPane.style.zIndex = "250";
  worldPane.style.pointerEvents = "none";

  const provPane = map.createPane("provincesPane");
  provPane.style.zIndex = "350";

  const corridorsPane = map.createPane("corridorsPane");
  corridorsPane.style.zIndex = "400";

  const bubblesPane = map.createPane("bubblesPane");
  bubblesPane.style.zIndex = "500";

  // 100% Free OpenStreetMap with Dark Mode styling (Zero API Keys required)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    minZoom: 3,
    maxZoom: 13,
    className: "osm-dark-tiles",
    noWrap: true,
    bounds: [
      [-85, -180],
      [85, 180],
    ],
  }).addTo(map);

  const affectedCountryLookup = new Map();
  const affectedRegionLookup = new Map();

  locations.forEach((loc) => {
    affectedCountryLookup.set(loc.countryCode.toUpperCase(), loc);
    affectedCountryLookup.set(loc.country.toLowerCase(), loc);
    if (loc.region) {
      affectedRegionLookup.set(normalizeProvinceName(loc.region), loc);
    }
  });

  // ── LAYER 1: Global World Countries (Loaded Dynamically) ──
  import("./data/world-countries.json")
    .then((mod) => {
      const worldCountriesGeo = mod.default;
      L.geoJSON(/** @type {any} */ (worldCountriesGeo), {
        pane: "worldCountriesPane",
        interactive: false,
        style: (feature) => {
          const name = (feature?.properties?.name || "").toLowerCase();
          const admin = (feature?.properties?.admin || "").toLowerCase();
          const sov = (feature?.properties?.sovereignt || "").toLowerCase();
          const adm0_a3 = (
            feature?.properties?.["ISO3166-1-Alpha-3"] ||
            feature?.properties?.adm0_a3 ||
            ""
          ).toUpperCase();
          const adm0_a2 = (feature?.properties?.["ISO3166-1-Alpha-2"] || "").toUpperCase();
          const sov_a3 = (feature?.properties?.sov_a3 || "").toUpperCase();

          const matched =
            affectedCountryLookup.get(adm0_a3) ||
            affectedCountryLookup.get(adm0_a2) ||
            affectedCountryLookup.get(sov_a3) ||
            affectedCountryLookup.get(name) ||
            affectedCountryLookup.get(admin) ||
            affectedCountryLookup.get(sov);

          if (matched) {
            const isContained =
              matched.status.includes("Over") || matched.status.includes("Contained");
            return {
              color: isContained ? "#30a46c" : "#e5484d",
              weight: 2,
              opacity: 0.95,
              fillColor: isContained ? "#30a46c" : "#e5484d",
              fillOpacity: isContained ? 0.1 : 0.06,
            };
          }

          return {
            color: "#475569",
            weight: 1.2,
            opacity: 0.55,
            fillColor: "#0f172a",
            fillOpacity: 0.03,
          };
        },
      }).addTo(map);
    })
    .catch((err) => {
      console.warn("Failed to load world countries dynamically:", err);
    });

  // ── LAYER 2: Regional Sub-Provincial Boundaries (Loaded Dynamically) ──
  let provincesLayer = null;
  import("./data/drc-provinces.json")
    .then((mod) => {
      const drcProvincesGeo = mod.default;
      provincesLayer = L.geoJSON(/** @type {any} */ (drcProvincesGeo), {
        pane: "provincesPane",
        style: (feature) => {
          const rawName = feature?.properties?.shapeName || "";
          const normName = normalizeProvinceName(rawName);
          const provData = affectedRegionLookup.get(normName);

          if (provData) {
            const cases = provData.cases || 0;
            return {
              color: getProvinceStrokeColor(cases),
              weight: getProvinceWeight(cases),
              opacity: 0.95,
              fillColor: getProvinceFillColor(cases),
              fillOpacity: getProvinceFillOpacity(cases),
            };
          }

          return getProvinceFallbackStyle();
        },
        onEachFeature: (feature, layer) => {
          const rawName = feature?.properties?.shapeName || "";
          const normName = normalizeProvinceName(rawName);
          const provData = affectedRegionLookup.get(normName);

          if (provData) {
            const regionSuffix = m.region_suffix({}, { locale: currentLocale });
            const casesLabel = m.confirmed_cases_label({}, { locale: currentLocale });
            const deathsLabel = m.recorded_deaths_label({}, { locale: currentLocale });
            layer.bindTooltip(
              `<strong>${provData.region} ${regionSuffix}</strong><br/>${casesLabel}: ${provData.cases.toLocaleString()}<br/>${deathsLabel}: ${provData.deaths.toLocaleString()} (CFR ${provData.cfr}%)`,
              { sticky: true, className: "custom-map-tooltip" },
            );

            layer.on({
              click: () => {
                trackEvent("click-province-map", {
                  province: provData.region,
                  cases: provData.cases,
                  cfr: provData.cfr,
                });
              },
              mouseover: (e) => {
                const l = e.target;
                l.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.45 });
              },
              mouseout: (e) => {
                const l = e.target;
                const cases = provData.cases || 0;
                l.setStyle({
                  weight: getProvinceWeight(cases),
                  opacity: 0.95,
                  fillOpacity: getProvinceFillOpacity(cases),
                });
              },
            });
          }
        },
      }).addTo(map);
    })
    .catch((err) => {
      console.warn("Failed to load DRC provinces dynamically:", err);
    });

  // ── LAYER 3: Outbreak Location Markers & Flight Corridors ──
  if (corridors) {
    corridors.forEach((c) => {
      L.polyline([c.from, c.to], {
        pane: "corridorsPane",
        color: "rgba(64, 196, 170, 0.55)",
        weight: 2,
        dashArray: "6 5",
        interactive: false,
      }).addTo(map);
    });
  }

  const markerMap = new Map();

  locations.forEach((loc) => {
    const sev = getSeverity(loc);

    const marker = L.circleMarker(loc.center, {
      pane: "bubblesPane",
      radius: sev.radius,
      color: sev.color,
      weight: 2.5,
      fillColor: sev.fill,
      fillOpacity: 1,
      opacity: 0.95,
    }).addTo(map);

    const centerKey = loc.center.join(",");
    markerMap.set(centerKey, marker);
    if (loc.region) {
      markerMap.set(loc.region.toLowerCase(), marker);
      markerMap.set(`${loc.region}, ${loc.country}`.toLowerCase(), marker);
    }
    markerMap.set(loc.country.toLowerCase(), marker);

    marker.on("click", () => {
      trackEvent("click-map-marker", {
        region: loc.region || loc.country,
        country: loc.countryCode,
        cases: loc.cases,
        deaths: loc.deaths,
        status: loc.status,
      });
    });

    marker.bindPopup(getPopupHtml(loc, currentLocale), { maxWidth: 280, closeButton: false });

    if (loc.cases > 500 && !loc.status.includes("Over")) {
      const pulse = L.circleMarker(loc.center, {
        pane: "bubblesPane",
        radius: sev.radius,
        color: "#e5484d",
        weight: 1.5,
        fillColor: "transparent",
        opacity: 0,
        interactive: false,
      }).addTo(map);

      let r = sev.radius;
      const maxR = sev.radius + 20;

      function animate() {
        r += 0.15;
        const t = (r - sev.radius) / (maxR - sev.radius);
        pulse.setRadius(r);
        pulse.setStyle({ opacity: Math.max(0, 0.65 * (1 - t)) });
        if (r >= maxR) r = sev.radius;
        requestAnimationFrame(animate);
      }
      animate();
    }
  });

  // ── LAYER 4: Sidebar Click-to-Zoom Navigation ──
  document.querySelectorAll(".province-item").forEach((item) => {
    item.addEventListener("click", () => {
      const centerStr = item.getAttribute("data-center");
      const region =
        item.getAttribute("data-region") ||
        item.querySelector(".province-name")?.textContent?.trim() ||
        "Unknown";
      const country = item.getAttribute("data-country") || "";
      trackEvent("select-location-sidebar", { region, country });

      if (centerStr) {
        const [lat, lng] = centerStr.split(",").map(Number);
        const zoomLevel = lat > 30 ? 6 : 8;
        map.flyTo([lat, lng], zoomLevel, { duration: 0.8 });

        const marker =
          markerMap.get(centerStr) ||
          markerMap.get(region.toLowerCase()) ||
          markerMap.get(`${region}, ${country}`.toLowerCase()) ||
          markerMap.get(country.toLowerCase());
        if (marker) {
          marker.openPopup();
        }
      }
    });
  });

  // Mobile Bottom-Sheet Toggle
  const panelToggle = document.getElementById("panel-toggle");
  const infoPanel = document.querySelector(".info-panel");
  if (panelToggle && infoPanel) {
    const handleToggle = () => {
      infoPanel.classList.toggle("collapsed");
      trackEvent("toggle-mobile-panel", {
        collapsed: infoPanel.classList.contains("collapsed"),
      });
    };
    panelToggle.addEventListener("click", handleToggle);
    panelToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    });
  }

  // Surveillance Context Disclosure
  const accordion = document.querySelector(".seo-brief-accordion");
  accordion?.addEventListener("toggle", () => {
    trackEvent("toggle-surveillance-brief", {
      open: accordion.hasAttribute("open"),
    });
  });

  // ── LAYER 5: Language Switcher & Localization Controller ──
  function updatePopups(locale) {
    locations.forEach((loc) => {
      const centerKey = loc.center.join(",");
      const marker = markerMap.get(centerKey);
      if (marker) {
        marker.setPopupContent(getPopupHtml(loc, locale));
      }
    });
  }

  function updateTooltips(locale) {
    if (!provincesLayer) return;
    provincesLayer.eachLayer((layer) => {
      const rawName = layer.feature?.properties?.shapeName || "";
      const normName = normalizeProvinceName(rawName);
      const provData = affectedRegionLookup.get(normName);
      if (provData) {
        const regionSuffix = m.region_suffix({}, { locale });
        const casesLabel = m.confirmed_cases_label({}, { locale });
        const deathsLabel = m.recorded_deaths_label({}, { locale });
        layer.unbindTooltip();
        layer.bindTooltip(
          `<strong>${provData.region} ${regionSuffix}</strong><br/>${casesLabel}: ${provData.cases.toLocaleString()}<br/>${deathsLabel}: ${provData.deaths.toLocaleString()} (CFR ${provData.cfr}%)`,
          { sticky: true, className: "custom-map-tooltip" },
        );
      }
    });
  }

  function applyLanguage(newLocale, { isInitial = false } = {}) {
    currentLocale = newLocale;
    try {
      void setLocale(newLocale, { reload: false });
      localStorage.setItem("PARAGLIDE_LOCALE", newLocale);
    } catch {
      // Non-blocking
    }
    document.documentElement.lang = newLocale;
    localizeSeoDocument(document, newLocale);

    // Identify user session language in Umami
    identifySession({
      language: newLocale,
      app_language: newLocale,
    });

    // Synchronize URL query parameter without page reload
    try {
      if (typeof window !== "undefined" && window.location) {
        const url = new URL(window.location.href);
        if (url.searchParams.get("lang") !== newLocale) {
          url.searchParams.set("lang", newLocale);
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch {
      // Non-blocking
    }

    // Track virtual pageview in Umami for user-initiated language switches
    if (!isInitial && typeof window !== "undefined") {
      const umamiTrack = /** @type {any} */ (window).umami?.track;
      if (typeof umamiTrack === "function") {
        try {
          umamiTrack((props) => ({
            ...props,
            url: window.location.pathname + window.location.search,
            title: document.title,
            language: newLocale,
          }));
        } catch {
          // Non-blocking telemetry
        }
      }
    }

    // Toggle active state on buttons
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      const isCurrent = btn.getAttribute("data-lang") === newLocale;
      btn.classList.toggle("active", isCurrent);
      btn.setAttribute("aria-pressed", String(isCurrent));
    });

    // 1. Header & Containers
    const infoPanel = document.querySelector(".info-panel");
    if (infoPanel) {
      infoPanel.setAttribute("aria-label", m.outbreak_intelligence_aria({}, { locale: newLocale }));
    }
    const h1 = document.querySelector(".panel-header h1");
    if (h1) {
      h1.innerHTML = `${m.app_title({}, { locale: newLocale })} <span>${m.app_subtitle({}, { locale: newLocale })}</span>`;
    }
    const switcher = document.querySelector(".lang-switcher");
    if (switcher) {
      switcher.setAttribute("aria-label", m.language_selector_aria({}, { locale: newLocale }));
    }

    // 2. PHEIC Badge
    const pheic = document.querySelector(".pheic-badge");
    if (pheic) {
      pheic.textContent = m.pheic_badge(
        { count: data.summary.affectedCountriesCount },
        { locale: newLocale },
      );
    }

    // 3. Freshness Bar
    const freshnessContainer = document.querySelector(".freshness-bar");
    if (freshnessContainer) {
      const freshness = createFreshnessViewModel(data, newLocale);
      freshnessContainer.outerHTML = freshness.renderHtml();
    }

    // 4. Headline Stat Cards
    const statsGrid = document.querySelector(".stats-grid");
    if (statsGrid) {
      statsGrid.setAttribute("aria-label", m.headline_metrics_aria({}, { locale: newLocale }));
    }
    const casesLabel = document.querySelector(".stat-card.cases .label");
    if (casesLabel) {
      casesLabel.innerHTML = `${m.total_cases({}, { locale: newLocale })} <span class="click-hint">${m.breakdown_hint({}, { locale: newLocale })}</span>`;
    }
    const casesSub = document.querySelector(".stat-card.cases .sub");
    if (casesSub) {
      casesSub.textContent = m.across_zones({ count: locations.length }, { locale: newLocale });
    }

    const deathsLabel = document.querySelector(".stat-card.deaths .label");
    if (deathsLabel) deathsLabel.textContent = m.total_deaths({}, { locale: newLocale });
    const deathsSub = document.querySelector(".stat-card.deaths .sub");
    if (deathsSub) {
      deathsSub.textContent = m.case_fatality(
        { rate: data.summary.overallCfr },
        { locale: newLocale },
      );
    }

    const cfrLabel = document.querySelector(".stat-card.cfr .label");
    if (cfrLabel) cfrLabel.textContent = m.affected_nations({}, { locale: newLocale });
    const cfrSub = document.querySelector(".stat-card.cfr .sub");
    if (cfrSub) cfrSub.textContent = m.cross_border_monitoring({}, { locale: newLocale });

    const zonesLabel = document.querySelector(".stat-card.zones .label");
    if (zonesLabel) zonesLabel.textContent = m.active_hotspots({}, { locale: newLocale });
    const zonesSub = document.querySelector(".stat-card.zones .sub");
    if (zonesSub) zonesSub.textContent = m.confirmed_transmission({}, { locale: newLocale });

    // 5. Spread Curve Chart Section
    const curveCard = document.getElementById("open-timeline-modal");
    if (curveCard) {
      curveCard.setAttribute("aria-label", m.open_timeline_modal_aria({}, { locale: newLocale }));
      const titleEl = curveCard.querySelector(".chart-header h3");
      if (titleEl) {
        titleEl.innerHTML = `${m.spread_curve_title({}, { locale: newLocale })} <span class="click-hint">${m.enlarge_hint({}, { locale: newLocale })}</span>`;
      }
      const tagEl = curveCard.querySelector(".chart-header .chart-tag");
      if (tagEl) tagEl.textContent = m.weekly_cases_fatalities({}, { locale: newLocale });
      const legendEl = curveCard.querySelector(".chart-legend");
      if (legendEl) {
        legendEl.innerHTML = `
          <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #f76b15; display: inline-block;"></span> ${m.cases_legend({}, { locale: newLocale })}</span>
          <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #e5484d; display: inline-block;"></span> ${m.deaths_legend({}, { locale: newLocale })}</span>
        `;
      }
    }

    // 6. Demographics Section
    const demoCard = document.getElementById("open-demographics-modal");
    if (demoCard) {
      demoCard.setAttribute(
        "aria-label",
        m.open_demographics_modal_aria({}, { locale: newLocale }),
      );
      const titleEl = demoCard.querySelector(".chart-header h3");
      if (titleEl) {
        titleEl.innerHTML = `${m.demographics_title({}, { locale: newLocale })} <span class="click-hint">${m.enlarge_hint({}, { locale: newLocale })}</span>`;
      }
      const tagEl = demoCard.querySelector(".chart-header .chart-tag");
      if (tagEl) tagEl.textContent = m.who_cdc_source({}, { locale: newLocale });

      const femaleTitle = demoCard.querySelector(".sex-card.female .sex-title");
      if (femaleTitle) femaleTitle.textContent = m.female_cases({}, { locale: newLocale });
      const femaleSub = demoCard.querySelector(".sex-card.female .sex-sub");
      if (femaleSub && demographics?.sex) {
        femaleSub.textContent = m.pregnant_lactating(
          { count: demographics.sex.pregnantOrLactating },
          { locale: newLocale },
        );
      }

      const maleTitle = demoCard.querySelector(".sex-card.male .sex-title");
      if (maleTitle) maleTitle.textContent = m.male_cases({}, { locale: newLocale });
      const maleSub = demoCard.querySelector(".sex-card.male .sex-sub");
      if (maleSub) maleSub.textContent = m.community_exposure({}, { locale: newLocale });

      const ageHeader = demoCard.querySelector(".age-chart-wrapper .chart-header h4");
      if (ageHeader) ageHeader.textContent = m.cases_by_age_group({}, { locale: newLocale });
      const ageSub = demoCard.querySelector(".age-chart-wrapper .chart-header span");
      if (ageSub) ageSub.textContent = m.cfr_stat({}, { locale: newLocale });

      const hcwBanner = demoCard.querySelector(".hcw-banner");
      if (hcwBanner && demographics?.vulnerableGroups) {
        hcwBanner.innerHTML = `<strong>${m.healthcare_workers({}, { locale: newLocale })}</strong> ${m.hcw_stats({ cases: demographics.vulnerableGroups.healthcareWorkersCases, deaths: demographics.vulnerableGroups.healthcareWorkersDeaths }, { locale: newLocale })}`;
      }
    }

    // 7. Location Section & Sidebar Items
    const provH3 = document.querySelector(".province-section h3");
    if (provH3) provH3.textContent = m.active_locations_title({}, { locale: newLocale });

    document.querySelectorAll(".province-item").forEach((item) => {
      const centerStr = item.getAttribute("data-center");
      const loc = locations.find((l) => l.center.join(",") === centerStr);
      if (loc) {
        const countryLabel = localizeCountry(loc.country, newLocale);
        const regionLabel = loc.region ? `${loc.region} (${countryLabel})` : countryLabel;
        const statusLabel = localizeStatus(loc.status, newLocale);
        const nameEl = item.querySelector(".province-name");
        if (nameEl) nameEl.textContent = regionLabel;
        const statusEl = item.querySelector("div span:last-child");
        if (statusEl) statusEl.textContent = statusLabel;
      }
    });

    // 8. Surveillance Brief
    const briefSummary = document.querySelector(".seo-brief-accordion summary");
    if (briefSummary)
      briefSummary.textContent = m.surveillance_brief_title({}, { locale: newLocale });
    const briefParas = document.querySelectorAll(".seo-brief-content p");
    if (briefParas.length >= 2) {
      briefParas[0].textContent = m.surveillance_brief_p1({}, { locale: newLocale });
      briefParas[1].textContent = m.surveillance_brief_p2({}, { locale: newLocale });
    }

    // 9. Sources Footer
    const sourcesTitle = document.querySelector(".sources strong");
    if (sourcesTitle) sourcesTitle.textContent = m.sources_header({}, { locale: newLocale });

    // 10. Modals
    // Modal 1: Timeline Dialog
    const tBadge = document.querySelector("#timeline-dialog .dialog-badge");
    if (tBadge) tBadge.textContent = m.dialog_badge_timeline({}, { locale: newLocale });
    const tTitle = document.getElementById("timeline-dialog-title");
    if (tTitle) tTitle.textContent = m.timeline_dialog_title({}, { locale: newLocale });
    const tClose = document.getElementById("close-timeline-modal");
    if (tClose) tClose.setAttribute("aria-label", m.close_dialog({}, { locale: newLocale }));

    const tKpiLabels = document.querySelectorAll("#timeline-dialog .kpi-label");
    if (tKpiLabels.length >= 4) {
      tKpiLabels[0].textContent = m.peak_weekly_influx({}, { locale: newLocale });
      tKpiLabels[1].textContent = m.latest_week_influx({}, { locale: newLocale });
      tKpiLabels[2].textContent = m.peak_fatalities({}, { locale: newLocale });
      tKpiLabels[3].textContent = m.active_trajectory({}, { locale: newLocale });
    }
    const tKpiSubs = document.querySelectorAll("#timeline-dialog .kpi-sub");
    if (tKpiSubs.length >= 4 && epiCurve?.length) {
      const peakCasesPoint = epiCurve.reduce(
        (max, p) => (p.weeklyCases > max.weeklyCases ? p : max),
        epiCurve[0],
      );
      const peakDeathsPoint = epiCurve.reduce(
        (max, p) => (p.weeklyDeaths > max.weeklyDeaths ? p : max),
        epiCurve[0],
      );
      const latestEpiPoint = epiCurve[epiCurve.length - 1];
      const prevEpiPoint = epiCurve.length > 1 ? epiCurve[epiCurve.length - 2] : null;
      const { trajectoryPct, isDeclining, sign } = calculateTrajectory(
        latestEpiPoint,
        prevEpiPoint,
      );

      tKpiSubs[0].textContent = m.surveillance_week(
        { week: peakCasesPoint.week },
        { locale: newLocale },
      );
      tKpiSubs[1].textContent = m.surveillance_week(
        { week: latestEpiPoint.week },
        { locale: newLocale },
      );
      tKpiSubs[2].textContent = m.surveillance_week(
        { week: peakDeathsPoint.week },
        { locale: newLocale },
      );
      tKpiSubs[3].textContent = m.vs_previous_week(
        { sign, pct: trajectoryPct },
        { locale: newLocale },
      );

      const tKpiNumbers = document.querySelectorAll("#timeline-dialog .kpi-number");
      if (tKpiNumbers.length >= 4) {
        tKpiNumbers[0].textContent = m.cases_count(
          { count: peakCasesPoint.weeklyCases.toLocaleString() },
          { locale: newLocale },
        );
        tKpiNumbers[1].textContent = m.cases_count(
          { count: latestEpiPoint.weeklyCases.toLocaleString() },
          { locale: newLocale },
        );
        tKpiNumbers[2].textContent = m.deaths_count(
          { count: peakDeathsPoint.weeklyDeaths.toLocaleString() },
          { locale: newLocale },
        );
        tKpiNumbers[3].textContent = isDeclining
          ? m.plateauing({}, { locale: newLocale })
          : m.accelerating({}, { locale: newLocale });
      }
    }

    const tChartH3 = document.querySelector(
      "#timeline-dialog .dialog-chart-wrapper .chart-header h3",
    );
    if (tChartH3) tChartH3.textContent = m.full_curve_timeline({}, { locale: newLocale });
    const tLegend = document.querySelector("#timeline-dialog .dialog-chart-wrapper .chart-legend");
    if (tLegend) {
      tLegend.innerHTML = `
        <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 9px; height: 9px; border-radius: 50%; background: #f76b15; display: inline-block;"></span> ${m.weekly_confirmed_cases_legend({}, { locale: newLocale })}</span>
        <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 9px; height: 9px; border-radius: 50%; background: #e5484d; display: inline-block;"></span> ${m.weekly_fatalities_legend({}, { locale: newLocale })}</span>
      `;
    }
    const tNote = document.querySelector("#timeline-dialog .dialog-note");
    if (tNote) tNote.textContent = m.timeline_note({}, { locale: newLocale });
    const tDone = document.getElementById("timeline-done-btn");
    if (tDone) tDone.textContent = m.dismiss({}, { locale: newLocale });

    // Modal 2: Cases Dialog
    const cBadge = document.querySelector("#cases-dialog .dialog-badge");
    if (cBadge) cBadge.textContent = m.dialog_badge_cases({}, { locale: newLocale });
    const cTitle = document.getElementById("cases-dialog-title");
    if (cTitle) cTitle.textContent = m.cases_dialog_title({}, { locale: newLocale });
    const cClose = document.getElementById("close-cases-modal");
    if (cClose) cClose.setAttribute("aria-label", m.close_dialog({}, { locale: newLocale }));

    const cKpiLabels = document.querySelectorAll("#cases-dialog .kpi-label");
    if (cKpiLabels.length >= 4) {
      cKpiLabels[0].textContent = m.cumulative_confirmed({}, { locale: newLocale });
      cKpiLabels[1].textContent = m.sex_distribution({}, { locale: newLocale });
      cKpiLabels[2].textContent = m.primary_epicenter({}, { locale: newLocale });
      cKpiLabels[3].textContent = m.cross_border_status({}, { locale: newLocale });
    }
    const cKpiSubs = document.querySelectorAll("#cases-dialog .kpi-sub");
    if (cKpiSubs.length >= 4) {
      cKpiSubs[0].textContent = m.across_nations({}, { locale: newLocale });
      cKpiSubs[2].textContent = m.cases_count({ count: "3,912" }, { locale: newLocale });
      cKpiSubs[3].textContent = m.cross_border_countries({}, { locale: newLocale });
    }
    const cContained = document.querySelector("#cases-dialog .kpi-number.contained");
    if (cContained) cContained.textContent = m.contained({}, { locale: newLocale });

    const cChartH3 = document.querySelector("#cases-dialog .dialog-chart-wrapper .chart-header h3");
    if (cChartH3) cChartH3.textContent = m.age_cohort_dist_title({}, { locale: newLocale });
    const cChartTag = document.querySelector(
      "#cases-dialog .dialog-chart-wrapper .chart-header .chart-tag",
    );
    if (cChartTag) cChartTag.textContent = m.demographics_tag({}, { locale: newLocale });
    const cNote = document.querySelector("#cases-dialog .dialog-note");
    if (cNote) cNote.textContent = m.cases_note({}, { locale: newLocale });
    const cDone = document.getElementById("cases-done-btn");
    if (cDone) cDone.textContent = m.dismiss({}, { locale: newLocale });

    // 11. Legend
    const legendH4 = document.querySelector(".legend h4");
    if (legendH4) legendH4.textContent = m.legend_title({}, { locale: newLocale });
    const legendLabels = document.querySelectorAll(".legend .legend-label");
    if (legendLabels.length >= 5) {
      legendLabels[0].textContent = m.gt_500({}, { locale: newLocale });
      legendLabels[1].textContent = m.range_100_500({}, { locale: newLocale });
      legendLabels[2].textContent = m.range_10_99({}, { locale: newLocale });
      legendLabels[3].textContent = m.range_1_9({}, { locale: newLocale });
      legendLabels[4].textContent = m.contained_over({}, { locale: newLocale });
    }

    // 12. Marker Popups & Province Tooltips
    updatePopups(newLocale);
    updateTooltips(newLocale);
  }

  // Bind language switcher button events
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetLang = btn.getAttribute("data-lang");
      if (targetLang === "fr" || targetLang === "en") {
        if (targetLang !== currentLocale) {
          const fromLocale = currentLocale;
          trackEvent("switch-language", {
            language: targetLang,
            locale: targetLang,
            from: fromLocale,
            to: targetLang,
            method: "button",
          });
          applyLanguage(targetLang, { isInitial: false });
        }
      }
    });
  });

  // Handle browser Back / Forward navigation with URL language updates
  window.addEventListener("popstate", () => {
    const poppedInfo = detectInitialLocaleWithSource();
    if (poppedInfo.locale !== currentLocale) {
      const fromLocale = currentLocale;
      trackEvent("switch-language", {
        language: poppedInfo.locale,
        locale: poppedInfo.locale,
        from: fromLocale,
        to: poppedInfo.locale,
        method: "history",
      });
      applyLanguage(poppedInfo.locale, { isInitial: false });
    }
  });

  // Hydrate initial locale if detected or explicitly requested via URL
  if (currentLocale === "fr") {
    applyLanguage("fr", { isInitial: true });
  } else {
    try {
      const params =
        typeof window !== "undefined" && window.location
          ? new URLSearchParams(window.location.search)
          : null;
      const urlLang = params?.get("lang") || params?.get("locale");
      if (urlLang === "en") {
        applyLanguage("en", { isInitial: true });
      }
    } catch {}
  }

  // ── LAYER 6: Live Static Refresh Controller (GitHub Pages & Development) ──
  try {
    createStaticRefreshController({
      baseUrl:
        typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
          ? import.meta.env.BASE_URL
          : "/",
      currentSnapshotId: /** @type {any} */ (data).snapshotId || "",
      onUpdate: (newSnapshot) => {
        trackEvent("snapshot-auto-refreshed", {
          snapshotId: newSnapshot.snapshotId,
          totalCases: newSnapshot.summary?.totalCases,
          totalDeaths: newSnapshot.summary?.totalDeaths,
        });
        applyUpdatedSnapshot(newSnapshot, document, window);
        data = win.__INITIAL_DATA__ || data;
      },
      onError: (err) => {
        console.warn("[Data Delivery Warning] Background refresh:", err);
      },
    });
  } catch (e) {
    console.warn("Could not initialize static refresh controller:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClient);
} else {
  initClient();
}
