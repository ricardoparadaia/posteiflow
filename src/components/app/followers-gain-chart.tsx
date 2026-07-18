"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBrasilia } from "@/lib/format-date";

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

export interface FollowersGainPoint {
  date: string; // stat_date, yyyy-MM-dd
  gained: number;
  /** Se houve um gap na coleta antes deste ponto, a data do último ponto anterior existente. */
  sinceDate: string | null;
}

// Par divergente (polaridade acima/abaixo de zero), não paleta categórica —
// ganho = azul, perda = vermelho, conforme a paleta de referência do design system.
const POSITIVE = "#2a78d6";
const NEGATIVE = "#e34948";
const BASELINE = "#c3c2b7";
const GRIDLINE = "#e1e0d9";
const MUTED_TEXT = "#898781";

function toDateLabel(dateStr: string, pattern: string) {
  return formatBrasilia(`${dateStr}T00:00:00`, pattern);
}

function DivergingBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FollowersGainPoint;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const isNegative = (payload?.gained ?? 0) < 0;
  const top = height < 0 ? y + height : y;
  const h = Math.abs(height);
  const r = Math.min(4, h / 2);
  const fill = isNegative ? NEGATIVE : POSITIVE;

  // Arredonda só a ponta longe do zero — quadrado na base (linha de zero),
  // igual às barras convencionais (dados-fim arredondado, base reta).
  const path = isNegative
    ? `M${x},${top} H${x + width} V${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} H${x + r} Q${x},${top + h} ${x},${top + h - r} Z`
    : `M${x},${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} H${x} Z`;

  return <path d={path} fill={fill} />;
}

function GainTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: FollowersGainPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const sign = point.gained > 0 ? "+" : "";
  const color = point.gained < 0 ? NEGATIVE : POSITIVE;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold" style={{ color }}>
        {sign}
        {point.gained.toLocaleString("pt-BR")} seguidores
      </p>
      <p className="text-muted-foreground">
        {toDateLabel(point.date, "PPP")}
        {point.sinceDate ? ` — desde ${toDateLabel(point.sinceDate, "dd/MM")}` : ""}
      </p>
    </div>
  );
}

export function FollowersGainChart({ data }: { data: FollowersGainPoint[] }) {
  const [period, setPeriod] = useState<Period>(14);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda sem dados suficientes — precisa de pelo menos 2 dias de coleta.
      </p>
    );
  }

  const visible = data.slice(-period);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant="ghost"
            className={cn("h-7 px-2 text-xs", period === p && "bg-accent text-accent-foreground")}
            onClick={() => setPeriod(p)}
          >
            {p}d
          </Button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={visible} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRIDLINE} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => toDateLabel(d, "dd/MM")}
            tick={{ fontSize: 11, fill: MUTED_TEXT }}
            axisLine={{ stroke: BASELINE }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 11, fill: MUTED_TEXT }}
            axisLine={false}
            tickLine={false}
            width={32}
            allowDecimals={false}
          />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={<GainTooltip />} cursor={{ fill: "rgba(137,135,129,0.08)" }} />
          <Bar dataKey="gained" maxBarSize={24} shape={DivergingBar} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
