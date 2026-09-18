/**
 * Returns the neutral administrative-boundary style used when a province has
 * no direct province-level observation. It must remain visible over dark tiles.
 * @returns {{color: string, weight: number, opacity: number, fillColor: string, fillOpacity: number}}
 */
export function getProvinceFallbackStyle() {
  return {
    color: "#94a3b8",
    weight: 1.4,
    opacity: 0.85,
    fillColor: "transparent",
    fillOpacity: 0,
  };
}

/** Match GeoJSON English names and Ministry/HDX French names to one province key. */
export function normalizeProvinceName(name) {
  const key = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases = {
    "north kivu": "nord kivu",
    "south kivu": "sud kivu",
    "upper uele": "haut uele",
    "lower uele": "bas uele",
  };
  return aliases[key] || key;
}

/**
 * Prefer official province totals. When the SitRep has no province table,
 * use only the reported health-zone subtotal and mark it as partial.
 * @param {import('../../server/etl.js').GeoLocation[]} locations
 */
export function buildProvinceLookup(locations) {
  const direct = new Map();
  const zoneTotals = new Map();
  for (const loc of locations) {
    if (loc.countryCode !== "COD") continue;
    if (loc.geographicPrecision === "health-zone" && loc.province) {
      const key = normalizeProvinceName(loc.province);
      const previous = zoneTotals.get(key) || {
        region: loc.province,
        cases: 0,
        deaths: 0,
        partial: true,
      };
      previous.cases += loc.cases;
      previous.deaths += loc.deaths;
      zoneTotals.set(key, previous);
    } else if (loc.geographicPrecision === "province" || !loc.geographicPrecision) {
      direct.set(normalizeProvinceName(loc.region), { ...loc, partial: false });
    }
  }
  return new Map([...zoneTotals, ...direct]);
}
