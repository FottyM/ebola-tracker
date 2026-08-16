/**
 * @fileoverview Dynamic Client-Side Hydration Controller.
 * Renders layered GIS boundaries:
 * 1. Global World Countries (all 258 sovereign nations with ISO/name matching)
 * 2. Official Regional Subdivisions / Provinces (DRC 26 provinces + sub-regions)
 * 3. Outbreak Hotspots, Case Fatality markers, Epicenter Pulse beacons, and Medevac Corridors.
 * 4. Interactive Epidemiological Spread Curve Chart (Chart.js / TanStack format).
 */

import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";
import worldCountriesGeo from "./data/world-countries.json";
import drcProvincesGeo from "./data/drc-provinces.json";

// Register Chart.js tree-shakeable components
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

/**
 * @typedef {import('../server/etl.js').DynamicOutbreakState} DynamicOutbreakState
 * @typedef {import('../server/etl.js').GeoLocation} GeoLocation
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
  return shapeName;
}

/**
 * Initializes the epidemiological spread curve chart in the sidebar panel.
 * @param {import('../server/etl.js').EpiCurvePoint[]} epiData
 * @returns {void}
 */
function initEpiChart(epiData) {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("epi-chart"));
  if (!canvas || !epiData || epiData.length === 0) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  new Chart(ctx, {
    type: "line",
    data: {
      labels: epiData.map((d) => d.week),
      datasets: [
        {
          label: "Weekly Cases",
          data: epiData.map((d) => d.weeklyCases),
          borderColor: "#f76b15",
          backgroundColor: "rgba(247, 107, 21, 0.15)",
          borderWidth: 2,
          pointBackgroundColor: "#f76b15",
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
        },
        {
          label: "Weekly Fatalities",
          data: epiData.map((d) => d.weeklyDeaths),
          borderColor: "#e5484d",
          backgroundColor: "rgba(229, 72, 77, 0.10)",
          borderWidth: 1.8,
          pointBackgroundColor: "#e5484d",
          pointRadius: 2.5,
          pointHoverRadius: 4.5,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        tooltip: {
          backgroundColor: "#191d27",
          titleColor: "#e4e8f1",
          bodyColor: "#8891a5",
          borderColor: "#252a36",
          borderWidth: 1,
          padding: 8,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (context) => {
              const val = Number(context.parsed?.y ?? 0);
              return ` ${context.dataset.label || "Value"}: ${val.toLocaleString()}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(37, 42, 54, 0.4)" },
          ticks: {
            color: "#8891a5",
            font: { size: 9, family: "'Inter', sans-serif" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 4,
          },
        },
        y: {
          grid: { color: "rgba(37, 42, 54, 0.4)" },
          ticks: {
            color: "#8891a5",
            font: { size: 9, family: "'JetBrains Mono', monospace" },
            maxTicksLimit: 4,
          },
        },
      },
    },
  });
}

/**
 * Hydrates map with global boundary layers, provincial sub-regions, dynamic markers, and charts.
 * @returns {void}
 */
export function initClient() {
  /** @type {Window & { __INITIAL_DATA__?: DynamicOutbreakState }} */
  const win = window;
  const data = win.__INITIAL_DATA__;

  if (!data) return;

  const { locations, corridors, epiCurve } = data;

  // 1. Initialize Epidemic Spread Curve Chart
  if (epiCurve) {
    initEpiChart(epiCurve);
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

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    minZoom: 3,
    maxZoom: 13,
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

  // ── LAYER 1: Global World Countries ──
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
        const isContained = matched.status.includes("Over") || matched.status.includes("Contained");
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

  // ── LAYER 2: Regional Sub-Provincial Boundaries ──
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
            cases > 1000 ? "#e5484d" : cases > 100 ? "#f76b15" : cases > 10 ? "#f5a623" : "#efc940",
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
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.45 });
          },
          mouseout: (e) => {
            const l = e.target;
            const cases = provData.cases || 0;
            const fillAlpha = cases > 1000 ? 0.32 : cases > 100 ? 0.24 : cases > 10 ? 0.16 : 0.1;
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
      if (centerStr) {
        const [lat, lng] = centerStr.split(",").map(Number);
        const zoomLevel = lat > 30 ? 6 : 8;
        map.flyTo([lat, lng], zoomLevel, { duration: 0.8 });
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClient);
} else {
  initClient();
}
