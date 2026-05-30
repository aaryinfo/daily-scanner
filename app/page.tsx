"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Search,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";

type StockRow = {
  symbol: string;
  oiChange: number;
  volume: number;
  price: number;
  totalValue: number;
};

type ApiResponse = {
  updatedAt: string;
  marketState: "preopen" | "open" | "closed";
  stats: {
    totalRows: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    averageOiChange: number;
  };
  topPicks: StockRow[];
  rows: StockRow[];
};

const formatValue = (value: number) => value.toLocaleString("en-IN");

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
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 9 * 60 + 15) return "preopen";
  if (minutes <= 15 * 60 + 30) return "open";
  return "closed";
};

const getNextMarketOpenDelay = () => {
  const now = getISTDate();
  const nextOpen = new Date(now);
  nextOpen.setHours(9, 15, 0, 0);
  if (now >= nextOpen) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  return nextOpen.getTime() - now.getTime();
};

const hashString = (text: string) =>
  Array.from(text).reduce((hash, char) => hash * 31 + char.charCodeAt(0), 0);

const generateIntradaySeries = (symbol: string, price: number) => {
  const seed = hashString(symbol) % 100;
  const points = Array.from({ length: 20 }, (_, index) => {
    const progress = index / 19;
    const wave = Math.sin(progress * Math.PI * 1.6) * 0.02;
    const drift = progress * 0.01;
    const noise = ((seed % 10) - 5) / 500;
    return price * (1 + wave + drift + noise);
  });
  return points;
};

const buildSvgPath = (points: number[]) => {
  if (points.length === 0) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  return points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = max === min ? 50 : 100 - ((value - min) / (max - min)) * 100;
      return `${x},${y}`;
    })
    .join(" ");
};

const getLevelY = (points: number[], level: number) => {
  if (points.length === 0) return 50;
  const min = Math.min(...points);
  const max = Math.max(...points);
  if (max === min) return 50;
  return 100 - ((level - min) / (max - min)) * 100;
};

const normalizeTradingViewSymbol = (symbol: string) => symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const resolveTradingViewSymbol = async (symbol: string) => {
  const cleaned = normalizeTradingViewSymbol(symbol);
  const query = encodeURIComponent(cleaned);
  const searchUrl = `https://symbol-search.tradingview.com/symbol_search/?text=${query}&exchange=NSE&lang=en`;

  try {
    const response = await fetch(searchUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Search API responded ${response.status}`);
    }

    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      const exactMatch = results.find(
        (result: any) =>
          result.full_name === `NSE:${cleaned}` || result.symbol === cleaned
      );
      return exactMatch?.full_name ?? results[0].full_name ?? `NSE:${cleaned}`;
    }
  } catch (error) {
    console.warn("TradingView symbol lookup failed:", error);
  }

  return `NSE:${cleaned}`;
};

const loadTradingView = (symbol: string, containerId: string) => {
  const tvSymbol = symbol.includes(":") ? symbol : `NSE:${normalizeTradingViewSymbol(symbol)}`;
  const tv = (window as any).TradingView;
  const widgetConfig = {
    container_id: containerId,
    width: "100%",
    height: 420,
    symbol: tvSymbol,
    interval: "15",
    timezone: "Asia/Kolkata",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#0f172a",
    enable_publishing: false,
    allow_symbol_change: true,
    hide_top_toolbar: false,
    save_image: false,
    studies: ["MASimple@tv-basicstudies"],
  };

  if (!tv && !document.querySelector(`script[src="https://s3.tradingview.com/tv.js"]`)) {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      new (window as any).TradingView.widget(widgetConfig);
    };
    document.body.appendChild(script);
  } else {
    new (window as any).TradingView.widget(widgetConfig);
  }
};

export default function StockScanner() {
  const [data, setData] = useState<StockRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [marketState, setMarketState] = useState(getMarketState());
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/oi-spurts");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to fetch live data");
      }
      const json: ApiResponse = await res.json();
      setData(json.rows);
      setLastUpdated(json.updatedAt);
      setMarketState(json.marketState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval: number | undefined;
    let timeout: number | undefined;

    const startLiveRefresh = () => {
      setMarketState(getMarketState());
      if (getMarketState() !== "open") {
        return;
      }

      fetchData();
      interval = window.setInterval(() => {
        if (getMarketState() === "open") {
          fetchData();
        } else {
          if (interval) {
            clearInterval(interval);
          }
          setMarketState(getMarketState());
        }
      }, 5 * 60 * 1000);
    };

    if (getMarketState() === "preopen") {
      timeout = window.setTimeout(() => {
        startLiveRefresh();
      }, getNextMarketOpenDelay());
    } else if (getMarketState() === "open") {
      startLiveRefresh();
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const [tradingViewSymbol, setTradingViewSymbol] = useState<string>("");
  const [tradingViewError, setTradingViewError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedStock) {
      setTradingViewSymbol("");
      setTradingViewError(null);
      return;
    }

    const containerId = `tradingview-${selectedStock.symbol}`;
    const container = document.getElementById(containerId);

    const initTradingView = async () => {
      setTradingViewError(null);
      const resolvedSymbol = await resolveTradingViewSymbol(selectedStock.symbol);
      setTradingViewSymbol(resolvedSymbol);

      if (container) {
        container.innerHTML = "";
        loadTradingView(resolvedSymbol, containerId);
      }
    };

    initTradingView().catch((error) => {
      console.error("TradingView initialization failed:", error);
      setTradingViewError("Unable to load TradingView chart. Please try another symbol.");
      if (container) {
        container.innerHTML = "";
        loadTradingView(selectedStock.symbol, containerId);
      }
    });
  }, [selectedStock]);

  const filtered = useMemo(
    () =>
      data.filter((stock) =>
        stock.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ),
    [data, searchTerm]
  );

  const selectedPoints = useMemo(
    () => (selectedStock ? generateIntradaySeries(selectedStock.symbol, selectedStock.price) : []),
    [selectedStock]
  );

  const bullishPicks = useMemo(
    () => [...data].filter((stock) => stock.oiChange > 0).sort((a, b) => b.oiChange - a.oiChange).slice(0, 4),
    [data]
  );

  const bearishPicks = useMemo(
    () => [...data].filter((stock) => stock.oiChange < 0).sort((a, b) => a.oiChange - b.oiChange).slice(0, 4),
    [data]
  );

  const targetY = selectedStock ? getLevelY(selectedPoints, selectedStock.price * 1.05) : 50;
  const stopY = selectedStock ? getLevelY(selectedPoints, selectedStock.price * 0.96) : 50;

  const lastUpdatedText = lastUpdated
    ? new Date(lastUpdated).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20 backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-slate-400">
                <TrendingUp className="h-4 w-4" />
                NSE LIVE SCANNER
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Next Day Stock Scanner
              </h1>
              <p className="mt-2 max-w-2xl text-slate-400">
                Live NSE OI Spurts data is fetched automatically between 09:15 and 15:30 IST.
                The page refreshes every 5 minutes while the market is open.
              </p>
            </div>
            <div className="grid gap-3 sm:auto-cols-max sm:grid-flow-col sm:items-center">
              <div className="rounded-3xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{marketState === "open" ? "Market Open" : marketState === "preopen" ? "Pre-open" : "Market Closed"}</span>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Last update: {lastUpdatedText}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-rose-200 shadow-xl shadow-rose-500/10">
            <p className="text-xl font-semibold">Live fetch failed</p>
            <p className="mt-4 text-slate-300">{error}</p>
          </section>
        ) : data.length === 0 ? (
          <section className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-8 text-center shadow-xl shadow-slate-950/10">
            <div className="mx-auto max-w-2xl">
              <p className="text-2xl font-semibold text-white">Waiting for live NSE data</p>
              <p className="mt-4 text-slate-400">
                {marketState === "preopen"
                  ? "The market will begin live updates from 09:15 IST. Keep this page open to start automatic downloads."
                  : marketState === "open"
                  ? "Fetching live data now. Please wait a few seconds."
                  : "Market is closed after 15:30 IST. Data will stop refreshing until the next session."}
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
              {bullishPicks.map((stock) => (
                <article
                  key={`bullish-${stock.symbol}`}
                  onClick={() => setSelectedStock(stock)}
                  className="cursor-pointer rounded-3xl border border-emerald-500/20 bg-slate-950/90 p-6 shadow-xl shadow-slate-950/20 transition hover:border-emerald-400 hover:bg-slate-900/100"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Bullish Pick</p>
                      <p className="mt-3 text-3xl font-semibold text-white">{stock.symbol}</p>
                    </div>
                    <div className="rounded-3xl bg-emerald-950/20 p-3 text-emerald-300">
                      <ArrowUpRight className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <div className="rounded-3xl bg-slate-950/80 p-4">
                      <p className="text-sm text-slate-400">Entry Zone</p>
                      <p className="mt-2 text-2xl font-semibold text-white">₹{formatValue(stock.price)}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <p className="text-sm text-slate-400">Target</p>
                        <p className="mt-2 text-xl font-semibold text-emerald-200">
                          ₹{formatValue(Math.round(stock.price * 1.05))}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
                        <p className="text-sm text-slate-400">Stop Loss</p>
                        <p className="mt-2 text-xl font-semibold text-rose-200">
                          ₹{formatValue(Math.round(stock.price * 0.96))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-400">
                    <span>{formatValue(stock.volume)} Vol</span>
                    <span>{stock.totalValue ? `₹${formatValue(stock.totalValue)}` : "-"}</span>
                  </div>
                </article>
              ))}
            </section>

            {bearishPicks.length > 0 && (
              <section className="grid gap-6 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
                {bearishPicks.map((stock) => (
                  <article
                    key={`bearish-${stock.symbol}`}
                    onClick={() => setSelectedStock(stock)}
                    className="cursor-pointer rounded-3xl border border-rose-500/20 bg-slate-950/90 p-6 shadow-xl shadow-slate-950/20 transition hover:border-rose-400 hover:bg-slate-900/100"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm uppercase tracking-[0.3em] text-rose-300">Bearish Pick</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{stock.symbol}</p>
                      </div>
                      <div className="rounded-3xl bg-rose-950/20 p-3 text-rose-300">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <div className="rounded-3xl bg-slate-950/80 p-4">
                        <p className="text-sm text-slate-400">Entry Zone</p>
                        <p className="mt-2 text-2xl font-semibold text-white">₹{formatValue(stock.price)}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <p className="text-sm text-slate-400">Target</p>
                          <p className="mt-2 text-xl font-semibold text-emerald-200">
                            ₹{formatValue(Math.round(stock.price * 1.05))}
                          </p>
                        </div>
                        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
                          <p className="text-sm text-slate-400">Stop Loss</p>
                          <p className="mt-2 text-xl font-semibold text-rose-200">
                            ₹{formatValue(Math.round(stock.price * 0.96))}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-400">
                      <span>{formatValue(stock.volume)} Vol</span>
                      <span>{stock.totalValue ? `₹${formatValue(stock.totalValue)}` : "-"}</span>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Market Snapshot</p>
                    <h2 className="text-2xl font-semibold text-white">All symbols</h2>
                  </div>

                  <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by symbol"
                      className="w-full rounded-3xl border border-slate-800/90 bg-slate-950/90 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-3xl border border-slate-800/90 bg-slate-950/80">
                  <table className="min-w-full divide-y divide-slate-800 text-left">
                    <thead className="bg-slate-950/90">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Symbol</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LTP</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">OI Change %</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Volume</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filtered.map((stock) => {
                        const status =
                          stock.oiChange > 15
                            ? "BREAKOUT"
                            : stock.oiChange > 0
                            ? "STRENGTH"
                            : "WEAKNESS";
                        const badgeClass =
                          stock.oiChange > 15
                            ? "bg-emerald-500/10 text-emerald-300"
                            : stock.oiChange > 0
                            ? "bg-blue-500/10 text-blue-300"
                            : "bg-slate-800 text-slate-400";

                        return (
                          <tr
                          key={stock.symbol}
                          onClick={() => setSelectedStock(stock)}
                          className="cursor-pointer transition hover:bg-slate-900"
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">{stock.symbol}</td>
                          <td className="px-4 py-4 text-sm text-slate-300">₹{formatValue(stock.price)}</td>
                          <td className="px-4 py-4 text-sm text-slate-200">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${stock.oiChange >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                              {stock.oiChange > 0 ? "▲" : "▼"} {Math.abs(stock.oiChange).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">{formatValue(stock.volume)}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                              {status}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}

        <footer className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 text-slate-400 shadow-xl shadow-slate-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <AlertCircle className="h-4 w-4" />
              <span>Scanner Logic:</span>
            </div>
            <p className="max-w-3xl text-sm leading-6">
              This tool identifies long build-up using price stability and open interest spikes.
              Target is set at +5% and SL at -4% from LTP. For educational use only.
            </p>
          </div>
        </footer>
      </div>

      {selectedStock ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-700/90 bg-slate-900/95 shadow-2xl shadow-slate-950/60">
            <div className="relative flex items-start justify-between gap-4 border-b border-slate-800/90 bg-slate-950/90 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Intraday chart</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">{selectedStock.symbol}</h2>
                <p className="mt-2 text-sm text-slate-400">Entry, target, and stop-loss levels for the current live scan.</p>
              </div>
              <button
                onClick={() => setSelectedStock(null)}
                className="absolute right-4 top-4 rounded-full border border-slate-700/80 bg-slate-950/80 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-800/90 bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Entry</p>
                  <p className="mt-2 text-2xl font-semibold text-white">₹{formatValue(selectedStock.price)}</p>
                </div>
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-sm text-slate-400">Target</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-200">₹{formatValue(Math.round(selectedStock.price * 1.05))}</p>
                </div>
                <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4">
                  <p className="text-sm text-slate-400">Stop Loss</p>
                  <p className="mt-2 text-2xl font-semibold text-rose-200">₹{formatValue(Math.round(selectedStock.price * 0.96))}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800/90 bg-slate-950/90 p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Intraday Price Movement</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Live TradingView chart for {tradingViewSymbol || `NSE:${selectedStock.symbol}`}
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-300">Live chart</div>
                </div>
                {tradingViewError ? (
                  <div className="mt-4 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
                    {tradingViewError}
                  </div>
                ) : null}
                <div className="relative overflow-hidden rounded-[2rem] border border-slate-800/90 bg-slate-950/70 px-4 py-4">
                  <div
                    id={`tradingview-${selectedStock.symbol}`}
                    className="h-[420px] w-full"
                  />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-slate-400">Target line</p>
                    <p className="mt-2 text-white">₹{formatValue(Math.round(selectedStock.price * 1.05))}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                    <p className="text-slate-400">Stop-loss line</p>
                    <p className="mt-2 text-white">₹{formatValue(Math.round(selectedStock.price * 0.96))}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
