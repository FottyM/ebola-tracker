import { describe, expect, it } from "vite-plus/test";
import { getProvinceFallbackStyle } from "../src/pipeline/map-boundary-styles.js";

describe("DRC province boundary presentation", () => {
  it("keeps unmatched province dividers visible on the dark map", () => {
    expect(getProvinceFallbackStyle()).toEqual({
      color: "#94a3b8",
      weight: 1.4,
      opacity: 0.85,
      fillColor: "transparent",
      fillOpacity: 0,
    });
  });
});
