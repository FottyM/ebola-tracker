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
