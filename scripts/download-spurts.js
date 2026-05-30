const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const NSE_PAGE = "https://www.nseindia.com/market-data/oi-spurts";
const DOWNLOAD_DIR = path.resolve(__dirname, "..", "downloads");
const FALLBACK_BASE = "https://www.nseindia.com/content/nsccl/fao_participant_oi_spurts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const parseCsv = async (text) => {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
};

const ensureDirectory = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const findCsvLink = (html) => {
  const regex = /href=["']([^"']*Spurts-in-OI-By-Underlying[^"']*\.csv)["']/gi;
  const match = regex.exec(html);
  return match ? match[1] : null;
};

const buildAbsoluteUrl = (href) => {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://www.nseindia.com${href}`;
  return `https://www.nseindia.com/${href}`;
};

const fetchWithHeaders = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
      Referer: "https://www.nseindia.com/",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res;
};

const summarize = (rows) => {
  const cleaned = rows
    .map((row) => {
      const symbol = (row["Symbol"] || "").trim();
      const oiChange = parseFloat((row["%chng in OI"] || "").replace(/,/g, ""));
      const volume = parseInt((row["Volume"] || "").replace(/,/g, ""), 10);
      const price = parseFloat((row["Underlying value"] || "").replace(/,/g, ""));
      const totalValue = parseFloat((row["Total Value"] || "").replace(/,/g, ""));
      return {
        symbol,
        oiChange: Number.isNaN(oiChange) ? null : oiChange,
        volume: Number.isNaN(volume) ? 0 : volume,
        price: Number.isNaN(price) ? 0 : price,
        totalValue: Number.isNaN(totalValue) ? 0 : totalValue,
      };
    })
    .filter((item) => item.symbol && item.oiChange !== null);

  const positive = cleaned.filter((item) => item.oiChange > 0);
  const negative = cleaned.filter((item) => item.oiChange < 0);
  const neutral = cleaned.filter((item) => item.oiChange === 0);
  const avgOiChange =
    cleaned.reduce((sum, item) => sum + item.oiChange, 0) / Math.max(cleaned.length, 1);
  const sortDesc = [...cleaned].sort((a, b) => b.oiChange - a.oiChange);
  const sortAsc = [...cleaned].sort((a, b) => a.oiChange - b.oiChange);
  const topVolume = [...cleaned].sort((a, b) => b.volume - a.volume).slice(0, 5);

  return {
    totalRows: cleaned.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    neutralCount: neutral.length,
    averageOiChange: avgOiChange,
    bestLongs: sortDesc.slice(0, 10),
    biggestWeakness: sortAsc.slice(0, 10),
    topVolume,
  };
};

const formatNumber = (value) => {
  return Number.isFinite(value) ? value.toLocaleString("en-IN") : "-";
};

const printSummary = (summary, sourceFile) => {
  console.log(`\nDownloaded: ${sourceFile}`);
  console.log(`Total rows parsed: ${summary.totalRows}`);
  console.log(`Positive OI change: ${summary.positiveCount}`);
  console.log(`Negative OI change: ${summary.negativeCount}`);
  console.log(`Neutral OI change: ${summary.neutralCount}`);
  console.log(`Average OI change: ${summary.averageOiChange.toFixed(2)}%\n`);

  console.log("Top 10 long candidates by OI change:");
  summary.bestLongs.forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.symbol} | OI ${item.oiChange.toFixed(2)}% | LTP ₹${formatNumber(item.price)} | Vol ${formatNumber(item.volume)}`
    );
  });

  console.log("\nTop 10 weakness candidates by OI change:");
  summary.biggestWeakness.forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.symbol} | OI ${item.oiChange.toFixed(2)}% | LTP ₹${formatNumber(item.price)} | Vol ${formatNumber(item.volume)}`
    );
  });

  console.log("\nTop 5 stocks by volume:");
  summary.topVolume.forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.symbol} | Vol ${formatNumber(item.volume)} | OI ${item.oiChange.toFixed(2)}% | LTP ₹${formatNumber(item.price)}`
    );
  });
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  return args.reduce((acc, arg) => {
    if (arg.startsWith("--date=")) {
      acc.date = arg.split("=", 2)[1];
    }
    if (arg.startsWith("--csv-url=")) {
      acc.csvUrl = arg.split("=", 2)[1];
    }
    return acc;
  }, { date: null, csvUrl: null });
};

const buildFallbackCsvUrl = (date) => {
  if (!date) return null;
  const fileName = `Spurts-in-OI-By-Underlying-${date}.csv`;
  return `${FALLBACK_BASE}/${fileName}`;
};

const main = async () => {
  const { date, csvUrl: explicitCsvUrl } = parseArgs();
  try {
    let csvUrl = explicitCsvUrl || null;

    if (!csvUrl) {
      console.log("Fetching NSE oi-spurts page...");
      const pageRes = await fetchWithHeaders(NSE_PAGE);
      const html = await pageRes.text();
      const href = findCsvLink(html);
      if (href) {
        csvUrl = buildAbsoluteUrl(href);
        console.log(`Found CSV URL on page: ${csvUrl}`);
      } else {
        console.warn("No CSV link found on the page.");
      }
    }

    if (!csvUrl && date) {
      csvUrl = buildFallbackCsvUrl(date);
      console.log(`Trying fallback CSV URL for date ${date}: ${csvUrl}`);
    }

    if (!csvUrl) {
      throw new Error(
        "No CSV download URL could be determined. Provide --date=DDMMYYYY or --csv-url=..."
      );
    }

    const fileName = path.basename(new URL(csvUrl).pathname);
    ensureDirectory(DOWNLOAD_DIR);
    const savePath = path.join(DOWNLOAD_DIR, fileName);

    console.log(`Downloading CSV from ${csvUrl}...`);
    const csvRes = await fetchWithHeaders(csvUrl);
    const csvText = await csvRes.text();
    fs.writeFileSync(savePath, csvText, "utf8");
    console.log(`Saved CSV to ${savePath}`);

    console.log("Parsing CSV...");
    const rows = await parseCsv(csvText);
    const summary = summarize(rows);
    printSummary(summary, savePath);
  } catch (error) {
    console.error("Error:", error.message || error);
    process.exit(1);
  }
};

main();
