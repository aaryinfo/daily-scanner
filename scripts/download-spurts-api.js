const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const NSE_PAGE = "https://www.nseindia.com/market-data/oi-spurts";
const DOWNLOAD_DIR = path.resolve(__dirname, "..", "downloads");
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

const parseArgs = () => {
  const args = process.argv.slice(2);
  return args.reduce(
    (acc, arg) => {
      if (arg.startsWith("--date=")) {
        acc.date = arg.split("=", 2)[1];
      }
      if (arg.startsWith("--type=")) {
        acc.type = arg.split("=", 2)[1];
      }
      if (arg.startsWith("--csv-url=")) {
        acc.csvUrl = arg.split("=", 2)[1];
      }
      return acc;
    },
    { date: null, type: "underlying", csvUrl: null }
  );
};

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN");
};

const summarize = (rows) => {
  const cleaned = rows
    .map((row) => {
      const symbol = (row["Symbol"] || row["symbol"] || "").toString().trim();
      const oiChange = parseFloat(
        (row["%chng in OI"] || row["pChangeInOI"] || "").toString().replace(/,/g, "")
      );
      const volume = parseInt((row["Volume"] || row["volume"] || "").toString().replace(/,/g, ""), 10);
      const price = parseFloat((row["Underlying value"] || row["ltp"] || "").toString().replace(/,/g, ""));
      const totalValue = parseFloat((row["Total Value"] || row["futValue"] || "").toString().replace(/,/g, ""));

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
  const avgOiChange = cleaned.reduce((sum, item) => sum + item.oiChange, 0) / Math.max(cleaned.length, 1);

  const bestLongs = [...cleaned].sort((a, b) => b.oiChange - a.oiChange).slice(0, 10);
  const biggestWeakness = [...cleaned].sort((a, b) => a.oiChange - b.oiChange).slice(0, 10);
  const topVolume = [...cleaned].sort((a, b) => b.volume - a.volume).slice(0, 5);

  return {
    totalRows: cleaned.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    neutralCount: neutral.length,
    averageOiChange: avgOiChange,
    bestLongs,
    biggestWeakness,
    topVolume,
  };
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

const fetchWithHeaders = async (url, options = {}) => {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
    Referer: NSE_PAGE,
    ...options.headers,
  };

  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res;
};

const extractCookie = (setCookieHeader) => {
  if (!setCookieHeader) return null;
  if (Array.isArray(setCookieHeader)) {
    return setCookieHeader.map((cookie) => cookie.split(";")[0]).join("; ");
  }
  return setCookieHeader.split(";")[0];
};

const getCsvUrl = (type = "underlying", date = null) => {
  if (type === "contracts") {
    return new URL(
      `/api/live-analysis-oi-spurts-contracts?type=contracts&csv=true&partialFileName=Spurts-in-OI-By-Contracts`,
      "https://www.nseindia.com"
    ).toString();
  }
  return new URL(
    `/api/live-analysis-oi-spurts-underlyings?type=underlying&csv=true&partialFileName=Spurts-in-OI-By-Underlying`,
    "https://www.nseindia.com"
  ).toString();
};

const main = async () => {
  const { date, type, csvUrl: explicitCsvUrl } = parseArgs();
  try {
    let csvUrl = explicitCsvUrl || getCsvUrl(type, date);
    ensureDirectory(DOWNLOAD_DIR);

    console.log("Fetching NSE page to initialize session...");
    const pageRes = await fetchWithHeaders(NSE_PAGE);
    const cookie = extractCookie(pageRes.headers.get("set-cookie"));
    if (cookie) {
      console.log("Session cookie acquired.");
    }

    console.log(`Downloading CSV from ${csvUrl}...`);
    const csvRes = await fetchWithHeaders(csvUrl, {
      headers: {
        Accept: "text/csv,application/csv,text/plain;q=0.9,*/*;q=0.8",
      },
      cookie,
    });

    const contentDisposition = csvRes.headers.get("content-disposition") || "";
    const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    let fileName = fileNameMatch
      ? fileNameMatch[1]
      : date
      ? `Spurts-in-OI-By-Underlying-${date}.csv`
      : `Spurts-in-OI-By-Underlying.csv`;

    fileName = fileName.replace(
      /^(Spurts-in-OI-)?Spurts-in-OI-(Spurts-in-OI-By-.*)$/,
      "$2"
    );

    const csvText = await csvRes.text();
    const savePath = path.join(DOWNLOAD_DIR, fileName);
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
