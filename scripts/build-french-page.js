import fs from "node:fs";
import path from "node:path";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";
import { render } from "../src/entry-server.js";
import { localizeSeoHtml } from "../src/seo-metadata.js";

const distDir = path.resolve("dist");
const englishHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
const { appHtml, jsonLd, initialState } = render(getPrerenderData(), { locale: "fr" });

const frenchHtml = localizeSeoHtml(englishHtml, "fr")
  .replace("<head>", '<head>\n    <base href="../" />')
  .replace(
    /<!--ssr-jsonld-start-->[\s\S]*?<!--ssr-jsonld-end-->/,
    `<!--ssr-jsonld-start-->\n<script type="application/ld+json">${jsonLd}</script>\n<!--ssr-jsonld-end-->`,
  )
  .replace(
    /<!--ssr-outlet-start-->[\s\S]*?<!--ssr-outlet-end-->/,
    `<!--ssr-outlet-start-->\n${appHtml}\n<!--ssr-outlet-end-->`,
  )
  .replace(
    /<!--ssr-state-start-->[\s\S]*?<!--ssr-state-end-->/,
    `<!--ssr-state-start-->\n<script id="ssr-state-data" type="application/json">${initialState}</script>\n<!--ssr-state-end-->`,
  );

const frenchDir = path.join(distDir, "fr");
fs.mkdirSync(frenchDir, { recursive: true });
fs.writeFileSync(path.join(frenchDir, "index.html"), frenchHtml);
