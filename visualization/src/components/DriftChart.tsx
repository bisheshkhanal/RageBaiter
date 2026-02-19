import { useMemo } from "react";
import type { UserData } from "../types";

interface DriftChartProps {
  data: UserData;
}

const CHART_WIDTH = 262;
const CHART_HEIGHT = 140;
const PADDING = { top: 20, right: 20, bottom: 30, left: 35 };
const GRID_COLOR = "rgba(255, 255, 255, 0.05)";
const AXIS_COLOR = "rgba(255, 255, 255, 0.15)";

function formatTimeLabel(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function DriftChart({ data }: DriftChartProps) {
  const { vector_history: history, current_vector: current } = data;

  const chartData = useMemo(() => {
    if (history.length === 0) {
      return {
        socialPoints: [],
        economicPoints: [],
        populistPoints: [],
        xLabels: [],
      };
    }

    const entries = [...history];
    const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const yMin = -1;
    const yMax = 1;

    const toX = (index: number, total: number) => {
      if (total === 1) return PADDING.left + plotWidth / 2;
      return PADDING.left + (index / (total - 1)) * plotWidth;
    };

    const toY = (value: number) => {
      const normalized = (value - yMin) / (yMax - yMin);
      return PADDING.top + (1 - normalized) * plotHeight;
    };

    const socialPoints: string[] = [];
    const economicPoints: string[] = [];
    const populistPoints: string[] = [];
    const xLabels: { x: number; label: string }[] = [];

    entries.forEach((entry, i) => {
      const x = toX(i, entries.length);
      const vec = entry.user_vector_snapshot;

      socialPoints.push(`${x},${toY(vec.social)}`);
      economicPoints.push(`${x},${toY(vec.economic)}`);
      populistPoints.push(`${x},${toY(vec.populist)}`);

      if (entries.length <= 6 || i % Math.ceil(entries.length / 6) === 0) {
        xLabels.push({ x, label: formatTimeLabel(entry.timestamp) });
      }
    });

    return {
      socialPoints,
      economicPoints,
      populistPoints,
      xLabels,
      toY,
    };
  }, [history]);

  const isEmpty = history.length === 0;

  const gridLines = useMemo(() => {
    const lines: { y: number; label: string }[] = [];
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const values = [-1, -0.5, 0, 0.5, 1];

    values.forEach((v) => {
      const normalized = (v - -1) / (1 - -1);
      lines.push({
        y: PADDING.top + (1 - normalized) * plotHeight,
        label: v === 0 ? "0" : v.toFixed(1),
      });
    });

    return lines;
  }, []);

  return (
    <div
      className="glass select-none overflow-hidden"
      style={{ width: "310px", padding: "22px 24px" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Vector Drift</h2>
          <p className="text-[10px] text-white/35 mt-0.5">Political position over time</p>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 rounded-full bg-green-400" />
            <span className="text-white/40">Social</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 rounded-full bg-red-400" />
            <span className="text-white/40">Econ</span>
          </div>
        </div>
      </div>

      <div className="relative">
        {isEmpty ? (
          <div
            className="flex items-center justify-center bg-white/[0.02] rounded-lg border border-white/5"
            style={{ height: CHART_HEIGHT }}
          >
            <div className="text-center">
              <svg
                className="w-8 h-8 mx-auto mb-2 text-white/10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
              <p className="text-[10px] text-white/30">Not enough data</p>
            </div>
          </div>
        ) : (
          <svg width={CHART_WIDTH} height={CHART_HEIGHT} className="overflow-visible">
            {gridLines.map((line, i) => (
              <g key={i}>
                <line
                  x1={PADDING.left}
                  y1={line.y}
                  x2={CHART_WIDTH - PADDING.right}
                  y2={line.y}
                  stroke={line.y === chartData.toY?.(0) ? AXIS_COLOR : GRID_COLOR}
                  strokeWidth={line.y === chartData.toY?.(0) ? 1 : 0.5}
                />
                <text
                  x={PADDING.left - 6}
                  y={line.y + 3}
                  textAnchor="end"
                  className="fill-white/30 text-[9px] font-mono"
                >
                  {line.label}
                </text>
              </g>
            ))}

            {chartData.xLabels.map((label, i) => (
              <text
                key={i}
                x={label.x}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                className="fill-white/25 text-[8px] font-mono"
              >
                {label.label}
              </text>
            ))}

            {chartData.socialPoints.length > 1 && (
              <>
                <polyline
                  points={chartData.socialPoints.join(" ")}
                  fill="none"
                  stroke="rgba(34, 197, 94, 0.3)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={chartData.socialPoints.join(" ")}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {chartData.economicPoints.length > 1 && (
              <>
                <polyline
                  points={chartData.economicPoints.join(" ")}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.3)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={chartData.economicPoints.join(" ")}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>
        )}
      </div>

      {!isEmpty && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs font-bold text-green-400 font-mono">
                {current.social >= 0 ? "+" : ""}
                {current.social.toFixed(2)}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">Social</div>
            </div>
            <div>
              <div className="text-xs font-bold text-red-400 font-mono">
                {current.economic >= 0 ? "+" : ""}
                {current.economic.toFixed(2)}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">Economic</div>
            </div>
            <div>
              <div className="text-xs font-bold text-blue-400 font-mono">
                {current.populist >= 0 ? "+" : ""}
                {current.populist.toFixed(2)}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">Populist</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DriftChartSkeleton() {
  return (
    <div
      className="glass select-none overflow-hidden animate-pulse"
      style={{ width: "310px", padding: "22px 24px" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-2.5 w-32 bg-white/5 rounded mt-1" />
        </div>
        <div className="h-3 w-20 bg-white/5 rounded" />
      </div>
      <div className="h-[140px] bg-white/[0.02] rounded-lg border border-white/5" />
    </div>
  );
}
