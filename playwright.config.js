import { defineConfig, devices } from "@playwright/test";

let webServer = {
  command: "PORT=3001 node server.js",
  url: "http://127.0.0.1:3001",
  reuseExistingServer: !process.env.CI,
  timeout: 30000,
};
if (process.env.E2E_STATIC_PREVIEW) {
  webServer = {
    command: "vp preview --outDir dist --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  };
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 7000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || webServer.url,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer,
});
