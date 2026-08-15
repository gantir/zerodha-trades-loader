("use strict");

const fs = require("fs");
const path = require("path");

// ISIN -> scheme name mapping.
// Derived from the image: ISIN, Security / Scheme Name.
const SCHEME_NAMES = {
  INF109K01BH2: "ICICI PRU MF-ICICI PRU BALANCE ADVANTAGE FUND-REGULAR PLAN-GROWTH",
  INF194K01391: "BANDHAN MF-BANDHAN FLEXI CAP FUND-REGULAR-GROWTH",
  INF194K01LJ9: "BANDHAN MF-BANDHAN MONEY MARKET FUND -TREASURY- REG PL- - GROWTH",
  INF769K01135: "MIRAE ASSET MF-MIRAE ASSET GREAT CONSUMER FUND-REGULAR-GROWTH",
  INF090I01262: "FRANKLIN INDIA DYNAMIC ASSET ALLOCATION ACTIVE FUND OF FUNDS-GROWTH",
  INF179K01830: "HDFC MF-HDFC BALANCED ADVANTAGE FUND-REGULAR-GROWTH",
  INF769K01101: "MIRAE ASSET MF-MIRAE ASSET LARGE & MIDCAP FUND- REG PLN- GROWTH",
  INF179K01BE2: "HDFC MF-HDFC LARGE CAP FUND-REGULAR-GROWTH",
  INF209K01140: "ABSL MF-ABSL DIGITAL INDIA FUND-GROWTH OPTION",
  INF179K01YV8: "HDFC MF-HDFC LARGE CAP FUND-DIRECT-GROWTH",
  INF109K01BG4: "ICICI PRU MF-ICICI PRU BALANCED ADVANTAGE FUND-IDCW",
  INF740K01QD1: "DSP MF-DSP SMALL CAP FUND-DIRECT PLAN-GR",
  INF740K01797: "DSP MF-DSP SMALL CAP FUND-REGULAR GROWTH OPTION",
};

const TRADE_TYPE = "discrepant"; // matches source_data.trade_type in config.yml
const COLUMN_SEPARATOR = "|"; // matches source_data.column_separator in config.yml

/**
 * Recursively returns all `*.csv` file paths under a directory.
 *
 * @param {String} dir
 * @returns {String[]}
 */
function findCsvFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCsvFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Returns the ISIN derived from a filename like "INF090I01262-Franklin-2.csv".
 *
 * @param {String} filePath
 * @returns {String}
 */
function getIsinFromFileName(filePath) {
  return path.basename(filePath).split("-")[0].toUpperCase();
}

/**
 * Reads a NAV data file (date|price|quantity) and returns
 * combined trade rows as arrays.
 *
 * @param {String} filePath
 * @param {String} isin
 * @returns {Array[]}
 */
function readTrades(filePath, isin) {
  const schemeName = SCHEME_NAMES[isin];
  if (!schemeName) {
    console.warn(`Skipping "${filePath}": no scheme name mapped for ISIN ${isin}.`);
    return [];
  }

  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  return lines.map((line) => {
    const [tradeDate, price, quantity] = line.split(COLUMN_SEPARATOR);
    return [tradeDate, schemeName, isin, TRADE_TYPE, quantity, price];
  });
}

function main() {
  const dataDir = process.argv[2] || path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: "${dataDir}"`);
    process.exit(1);
  }

  const csvFiles = findCsvFiles(dataDir);
  const rows = [];
  const seen = new Set();

  for (const filePath of csvFiles) {
    const isin = getIsinFromFileName(filePath);
    const trades = readTrades(filePath, isin);

    for (const trade of trades) {
      const key = trade.join("|");
      if (seen.has(key)) continue; // drop exact duplicate rows (e.g. overlapping files)
      seen.add(key);
      rows.push(trade);
    }
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));

  const header = "trade_date,scheme name,isin,trade_type,quantity,price";
  const outputPath = path.join(__dirname, "combined_trades.csv");
  fs.writeFileSync(outputPath, [header, ...rows.map((r) => r.join(","))].join("\n") + "\n");

  console.log(`Combined ${rows.length} trades from ${csvFiles.length} files into "${outputPath}".`);
}

main();
