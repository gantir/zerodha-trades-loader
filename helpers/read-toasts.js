("use strict");

const puppeteer = require("puppeteer");
const DEBUG_URL = "http://127.0.0.1:9222";

(async () => {
  const browser = await puppeteer.connect({ browserURL: DEBUG_URL });
  const page = (await browser.pages())
    .filter((p) => p.url().includes("console.zerodha.com"))
    .pop();
  if (!page) {
    console.error("No console page found");
    browser.disconnect();
    process.exit(1);
  }

  const toasts = await page.evaluate(() => window.__toasts || []);
  console.log("Captured toasts:", toasts.length);
  toasts.forEach((t) => console.log(t.t, t.html));

  browser.disconnect();
})();
