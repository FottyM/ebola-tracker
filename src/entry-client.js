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
import { render } from "./entry-server.js";
import { createStaticRefreshController } from "./pipeline/static-client-refresh.js";
import { applyUpdatedSnapshot } from "./pipeline/client-state-updater.js";

/**
 * @typedef {import('../server/etl.js').DynamicOutbreakState} DynamicOutbreakState
 * @typedef {import('../server/etl.js').GeoLocation} GeoLocation
 * @typedef {import('../server/etl.js').EpiCurvePoint} EpiCurvePoint
 * @typedef {import('../server/etl.js').Demographics} Demographics
 */

/**
 * Safe Umami event tracking helper.
 * @param {string} eventName
 * @param {Record<string, string | number | boolean>} [eventData]
 */
function trackEvent(eventName, eventData) {
  if (
    typeof window !== "undefined" &&
    typeof (/** @type {any} */ (window).umami?.track) === "function"
  ) {
    try {
      /** @type {any} */ (window).umami.track(eventName, eventData);
    } catch {
      // Non-blocking telemetry
    }
  }
}

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

  // Pure client-side fallback: If pre-rendered SSR HTML is missing, mount it into document.body
  if (!document.getElementById("map")) {
    const { appHtml } = render(data);
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
        style: (feature) => {
          const name = (feature?.properties?.name || "").toLowerCase();
          const admin = (feature?.properties?.admin || "").toLowerCase();
          const sov = (feature?.properties?.sovereignt || "").toLowerCase();
          const adm0_a3 = (feature?.properties?.adm0_a3 || "").toUpperCase();
          const sov_a3 = (feature?.properties?.sov_a3 || "").toUpperCase();

          const matched =
            affectedCountryLookup.get(adm0_a3) ||
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
              opacity: 0.9,
              fillColor: isContained ? "#30a46c" : "#e5484d",
              fillOpacity: isContained ? 0.08 : 0.06,
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
        onEachFeature: (feature, layer) => {
          const name = feature?.properties?.name || feature?.properties?.admin || "Unknown Country";
          const admin = (feature?.properties?.admin || "").toLowerCase();
          const adm0_a3 = (feature?.properties?.adm0_a3 || "").toUpperCase();
          const sov_a3 = (feature?.properties?.sov_a3 || "").toUpperCase();

          const matched =
            affectedCountryLookup.get(adm0_a3) ||
            affectedCountryLookup.get(sov_a3) ||
            affectedCountryLookup.get(name.toLowerCase()) ||
            affectedCountryLookup.get(admin);

          if (matched) {
            layer.bindTooltip(`<strong>${name}</strong><br/>Status: ${matched.status}`, {
              sticky: true,
              className: "custom-map-tooltip",
            });
          } else {
            layer.bindTooltip(`<strong>${name}</strong>`, {
              sticky: true,
              className: "custom-map-tooltip",
            });
          }
        },
      }).addTo(map);
    })
    .catch((err) => {
      console.warn("Failed to load world countries dynamically:", err);
    });

  // ── LAYER 2: Regional Sub-Provincial Boundaries (Loaded Dynamically) ──
  import("./data/drc-provinces.json")
    .then((mod) => {
      const drcProvincesGeo = mod.default;
      L.geoJSON(/** @type {any} */ (drcProvincesGeo), {
        style: (feature) => {
          const rawName = feature?.properties?.shapeName || "";
          const normName = normalizeProvinceName(rawName);
          const provData = affectedRegionLookup.get(normName);

          if (provData) {
            const cases = provData.cases || 0;
            const fillAlpha = cases > 1000 ? 0.32 : cases > 100 ? 0.24 : cases > 10 ? 0.16 : 0.1;

            return {
              color:
                cases > 1000
                  ? "#e5484d"
                  : cases > 100
                    ? "#f76b15"
                    : cases > 10
                      ? "#f5a623"
                      : "#efc940",
              weight: cases > 1000 ? 2.5 : 1.8,
              opacity: 0.95,
              fillColor: cases > 500 ? "#e5484d" : "#f76b15",
              fillOpacity: fillAlpha,
            };
          }

          return {
            color: "#334155",
            weight: 1,
            opacity: 0.45,
            fillColor: "transparent",
            fillOpacity: 0,
          };
        },
        onEachFeature: (feature, layer) => {
          const rawName = feature?.properties?.shapeName || "";
          const normName = normalizeProvinceName(rawName);
          const provData = affectedRegionLookup.get(normName);

          if (provData) {
            layer.bindTooltip(
              `<strong>${provData.region} Region</strong><br/>Confirmed Cases: ${provData.cases.toLocaleString()}<br/>Deaths: ${provData.deaths.toLocaleString()} (CFR ${provData.cfr}%)`,
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
                const fillAlpha =
                  cases > 1000 ? 0.32 : cases > 100 ? 0.24 : cases > 10 ? 0.16 : 0.1;
                l.setStyle({
                  weight: cases > 1000 ? 2.5 : 1.8,
                  opacity: 0.95,
                  fillOpacity: fillAlpha,
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
        color: "rgba(64, 196, 170, 0.55)",
        weight: 2,
        dashArray: "6 5",
        interactive: false,
      }).addTo(map);
    });
  }

  locations.forEach((loc) => {
    const sev = getSeverity(loc);

    const marker = L.circleMarker(loc.center, {
      radius: sev.radius,
      color: sev.color,
      weight: 2.5,
      fillColor: sev.fill,
      fillOpacity: 1,
      opacity: 0.95,
    }).addTo(map);

    marker.on("click", () => {
      trackEvent("click-map-marker", {
        region: loc.region || loc.country,
        country: loc.countryCode,
        cases: loc.cases,
        deaths: loc.deaths,
        status: loc.status,
      });
    });

    const popupHtml = `
      <div class="popup-content">
        <h3>${loc.region ? `${loc.region}, ${loc.country}` : loc.country}</h3>
        <div class="pop-province">Status: ${loc.status}</div>
        <div class="pop-row"><span class="pop-label">Confirmed Cases</span><span class="pop-val cases">${loc.cases.toLocaleString()}</span></div>
        <div class="pop-row"><span class="pop-label">Recorded Deaths</span><span class="pop-val deaths">${loc.deaths.toLocaleString()}</span></div>
        <div class="pop-row"><span class="pop-label">Case Fatality</span><span class="pop-val cfr">${loc.cfr}%</span></div>
        ${loc.note ? `<div class="pop-note">${loc.note}</div>` : ""}
        <div class="pop-note" style="margin-top:4px;">Reported date: ${loc.lastReported}</div>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 280, closeButton: false });

    if (loc.cases > 500 && !loc.status.includes("Over")) {
      const pulse = L.circleMarker(loc.center, {
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

  // ── LAYER 5: Live Static Refresh Controller (GitHub Pages & Development) ──
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
