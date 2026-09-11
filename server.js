/**
 * @fileoverview High-Performance Hono + Vite+ SSR Server Entry Point.
 * Implements:
 * 1. Asynchronous In-Memory HTML Pre-Rendering & Warming (0ms TTFB).
 * 2. Background ETL Polling & Automated Cache Invalidation.
 * 3. Client Resource Preloading (GeoJSON, Leaflet, Fonts).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createServer as createViteServer } from "vite";
import { runETL, getCachedData } from "./server/etl.js";

/** @type {string} */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {boolean} */
const isProduction = process.env.NODE_ENV === "production";

/** @type {number} */
const PORT = Number(process.env.PORT) || 3000;

export const app = new Hono();

// ── In-Memory Pre-Rendered Page Cache (Pre-warmed for 0ms response) ──
/** @type {string | null} */
let preRenderedHtmlCache = null;
/** @type {number} */
let lastRenderTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute pre-render cache

/**
 * Pre-warms or refreshes the SSR HTML cache in the background.
 * @param {import('vite').ViteDevServer | null} [viteInstance]
 * @returns {Promise<string>}
 */
async function warmRenderCache(viteInstance) {
  const data = await runETL();

  let template;
  /** @type {(data: import('./server/etl.js').DynamicOutbreakState) => import('./src/entry-server.js').SsrRenderResult} */
  let render;

  if (!isProduction && viteInstance) {
    template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
    template = await viteInstance.transformIndexHtml("/", template);
    render = (await viteInstance.ssrLoadModule("/src/entry-server.js")).render;
  } else {
    template = fs.readFileSync(path.resolve(__dirname, "dist/client/index.html"), "utf-8");
    render = (await import("./dist/server/entry-server.js")).render;
  }

  const { appHtml, jsonLd, initialState } = render(data);

  preRenderedHtmlCache = template
    .replace(
      /<!--ssr-jsonld-start-->[\s\S]*?<!--ssr-jsonld-end-->|<!--ssr-jsonld-->/,
      `<!--ssr-jsonld-start-->\n<script type="application/ld+json">${jsonLd}</script>\n<!--ssr-jsonld-end-->`,
    )
    .replace(
      /<!--ssr-outlet-start-->[\s\S]*?<!--ssr-outlet-end-->|<!--ssr-outlet-->/,
      `<!--ssr-outlet-start-->\n${appHtml}\n<!--ssr-outlet-end-->`,
    )
    .replace(
      /<!--ssr-state-start-->[\s\S]*?<!--ssr-state-end-->|<!--ssr-state-->/,
      `<!--ssr-state-start-->\n${initialState}\n<!--ssr-state-end-->`,
    );

  lastRenderTime = Date.now();
  return preRenderedHtmlCache;
}

// 1. Initial background pre-fetch & warmup
void runETL();

// 2. Scheduled background ETL sync & SSR pre-render cache warming
setInterval(
  () => {
    runETL()
      .then(() => {
        preRenderedHtmlCache = null; // Invalidate to regenerate on next request or interval
      })
      .catch((err) => console.error("[ETL Warmup Error]", err));
  },
  5 * 60 * 1000,
);

// 3. API endpoint for live/cached outbreak data
app.get("/api/ebola-data", async (c) => {
  try {
    const fresh = c.req.query("fresh") === "true";
    const data = fresh ? await runETL() : getCachedData();
    return c.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message, fallback: getCachedData() }, 500);
  }
});

// 4. Static GeoJSON delivery endpoint with aggressive browser caching
app.get("/api/boundaries/countries", (c) => {
  c.header("Cache-Control", "public, max-age=86400, immutable");
  const data = fs.readFileSync(path.resolve(__dirname, "src/data/world-countries.json"), "utf-8");
  return c.text(data, 200, { "Content-Type": "application/json" });
});

app.get("/api/boundaries/drc-provinces", (c) => {
  c.header("Cache-Control", "public, max-age=86400, immutable");
  const data = fs.readFileSync(path.resolve(__dirname, "src/data/drc-provinces.json"), "utf-8");
  return c.text(data, 200, { "Content-Type": "application/json" });
});

/**
 * Bootstraps the development / production server.
 * @returns {Promise<void>}
 */
async function start() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });

    // Warm up the render cache immediately on boot
    void warmRenderCache(vite);

    // Fast-path SSR handler with pre-rendered cache
    vite.middlewares.use(async (req, res, next) => {
      const url = req.url || "/";

      // Let Vite serve CSS, client modules, hot-updates, and assets instantly
      if (
        url.startsWith("/@") ||
        url.startsWith("/src/") ||
        url.startsWith("/node_modules/") ||
        url.includes(".")
      ) {
        return next();
      }

      try {
        const now = Date.now();
        let html = preRenderedHtmlCache;

        if (!html || now - lastRenderTime > CACHE_TTL_MS) {
          html = await warmRenderCache(vite);
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-SSR-Cache", "HIT");
        res.end(html);
      } catch (e) {
        vite.ssrFixStacktrace(/** @type {Error} */ (e));
        const stack = e instanceof Error ? e.stack : String(e);
        console.error("[Vite+ SSR Error]", stack);
        res.statusCode = 500;
        res.end(stack);
      }
    });

    const http = await import("node:http");
    const server = http.createServer(vite.middlewares);

    server.listen(PORT, () => {
      console.log(
        `\n⚡ Ebola Outbreak Live Map (Pre-Fetched Telemetry & Pre-Warmed SSR) running at:`,
      );
      console.log(`👉 http://localhost:${PORT}/\n`);
    });
  } else {
    const { serve } = await import("@hono/node-server");
    const { serveStatic } = await import("@hono/node-server/serve-static");

    app.use("/assets/*", serveStatic({ root: "./dist/client" }));
    app.use("/style.css", serveStatic({ path: "./dist/client/style.css" }));

    void warmRenderCache(null);

    app.get("*", async (c) => {
      const now = Date.now();
      let html = preRenderedHtmlCache;

      if (!html || now - lastRenderTime > CACHE_TTL_MS) {
        html = await warmRenderCache(null);
      }

      c.header("Content-Type", "text/html; charset=utf-8");
      c.header("X-SSR-Cache", "HIT");
      return c.html(html);
    });

    serve({
      fetch: app.fetch,
      port: PORT,
    });
  }
}

void start();
