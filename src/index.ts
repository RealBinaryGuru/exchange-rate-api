import express, { Application, Request, Response } from "express";
import puppeteer from "puppeteer";
import NodeCache from "node-cache";

const app: Application = express();
const port = 3000;

// Create a cache instance with a 12-hour expiration (43200 seconds)
const cache = new NodeCache({ stdTTL: 43200, checkperiod: 600 });

app.get("/", async (_req: Request, res: Response) => {
  const nbcUrl: string | undefined = process.env.NBC;

  if (!nbcUrl) {
    res.status(500).send("NBC_MUST_VALID");
    return;
  }

  const cachedData = cache.get("exchangeRates");
  if (cachedData) {
    res.status(200).json(cachedData);
    return;
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(nbcUrl, { waitUntil: "domcontentloaded" });
    await page.setViewport({ width: 1080, height: 1024 });

    await page.focus("#datepicker");
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.click('input[type="submit"]');

    await page.waitForSelector(".tbl-responsive");

    const tableData = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("table.tbl-responsive tbody tr")
      );
      const data = rows.map((row) => {
        const columns = row.querySelectorAll("td");
        if (columns.length === 6) {
          return {
            currency: columns[0].textContent?.trim(),
            symbol: columns[1].textContent?.trim(),
            unit: parseInt(columns[2].textContent?.trim() || "1", 10),
            bid: parseFloat(columns[3].textContent?.trim() || "0"),
            ask: parseFloat(columns[4].textContent?.trim() || "0"),
            average: parseFloat(columns[5].textContent?.trim() || "0"),
          };
        }
      });
      return data.filter((row) => row);
    });

    const officialExchangeRate = await page.evaluate(() => {
      const rateElement = document.querySelector(
        "#fm-ex > table > tbody > tr:nth-child(2) > td > font"
      );
      return rateElement?.textContent?.trim() || null;
    });

    await browser.close();

    const rates = tableData || [];
    if (officialExchangeRate) {
      rates.unshift({
        currency: "Official Exchange Rate",
        symbol: "KHR/USD",
        unit: 1,
        bid: parseFloat(officialExchangeRate),
        ask: parseFloat(officialExchangeRate),
        average: parseFloat(officialExchangeRate),
      });
    }

    const responseData = { date: new Date().toISOString(), rates };

    cache.set("exchangeRates", responseData);

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).send("An error occurred while processing the request.");
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
