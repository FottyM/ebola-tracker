// @ts-check

/** @type {Array<[string, Record<string, string | number | boolean> | undefined]>} */
export const pendingUmamiEvents = [];
/** @type {Array<Record<string, string | number | boolean>>} */
export const pendingUmamiIdentifies = [];

/**
 * Flushes queued Umami calls once the script is loaded and ready.
 * @param {any} [targetWindow]
 */
export function flushPendingUmamiTelemetry(targetWindow) {
  const win = targetWindow || (typeof window !== "undefined" ? window : null);
  if (!win) return;
  const umamiObj = win.umami;
  if (!umamiObj) return;

  if (typeof umamiObj.identify === "function") {
    while (pendingUmamiIdentifies.length > 0) {
      const idData = pendingUmamiIdentifies.shift();
      if (idData) {
        try {
          umamiObj.identify(idData);
        } catch {
          // Non-blocking
        }
      }
    }
  }

  if (typeof umamiObj.track === "function") {
    while (pendingUmamiEvents.length > 0) {
      const ev = pendingUmamiEvents.shift();
      if (ev) {
        try {
          umamiObj.track(ev[0], ev[1]);
        } catch {
          // Non-blocking
        }
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => flushPendingUmamiTelemetry(), { once: true });
}

/**
 * Safe Umami event tracking helper with queue fallback.
 * @param {string} eventName
 * @param {Record<string, string | number | boolean>} [eventData]
 * @param {any} [targetWindow]
 */
export function trackEvent(eventName, eventData, targetWindow) {
  const win = targetWindow || (typeof window !== "undefined" ? window : null);
  if (!win) return;
  if (typeof win.umami?.track === "function") {
    try {
      win.umami.track(eventName, eventData);
    } catch {
      // Non-blocking telemetry
    }
  } else {
    pendingUmamiEvents.push([eventName, eventData]);
  }
}

/**
 * Safe Umami session identification helper with queue fallback.
 * @param {Record<string, string | number | boolean>} sessionData
 * @param {any} [targetWindow]
 */
export function identifySession(sessionData, targetWindow) {
  const win = targetWindow || (typeof window !== "undefined" ? window : null);
  if (!win) return;
  if (typeof win.umami?.identify === "function") {
    try {
      win.umami.identify(sessionData);
    } catch {
      // Non-blocking telemetry
    }
  } else {
    pendingUmamiIdentifies.push(sessionData);
  }
}

/**
 * Detects the target locale alongside the detection source (url, storage, browser, or default).
 * @param {any} [targetWindow]
 * @returns {{ locale: "en" | "fr", source: "url" | "storage" | "browser" | "default" }}
 */
export function detectInitialLocaleWithSource(targetWindow) {
  try {
    const win = targetWindow || (typeof window !== "undefined" ? window : null);
    // 1. URL Query Parameter takes absolute highest priority (?lang=fr, ?locale=fr)
    if (win && win.location) {
      const search = win.location.search || "";
      const params = new URLSearchParams(search);
      const urlLang = params.get("lang") || params.get("locale");
      if (urlLang === "fr" || urlLang === "en") {
        return { locale: urlLang, source: "url" };
      }
      // 2. URL Path prefix (/fr or /fr/)
      const pathname = win.location.pathname || "";
      if (/(?:^|\/)fr(?:\/|$)/.test(pathname)) {
        return { locale: "fr", source: "url" };
      }
    }

    // 3. Saved User Preference in localStorage
    if (win && win.localStorage) {
      const saved = win.localStorage.getItem("PARAGLIDE_LOCALE");
      if (saved === "fr" || saved === "en") {
        return { locale: saved, source: "storage" };
      }
    }

    // 4. Browser Navigator Language
    const nav =
      win && win.navigator ? win.navigator : typeof navigator !== "undefined" ? navigator : null;
    if (nav && nav.language && nav.language.toLowerCase().startsWith("fr")) {
      return { locale: "fr", source: "browser" };
    }
  } catch {
    // Ignore storage restrictions
  }
  return { locale: "en", source: "default" };
}

/**
 * Resolves current locale from URL parameter (?lang=fr / ?locale=fr), pathname (/fr),
 * localStorage, or navigator.language.
 * @param {any} [targetWindow]
 * @returns {"en" | "fr"}
 */
export function detectInitialLocale(targetWindow) {
  return detectInitialLocaleWithSource(targetWindow).locale;
}
