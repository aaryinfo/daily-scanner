"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, ISeriesApi, Time } from "lightweight-charts";

type TradingViewChartProps = {
  symbol: string;
};

type ChartData = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export function TradingViewChart({ symbol }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!symbol || !chartContainerRef.current) return;

    let isMounted = true;
    let chart: any = null;
    let candlestickSeries: ISeriesApi<"Candlestick"> | null = null;
    let volumeSeries: ISeriesApi<"Histogram"> | null = null;

    const initChart = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Ensure NSE: prefix for the API call
        const nseSymbol = symbol.startsWith("NSE:") ? symbol : `NSE:${symbol}`;
        const response = await fetch(`/api/history?symbol=${encodeURIComponent(nseSymbol)}&interval=15m`);
        if (!response.ok) throw new Error(`API responded with status ${response.status}`);
        
        const data: ChartData[] = await response.json();
        if (!isMounted) return;

        if (!data || data.length === 0) {
          setError(`No data available for ${nseSymbol}`);
          setLoading(false);
          return;
        }

        // Initialize lightweight-charts
        chart = createChart(chartContainerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8", // slate-400
          },
          grid: {
            vertLines: { color: "#1e293b" }, // slate-800
            horzLines: { color: "#1e293b" }, // slate-800
          },
          width: chartContainerRef.current.clientWidth,
          height: 420,
          crosshair: {
            mode: 1, // Normal mode
          },
          rightPriceScale: {
            borderColor: "#334155", // slate-700
          },
          timeScale: {
            borderColor: "#334155", // slate-700
            timeVisible: true,
            secondsVisible: false,
          },
        });

        candlestickSeries = chart.addCandlestickSeries({
          upColor: "#10b981", // emerald-500
          downColor: "#f43f5e", // rose-500
          borderVisible: false,
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
        });

        candlestickSeries.setData(data as any);

        // Add Volume
        const hasVolume = data.some(d => d.volume !== undefined && d.volume > 0);
        if (hasVolume) {
           volumeSeries = chart.addHistogramSeries({
            color: "#334155", // default slate-700
            priceFormat: {
              type: "volume",
            },
            priceScaleId: "", // set as an overlay
          });

          chart.priceScale("").applyOptions({
            scaleMargins: {
              top: 0.8, // 80% empty space at the top
              bottom: 0,
            },
          });

          const volumeData = data.map((d) => ({
            time: d.time as Time,
            value: d.volume || 0,
            color: d.close >= d.open ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)", // transparent green/red
          }));

          volumeSeries.setData(volumeData);
        }

        chart.timeScale().fitContent();
        
        const handleResize = () => {
          if (chartContainerRef.current && chart) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        };
        
        window.addEventListener("resize", handleResize);

      } catch (err: any) {
        if (!isMounted) return;
        console.error("Chart load error:", err);
        setError("Unable to load chart data. Please try another symbol.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initChart();

    return () => {
      isMounted = false;
      if (chart) {
        chart.remove();
      }
    };
  }, [symbol]);

  return (
    <>
      {error ? (
        <div className="mb-4 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-800/90 bg-slate-950/70 px-4 py-4">
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500"></div>
          </div>
        )}
        <div ref={chartContainerRef} className="h-[420px] w-full" />
      </div>
    </>
  );
}
