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

  await page.evaluate(() => {
    window.__toasts = window.__toasts || [];
    const groups = document.querySelectorAll(".su-toast-groups .su-toast-group");
    groups.forEach((g) => {
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) {
              window.__toasts.push({ t: new Date().toISOString(), html: n.outerHTML });
            }
          }
        }
      }).observe(g, { childList: true, subtree: true });
    });
  });

  console.log("Toast observer installed on", (await browser.pages()).filter((p) => p.url().includes("console.zerodha.com")).length, "page(s)");
  browser.disconnect();
})();
