("use strict");

const CONFIG_FILE = "config.yml";
const consoleColors = {
  Cyan: "\x1b[36m%s\x1b[0m",
  Red: "\x1b[31m%s\x1b[0m",
};
const commandArgs = process.argv.slice(2);

/**
 * Returns configuration object by reading "config.yml"
 *
 * @returns {Object}
 */
function getConfiguration() {
  let configuration;

  try {
    configuration = require("js-yaml").load(
      require("fs").readFileSync(CONFIG_FILE, "utf-8")
    );
  } catch (e) {
    console.error(`Error reading ${CONFIG_FILE}`, e);
  }

  return configuration;
}

/**
 * Log info message in console.
 * This method will only log a message when
 * configuration.enable_logging is set to `true`.
 *
 * @param {String} message
 */
function consoleInfo(message) {
  const { enable_logging } = getConfiguration();

  if (enable_logging) console.info(consoleColors.Cyan, message);
}

/**
 * Pauses main thread for provided milliseconds.
 *
 * @param {Number} ms
 */
function sleep(ms) {
  consoleInfo(`Sleep for ${ms} milliseconds.`);
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Parses provided date string and returns
 * ISO date string without time.
 *
 * @param {String} rawDateString
 */
function getISODateString(rawDateString) {
  const parsedDate = new Date(rawDateString);
  const dateWithoutTime = new Date(
    parsedDate.getTime() - parsedDate.getTimezoneOffset() * 60000
  );

  return dateWithoutTime.toISOString().substring(0, 10);
}

/**
 * Returns transactions array of objects
 * where each transaction object contains `date`, `price` & `quantity`.
 *
 * @returns {Array}
 */
async function getTransactions(filePath) {
  const { once } = require("events");
  const {
    source_data: { column_separator, columns },
  } = getConfiguration();
  const transactions = [];

  if (!filePath || !require("fs").existsSync(filePath)) {
    console.error(
      consoleColors.Red,
      `Transaction data file not found: "${filePath}". Provide the path to a transactions file as the first argument.`
    );
    process.exit(1);
  }

  try {
    const lineReader = require("readline").createInterface({
      input: require("fs").createReadStream(filePath),
      crlfDelay: Infinity,
    });
    consoleInfo(`"${filePath}" opened for read.`);

    lineReader.on("line", (line) => {
      const lineParts = line.split(column_separator);

      transactions.push({
        date: getISODateString(lineParts[columns.date]),
        price: lineParts[columns.price],
        quantity: lineParts[columns.quantity],
      });
    });

    await once(lineReader, "close");
    consoleInfo(
      `"${filePath}" closed. Total ${transactions.length} transactions found.`
    );
  } catch (e) {
    console.error(consoleColors.Red, `Error reading "${filePath}"`, e);
    process.exit(1);
  }

  if (transactions.length === 0) {
    console.error(consoleColors.Red, `No transactions found in "${filePath}".`);
    process.exit(1);
  }

  return transactions;
}

/**
 * Returns object containing `browser` & `page` properties
 * referring to Zerodha Console Webpage.
 *
 * @returns {Object}
 */
async function getZerodhaBrowserContext() {
  const puppeteer = require("puppeteer");
  const {
    webpage: { debug_url, base_url },
  } = getConfiguration();

  const browser = await puppeteer.connect({
    browserURL: debug_url,
  });
  consoleInfo(`Puppeteer connected to browser with debug URL "${debug_url}".`);

  const page = (await browser.pages())
    .filter((page) => page.url().includes(base_url))
    .pop();

  if (!page) {
    console.error(
      consoleColors.Red,
      `No open tab matching "${base_url}" found. Log in to Zerodha Console and open the holdings page in your browser.`
    );
    process.exit(1);
  }

  consoleInfo(`Found Zerodha Console webpage with URL "${page.url()}".`);

  return {
    browser,
    page,
  };
}

/**
 * Clears the value of a Vue-bound input element and returns it ready
 * for typing. Modal inputs on Console retain their previous values when
 * the dialog is reopened, so fields must be emptied before populating.
 *
 * @param {Object} element Puppeteer element handle
 */
async function clearInput(element) {
  await element.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * This method adds a Trade transaction on provided
 * console webpage instance with provided transaction object.
 *
 * @param {Object} consoleWebpage Zerodha Console webpage instance
 * @param {Object} transaction Transaction object containing date, price and quantity
 *
 * @returns {Boolean} `true` when trade insertion was successful, false otherwise.
 */
async function addTradeTransaction(consoleWebpage, transaction) {
  const {
    webpage: { selectors },
    source_data: { trade_type },
  } = getConfiguration();
  const transactionJSONString = JSON.stringify(transaction);
  let success = true;

  try {
    // Launch Modal dialog
    const addTradeBtn = await consoleWebpage.$(selectors.add_trade_button);
    await addTradeBtn.click();

    // Wait while dialog is fully open
    await sleep(1000);
    consoleInfo("Add trade modal dialog opened.");

    // Get element references.
    const dateInputEl = await consoleWebpage.$(selectors.date_input);
    const priceInputEl = await consoleWebpage.$(selectors.price_input);
    const quantityInputEl = await consoleWebpage.$(selectors.quantity_input);
    const typeSelectEl = await consoleWebpage.$(selectors.type_select);
    const addBtn = await consoleWebpage.$(selectors.add_button);

    // Clear fields (retain stale values from a previously opened dialog)
    // and populate a trade transaction
    await clearInput(dateInputEl);
    await clearInput(priceInputEl);
    await clearInput(quantityInputEl);
    await dateInputEl.type(transaction.date);
    await priceInputEl.type(transaction.price);
    await quantityInputEl.type(transaction.quantity);
    await typeSelectEl.select(trade_type);
    consoleInfo(`Values populated for transaction ${transactionJSONString}`);

    // Submit trade transaction
    await addBtn.click();
    await consoleWebpage.waitForSelector(selectors.success_notification, {
      visible: true,
    });
    const closeBtn = await consoleWebpage.$(
      selectors.success_notification_close
    );
    if (closeBtn) await closeBtn.click();
    consoleInfo("Trade added successfully.");
    await sleep(1000);
  } catch (e) {
    console.error(
      consoleColors.Red,
      `Error occurred while adding trade for transaction ${transactionJSONString}`
    );
    console.error(consoleColors.Red, e);
    success = false;
  }

  return success;
}

/**
 * Main Function
 */
(async () => {
  const transactions = await getTransactions(commandArgs[0]);
  const zBrowserContext = await getZerodhaBrowserContext();
  let succeeded = true;

  // Iterate over all the transactions
  for (let i = 0; i < transactions.length; i += 1) {
    succeeded = await addTradeTransaction(
      zBrowserContext.page,
      transactions[i]
    );

    // Break immediately if any transaction fails
    if (!succeeded) {
      break;
    }
  }

  // Show summary.
  if (succeeded) {
    consoleInfo(
      `Added ${transactions.length} trade transactions successfully.`
    );
  } else {
    console.error(
      consoleColors.Red,
      "Errors occurred while adding trade transactions."
    );
  }

  // Disconnect browser instance.
  zBrowserContext.browser.disconnect();
  consoleInfo("Puppeteer disconnected.");
})();
