import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get("symbol");
  let interval = searchParams.get("interval") || "15m";

  if (!symbol) {
    return NextResponse.json(
      { error: "Symbol is required" },
      { status: 400 }
    );
  }

  try {
    // Map NSE symbols to Yahoo Finance format
    let yfSymbol = symbol;
    if (symbol.startsWith("NSE:")) {
      yfSymbol = symbol.replace("NSE:", "") + ".NS";
    } else if (!symbol.includes(".") && !symbol.includes("^")) {
      // Default to NSE if no suffix provided
      yfSymbol = `${symbol}.NS`;
    }
    
    // Convert 15 to 15m if needed
    if (interval === "15") interval = "15m";
    if (interval === "D") interval = "1d";

    // We want the last 5 days for intraday
    const now = new Date();
    let period1 = new Date();
    period1.setDate(now.getDate() - 5);
    
    if (interval === "1d" || interval === "1D") {
        period1.setDate(now.getDate() - 90); // 90 days for daily
    }

    const queryOptions = {
      period1,
      period2: now,
      interval: interval as "15m" | "1d",
    };

    const result = await yahooFinance.chart(yfSymbol, queryOptions);

    if (!result || !result.quotes || result.quotes.length === 0) {
      return NextResponse.json([]);
    }

    // Format for lightweight-charts
    const chartData = result.quotes.map((quote) => {
      return {
        // lightweight-charts needs UNIX timestamp in seconds
        time: Math.floor(quote.date.getTime() / 1000),
        open: quote.open || 0,
        high: quote.high || 0,
        low: quote.low || 0,
        close: quote.close || 0,
        volume: quote.volume || 0,
      };
    }).filter(quote => quote.open !== null && quote.close !== null);

    // Filter out invalid timestamps (e.g. sometimes Yahoo returns NaN)
    const validData = chartData.filter(d => !isNaN(d.time) && d.close > 0);

    return NextResponse.json(validData);
  } catch (error) {
    console.error(`[ERROR] API /history failed for ${symbol}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch historical data" },
      { status: 500 }
    );
  }
}
