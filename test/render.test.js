import { describe, it, expect } from "vite-plus/test";
import { render } from "../src/entry-server.js";
import defaultOutbreakData from "../src/data/outbreak-data.js";
import { localizeSeoHtml } from "../src/seo-metadata.js";
import { readFileSync } from "node:fs";

describe("Outbreak Data and SSR Generator", () => {
  it("has valid default outbreak data", () => {
    expect(defaultOutbreakData.summary.totalCases).toBeGreaterThan(0);
    expect(defaultOutbreakData.locations.length).toBeGreaterThan(0);
  });

  it("renders pre-rendered HTML and JSON-LD successfully", () => {
    const { appHtml, jsonLd, initialState } = render(defaultOutbreakData);
    expect(appHtml).toContain('id="map"');
    expect(appHtml).toContain("Ebola Outbreak Tracker");
    expect(jsonLd).toContain("SpecialAnnouncement");
    expect(initialState).toContain(String(defaultOutbreakData.summary.totalCases));
  });

  it("renders sourced Ebola symptoms and locally relevant look-alike illnesses", () => {
    const { appHtml } = render(defaultOutbreakData);

    expect(appHtml).toContain('id="open-symptoms-modal"');
    expect(appHtml).toContain('id="symptoms-dialog"');
    expect(appHtml).toContain('id="close-symptoms-modal"');
    expect(appHtml).toContain('id="symptoms-done-btn"');
    expect(appHtml).toContain('<button type="button" class="symptoms-card"');
    expect(appHtml).toContain('<button type="button" class="dialog-close-btn"');
    expect(appHtml).toContain(
      '<button type="button" class="dialog-action-btn" id="symptoms-done-btn"',
    );
    expect(appHtml).toContain("Early symptoms");
    expect(appHtml).toContain("Later symptoms");
    expect(appHtml).toContain("Malaria");
    expect(appHtml).toContain("Typhoid fever");
    expect(appHtml).toContain("Meningitis");
    expect(appHtml).toContain("Shigellosis");
    expect(appHtml).toContain("Marburg virus disease");
    expect(appHtml).toContain("Bleeding is not always present");
    expect(appHtml).toContain("Symptoms alone cannot diagnose Ebola");
    expect(appHtml).toContain("Call ahead if possible");
    expect(appHtml).toContain("https://www.who.int/news-room/fact-sheets/detail/ebola-disease");
    expect(appHtml).toContain("https://www.cdc.gov/ebola/signs-symptoms/index.html");
  });

  it("renders pre-rendered French HTML and JSON-LD when locale is fr", () => {
    const { appHtml, jsonLd } = render(defaultOutbreakData, { locale: "fr" });
    expect(appHtml).toContain('id="map"');
    expect(appHtml).toContain("Suivi de l'Épidémie d'Ebola");
    expect(appHtml).toContain("Surveillance Active");
    expect(appHtml).toContain("Cas confirmés cumulés");
    expect(appHtml).toContain("Décès cumulés");
    expect(jsonLd).toContain("Surveillance de la flambée de maladie à virus Ebola");
    expect(jsonLd).toContain('"inLanguage":"fr-CD"');
    expect(jsonLd).toContain("Jeu de données de surveillance");
  });

  it("localizes canonical, social and academic metadata for the French page", () => {
    const template = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const html = localizeSeoHtml(template, "fr");
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('href="https://fottym.github.io/ebola-tracker/fr/"');
    expect(html).toContain('property="og:locale" content="fr_CD"');
    expect(html).toContain('name="DC.language" content="fr"');
    expect(html).toContain('name="twitter:title"');
    expect(html).toContain("Maladie à virus Ebola (Bundibugyo) 2026 en RDC");
    expect(html).toContain("Carte épidémiologique et suivi");
  });

  it("resolves language from URL parameters and paths via resolveLocaleFromUrl", async () => {
    const { resolveLocaleFromUrl } = await import("../server.js");
    expect(resolveLocaleFromUrl("http://localhost:3000/?lang=fr")).toBe("fr");
    expect(resolveLocaleFromUrl("http://localhost:3000/?locale=fr")).toBe("fr");
    expect(resolveLocaleFromUrl("http://localhost:3000/fr")).toBe("fr");
    expect(resolveLocaleFromUrl("http://localhost:3000/fr/")).toBe("fr");
    expect(resolveLocaleFromUrl("https://fottym.github.io/ebola-tracker/fr/")).toBe("fr");
    expect(resolveLocaleFromUrl("http://localhost:3000/?lang=en")).toBe("en");
    expect(resolveLocaleFromUrl("http://localhost:3000/")).toBe("en");
  });

  it("renders language buttons with data-umami-event attributes for analytics tracking", () => {
    const { appHtml } = render(defaultOutbreakData, { locale: "en" });
    expect(appHtml).toContain('data-umami-event="switch-language" data-umami-event-language="en"');
    expect(appHtml).toContain('data-umami-event="switch-language" data-umami-event-language="fr"');
  });

  it("detects locale with source priority across various window configurations", async () => {
    const {
      detectInitialLocaleWithSource,
      detectInitialLocale,
      trackEvent,
      identifySession,
      flushPendingUmamiTelemetry,
      pendingUmamiEvents,
      pendingUmamiIdentifies,
    } = await import("../src/pipeline/locale-detector.js");
    expect(typeof detectInitialLocaleWithSource).toBe("function");
    expect(typeof detectInitialLocale).toBe("function");

    // 1. URL search parameter
    const mockWinUrl = {
      location: { search: "?lang=fr", pathname: "/" },
      localStorage: { getItem: () => "en" },
      navigator: { language: "en-US" },
    };
    expect(detectInitialLocaleWithSource(mockWinUrl)).toEqual({ locale: "fr", source: "url" });
    expect(detectInitialLocale(mockWinUrl)).toBe("fr");

    // 2. URL path prefix
    const mockWinPath = {
      location: { search: "", pathname: "/fr/overview" },
      localStorage: { getItem: () => null },
      navigator: { language: "en-US" },
    };
    expect(detectInitialLocaleWithSource(mockWinPath)).toEqual({ locale: "fr", source: "url" });

    expect(
      detectInitialLocaleWithSource({
        location: { search: "", pathname: "/ebola-tracker/fr/" },
        localStorage: { getItem: () => "en" },
        navigator: { language: "en-US" },
      }),
    ).toEqual({ locale: "fr", source: "url" });

    // 3. Saved localStorage preference
    const mockWinStorage = {
      location: { search: "", pathname: "/" },
      localStorage: { getItem: (k) => (k === "PARAGLIDE_LOCALE" ? "fr" : null) },
      navigator: { language: "en-US" },
    };
    expect(detectInitialLocaleWithSource(mockWinStorage)).toEqual({
      locale: "fr",
      source: "storage",
    });

    // 4. Browser navigator language
    const mockWinBrowser = {
      location: { search: "", pathname: "/" },
      localStorage: { getItem: () => null },
      navigator: { language: "fr-BE" },
    };
    expect(detectInitialLocaleWithSource(mockWinBrowser)).toEqual({
      locale: "fr",
      source: "browser",
    });

    // 5. Default fallback
    const mockWinDefault = {
      location: { search: "", pathname: "/" },
      localStorage: { getItem: () => null },
      navigator: { language: "es-ES" },
    };
    expect(detectInitialLocaleWithSource(mockWinDefault)).toEqual({
      locale: "en",
      source: "default",
    });

    // 6. Umami telemetry queueing and execution
    const mockUmami = {
      tracks: [],
      identifies: [],
      track(name, data) {
        this.tracks.push({ name, data });
      },
      identify(data) {
        this.identifies.push(data);
      },
    };

    // When window.umami is available immediately
    const mockWinWithUmami = { umami: mockUmami };
    trackEvent("test-immediate", { val: 1 }, mockWinWithUmami);
    expect(mockUmami.tracks).toContainEqual({ name: "test-immediate", data: { val: 1 } });

    identifySession({ language: "fr" }, mockWinWithUmami);
    expect(mockUmami.identifies).toContainEqual({ language: "fr" });

    // When window.umami is not yet ready (queued)
    const mockWinWithoutUmami = {};
    trackEvent("test-queued", { val: 2 }, mockWinWithoutUmami);
    identifySession({ language: "en" }, mockWinWithoutUmami);
    expect(pendingUmamiEvents.some((e) => e[0] === "test-queued")).toBe(true);
    expect(pendingUmamiIdentifies.some((i) => i.language === "en")).toBe(true);

    // Flush to target window when Umami loads
    flushPendingUmamiTelemetry(mockWinWithUmami);
    expect(mockUmami.tracks.some((t) => t.name === "test-queued")).toBe(true);
    expect(mockUmami.identifies.some((i) => i.language === "en")).toBe(true);
  });
});
