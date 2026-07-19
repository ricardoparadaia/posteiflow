"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBrasilia } from "@/lib/format-date";

const VIEWS_COLOR = "#6D4CFB";
const REACH_COLOR = "#D8CFFB";
const GRIDLINE = "#F1F0F8";
const MUTED_TEXT = "#8B88A3";

export interface PerformancePoint {
  date: string; // yyyy-MM-dd
  views: number;
  reach: number;
}

function toDateLabel(dateStr: string, pattern: string) {
  return formatBrasilia(`${dateStr}T00:00:00`, pattern);
}

function PerfTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PerformancePoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{toDateLabel(point.date, "PPP")}</p>
      <p style={{ color: VIEWS_COLOR }}>{point.views.toLocaleString("pt-BR")} views</p>
      <p className="text-[#8B7FD1]">{point.reach.toLocaleString("pt-BR")} alcance</p>
    </div>
  );
}

/** Barras duplas de views + alcance por dia — reaproveita account_stats_daily, mesma fonte já usada em "Seguidores ganhos por dia" e "Resumo diário". */
export function PerformanceBarChart({ data }: { data: PerformancePoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Ainda sem dados suficientes.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRIDLINE} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => toDateLabel(d, "dd/MM")}
          tick={{ fontSize: 11, fill: MUTED_TEXT }}
          axisLine={{ stroke: GRIDLINE }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis tick={{ fontSize: 11, fill: MUTED_TEXT }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip content={<PerfTooltip />} cursor={{ fill: "rgba(109,76,251,0.06)" }} />
        <Bar dataKey="views" fill={VIEWS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
        <Bar dataKey="reach" fill={REACH_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
