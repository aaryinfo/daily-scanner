"use client";

import { useEffect, useState } from "react";

type TradingViewChartProps = {
  symbol: string;
};

const normalizeTradingViewSymbol = (symbol: string) =>
  symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

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

  const initWidget = () => {
    if ((window as any).TradingView) {
      new (window as any).TradingView.widget(widgetConfig);
    }
  };

  const existingScript = document.querySelector(
    `script[src="https://s3.tradingview.com/tv.js"]`
  ) as HTMLScriptElement | null;

  if ((window as any).TradingView) {
    initWidget();
    return;
  }

  if (existingScript) {
    existingScript.addEventListener("load", initWidget, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/tv.js";
  script.async = true;
  script.onload = () => {
    initWidget();
  };
  document.body.appendChild(script);
};

export function TradingViewChart({ symbol }: TradingViewChartProps) {
  const [resolvedSymbol, setResolvedSymbol] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const containerId = `tradingview-${symbol}`;

  useEffect(() => {
    if (!symbol) {
      setResolvedSymbol("");
      setError(null);
      return;
    }

    let isCancelled = false;
    const container = document.getElementById(containerId);

    const initTradingView = async () => {
      setError(null);
      const resolved = await resolveTradingViewSymbol(symbol);
      if (isCancelled) return;

      setResolvedSymbol(resolved);

      if (container) {
        container.innerHTML = "";
        loadTradingView(resolved, containerId);
      }
    };

    initTradingView().catch((loadError) => {
      if (isCancelled) return;
      console.error("TradingView initialization failed:", loadError);
      setError("Unable to load TradingView chart. Please try another symbol.");
      if (container) {
        container.innerHTML = "";
        loadTradingView(symbol, containerId);
      }
    });

    return () => {
      isCancelled = true;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [symbol, containerId]);

  return (
    <>
      {error ? (
        <div className="mb-4 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-800/90 bg-slate-950/70 px-4 py-4">
        <div id={containerId} className="h-[420px] w-full" />
      </div>
    </>
  );
}
