import { defineConfig, type Plugin } from "vite-plus";
import { render } from "./src/entry-server.js";
import { getPrerenderData } from "./server/pipeline/prerender-loader.js";

/**
 * Vite plugin that pre-renders static HTML for:
 * 1. Vite dev server on port 5173 (eliminating blank page without needing Node SSR server).
 * 2. Static builds (GitHub Pages / SSG), injecting the pre-rendered UI and JSON-LD.
 * Bypasses transformation if server.js is running in middlewareMode.
 * @returns {Plugin}
 */
function ebolaPrerenderPlugin(): Plugin {
  return {
    name: "ebola-prerender",
    transformIndexHtml(html, ctx) {
      if (ctx.server?.config.server.middlewareMode) {
        return html;
      }
      const data = getPrerenderData();
      const { appHtml, jsonLd, initialState } = render(data as Parameters<typeof render>[0]);
      return html
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
    },
  };
}

export default defineConfig({
  base: process.env.BASE_URL || "./",
  plugins: [ebolaPrerenderPlugin()],
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
