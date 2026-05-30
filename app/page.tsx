"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Upload,
  TrendingUp,
  Search,
  FileText,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

type StockRow = {
  symbol: string;
  oiChange: number;
  volume: number;
  price: number;
  totalValue: number;
};

const formatValue = (value: number) => value.toLocaleString("en-IN");

export default function StockScanner() {
  const [data, setData] = useState<StockRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cleaned = results.data
          .map((row) => {
            const symbol = row["Symbol"]?.trim() ?? "";
            const oiChange = parseFloat(
              row["%chng in OI"]?.replace(/,/g, "") ?? ""
            );
            const volume = parseInt(
              row["Volume"]?.replace(/,/g, "") ?? "",
              10
            );
            const price = parseFloat(
              row["Underlying value"]?.replace(/,/g, "") ?? ""
            );
            const totalValue = parseFloat(
              row["Total Value"]?.replace(/,/g, "") ?? ""
            );

            return {
              symbol,
              oiChange,
              volume: Number.isNaN(volume) ? 0 : volume,
              price: Number.isNaN(price) ? 0 : price,
              totalValue: Number.isNaN(totalValue) ? 0 : totalValue,
            };
          })
          .filter((stock) => stock.symbol && !Number.isNaN(stock.oiChange));

        setData(cleaned.sort((a, b) => b.oiChange - a.oiChange));
      },
      error: (error) => {
        console.error("CSV parse error:", error);
      },
    });
  };

  const filtered = useMemo(
    () =>
      data.filter((s) =>
        s.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ),
    [data, searchTerm]
  );

  const topPicks = useMemo(() => data.slice(0, 4), [data]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20 backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-slate-400">
                <TrendingUp className="h-4 w-4" />
                NSESPURT
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Monday Stock Scanner
              </h1>
              <p className="mt-2 max-w-2xl text-slate-400">
                Upload the NSE “Spurts-in-OI” CSV to discover high-conviction long trades,
                targets, and stop-loss levels for the week ahead.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-800/90 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 shadow-lg shadow-slate-950/20 transition hover:border-slate-700">
              <Upload className="h-5 w-5" />
              Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </header>

        {data.length === 0 ? (
          <section className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-8 text-center shadow-xl shadow-slate-950/10">
            <div className="mx-auto max-w-2xl">
              <p className="text-2xl font-semibold text-white">No Data Uploaded</p>
              <p className="mt-4 text-slate-400">
                Please upload the "Spurts-in-OI" CSV file from NSE to generate Monday's trade analysis.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-4 py-2 text-sm text-slate-300">
                <FileText className="h-4 w-4" />
                Supported columns: Symbol, %chng in OI, Volume, Underlying value, Total Value
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
              {topPicks.map((stock) => (
                <article
                  key={stock.symbol}
                  className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">High Conviction</p>
                      <p className="mt-3 text-3xl font-semibold text-white">{stock.symbol}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950/80 p-3 text-slate-300">
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

            <section className="rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Market Snapshot</p>
                    <h2 className="text-2xl font-semibold text-white">All stocks</h2>
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
                          <tr key={stock.symbol}>
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
              Target is set at +5% and SL at -4% from LTP. For professional use only.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
