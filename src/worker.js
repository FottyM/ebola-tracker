/**
 * @fileoverview Cloudflare Workers entry point for edge deployment.
 * Compatible with Cloudflare Workers / Pages Functions using Web Fetch API standards.
 */

import { Hono } from "hono";
import { render } from "./src/entry-server.js";
import { runETL, getCachedData } from "./server/etl.js";

const app = new Hono();

app.get("/api/ebola-data", async (c) => {
  try {
    const data = await runETL();
    return c.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message, fallback: getCachedData() }, 500);
  }
});

app.get("*", async (c) => {
  const data = await runETL();
  const { appHtml, jsonLd, initialState } = render(data);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>2026 Bundibugyo Ebola Outbreak — DRC & Central Africa Live Tracker</title>
    <meta name="description" content="Live situation map and tracking data for the 2026 Ebola outbreak in DRC." />
    <link rel="stylesheet" href="/style.css" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    ${appHtml}
    <script>window.__INITIAL_DATA__ = ${initialState};</script>
    <script type="module" src="/entry-client.js"></script>
  </body>
</html>`;

  return c.html(html);
});

export default app;
