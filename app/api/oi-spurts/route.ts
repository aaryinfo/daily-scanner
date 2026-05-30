import { NextResponse } from "next/server";
import Papa from "papaparse";

const NSE_PAGE = "https://www.nseindia.com/market-data/oi-spurts";
const CSV_URL = "https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings?type=underlying&csv=true&partialFileName=Spurts-in-OI-By-Underlying";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
  Referer: NSE_PAGE,
};

const parseFloatValue = (value: unknown) => {
  const numeric = typeof value === "string" ? value.replace(/,/g, "").trim() : String(value).trim();
  const parsed = parseFloat(numeric);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseIntValue = (value: unknown) => {
  const numeric = typeof value === "string" ? value.replace(/,/g, "").trim() : String(value).trim();
  const parsed = parseInt(numeric, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

type RawRow = Record<string, string>;

type StockRow = {
  symbol: string;
  oiChange: number;
  volume: number;
  price: number;
  totalValue: number;
};

const getCookie = async () => {
  const response = await fetch(NSE_PAGE, {
    method: "GET",
    headers: HEADERS,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to retrieve NSE session page: ${response.status} ${response.statusText}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("NSE session cookie not returned.");
  }

  return setCookie.split(";")[0];
};

const normalizeRow = (row: RawRow): StockRow | null => {
  const symbol = (row["Symbol"] || row["symbol"] || "").trim();
  if (!symbol) return null;

  const oiChange = parseFloatValue(row["%chng in OI"] || row["pChangeInOI"] || row["chgInOI"] || row["changeInOI"] || row["pChangeInOI.1"]);
  if (oiChange === null) return null;

  const volume = parseIntValue(row["Volume"] || row["volume"] || row["Volume.1"] || row["volume.1"]);
  const price = parseFloatValue(row["Underlying value"] || row["ltp"] || row["LTP"] || row["Underlying value.1"]);
  const totalValue = parseFloatValue(row["Total Value"] || row["futValue"] || row["Total Value.1"] || "0");

  return {
    symbol,
    oiChange,
    volume,
    price: price ?? 0,
    totalValue: totalValue ?? 0,
  };
};

const parseCsvRows = (text: string): StockRow[] => {
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse errors: ${parsed.errors.map((err) => err.message).join(", ")}`);
  }

  return parsed.data
    .map(normalizeRow)
    .filter((row): row is StockRow => row !== null)
    .sort((a, b) => b.oiChange - a.oiChange);
};

const getISTDate = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}+05:30`);
};

const getMarketState = () => {
  const now = getISTDate();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  if (totalMinutes < 9 * 60 + 15) return "preopen";
  if (totalMinutes <= 15 * 60 + 30) return "open";
  return "closed";
};

export async function GET() {
  try {
    const cookie = await getCookie();
    const response = await fetch(CSV_URL, {
      method: "GET",
      headers: {
        ...HEADERS,
        Accept: "text/csv,application/csv,text/plain;q=0.9,*/*;q=0.8",
        Cookie: cookie,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`NSE CSV request failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const rows = parseCsvRows(text);
    const stats = {
      totalRows: rows.length,
      positiveCount: rows.filter((row) => row.oiChange > 0).length,
      negativeCount: rows.filter((row) => row.oiChange < 0).length,
      neutralCount: rows.filter((row) => row.oiChange === 0).length,
      averageOiChange:
        rows.reduce((sum, row) => sum + row.oiChange, 0) / Math.max(rows.length, 1),
    };

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        marketState: getMarketState(),
        stats,
        topPicks: rows.slice(0, 4),
        rows,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("API /api/oi-spurts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
