import { m } from "./paraglide/messages.js";

const SITE_URL = "https://fottym.github.io/ebola-tracker/";

/** @param {"en" | "fr"} locale */
export function getSeoMetadata(locale) {
  const lang = locale === "fr" ? "fr" : "en";
  const url = lang === "fr" ? `${SITE_URL}fr/` : SITE_URL;
  const title = m.seo_title({}, { locale: lang });
  const description = m.seo_description({}, { locale: lang });
  const imageAlt = m.seo_image_alt({}, { locale: lang });

  return {
    lang,
    url,
    title,
    description,
    named: {
      title,
      description,
      keywords: m.seo_keywords({}, { locale: lang }),
      "geo.placename": m.seo_geo_place({}, { locale: lang }),
      "twitter:url": url,
      "twitter:title": title,
      "twitter:description": description,
      "twitter:image:alt": imageAlt,
      "DC.title": title,
      "DC.description": description,
      "DC.subject": m.seo_subject({}, { locale: lang }),
      "DC.language": lang,
      "DC.coverage": m.seo_coverage({}, { locale: lang }),
    },
    properties: {
      "og:url": url,
      "og:site_name": m.seo_site_name({}, { locale: lang }),
      "og:title": title,
      "og:description": description,
      "og:image:alt": imageAlt,
      "og:locale": lang === "fr" ? "fr_CD" : "en_US",
      "og:locale:alternate": lang === "fr" ? "en_US" : "fr_CD",
    },
  };
}

/** @param {string} value */
function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** @param {string} value */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applies localized head metadata to the HTML used by server and static pre-rendering.
 * @param {string} html
 * @param {"en" | "fr"} locale
 */
export function localizeSeoHtml(html, locale) {
  const seo = getSeoMetadata(locale);
  let localized = html
    .replace(/<html lang="[^"]*"/, `<html lang="${seo.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(seo.title)}</title>`)
    .replace(
      /<link rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${escapeAttribute(seo.url)}" />`,
    );

  /** @type {Array<["name" | "property", Record<string, string>]>} */
  const tagGroups = [
    ["name", seo.named],
    ["property", seo.properties],
  ];
  for (const [kind, tags] of tagGroups) {
    for (const [key, value] of Object.entries(tags)) {
      const tag = new RegExp(`<meta\\b(?=[^>]*\\b${kind}="${escapeRegex(key)}")[^>]*>`, "i");
      localized = localized.replace(tag, (match) =>
        match.replace(/\bcontent="[^"]*"/, `content="${escapeAttribute(value)}"`),
      );
    }
  }

  return localized;
}

/**
 * Keeps browser metadata aligned with an in-page language switch.
 * @param {Document} documentRef
 * @param {"en" | "fr"} locale
 */
export function localizeSeoDocument(documentRef, locale) {
  const seo = getSeoMetadata(locale);
  documentRef.title = seo.title;
  const canonical = documentRef.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", seo.url);

  /** @type {Array<["name" | "property", Record<string, string>]>} */
  const tagGroups = [
    ["name", seo.named],
    ["property", seo.properties],
  ];
  for (const [kind, tags] of tagGroups) {
    for (const [key, value] of Object.entries(tags)) {
      const tag = documentRef.querySelector(`meta[${kind}="${key}"]`);
      if (tag) tag.setAttribute("content", value);
    }
  }
}
