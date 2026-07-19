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

// Ganho = roxo da marca (mais escuro no dia mais recente, mais claro nos
// demais — como no handoff de design). Perda continua vermelho — o mockup
// não modela dias de perda, mas é um comportamento real que precisa
// continuar visualmente distinto (não é coberto pelo design, então mantém a
// lógica de cor por sinal já validada, só troca o tom do "positivo").
const POSITIVE_LATEST = "#6D4CFB";
const POSITIVE_PAST = "#B3A2FA";
const NEGATIVE = "#DC2626";
const BASELINE = "#ECEBF5";
const GRIDLINE = "#ECEBF5";
const MUTED_TEXT = "#8B88A3";

function toDateLabel(dateStr: string, pattern: string) {
  return formatBrasilia(`${dateStr}T00:00:00`, pattern);
}

function DivergingBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: FollowersGainPoint;
  isLast?: boolean;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, isLast = false } = props;
  const isNegative = (payload?.gained ?? 0) < 0;
  const top = height < 0 ? y + height : y;
  const h = Math.abs(height);
  const r = Math.min(4, h / 2);
  const fill = isNegative ? NEGATIVE : isLast ? POSITIVE_LATEST : POSITIVE_PAST;

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
  const color = point.gained < 0 ? NEGATIVE : POSITIVE_LATEST;

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
      <div className="flex justify-end">
        <div className="flex gap-0.5 rounded-[10px] bg-[#F6F5FC] p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                period === p ? "bg-card text-primary shadow-sm" : "text-[#8B88A3]"
              )}
            >
              {p}d
            </button>
          ))}
        </div>
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
          <Bar
            dataKey="gained"
            maxBarSize={24}
            shape={(shapeProps: Parameters<typeof DivergingBar>[0]) => (
              <DivergingBar {...shapeProps} isLast={shapeProps.payload?.date === visible[visible.length - 1]?.date} />
            )}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
