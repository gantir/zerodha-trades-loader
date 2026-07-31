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

  const dump = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tr")]
      .map((r) => [...r.querySelectorAll("th, td")].map((c) => c.textContent.trim()))
      .filter((r) => r.length > 0);
    const header = rows[0];
    const body = rows.slice(1);
    const latest = body.slice(-6);
    const totalQty = body.reduce((s, r) => s + parseFloat(r[3]), 0);
    return {
      header,
      latest,
      totalEntries: body.length,
      totalQty,
      discrepancyText: (document.body.innerText.match(/Discrepancy \(Qty\.\)\s+([\d.]+)/) || [])[1],
    };
  });

  console.log(JSON.stringify(dump, null, 2));

  browser.disconnect();
})();
