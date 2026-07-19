import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Pares ícone/fundo exatos do handoff de design (um por card de stat).
const ACCENT_CLASSES = {
  violet: "bg-[#EDE9FE] text-[#7C5CFC]",
  emerald: "bg-[#DCFCE7] text-[#16A34A]",
  sky: "bg-[#DBEAFE] text-[#2563EB]",
  amber: "bg-[#FEF3C7] text-[#D97706]",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  hintClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: keyof typeof ACCENT_CLASSES;
  /** Sobrescreve a cor padrão (muted) do hint — usado pra delta com sinal (verde/vermelho). */
  hintClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[13px] font-medium text-[#75718F]">{label}</CardTitle>
        {Icon ? (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              accent ? ACCENT_CLASSES[accent] : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-[28px] font-extrabold tracking-tight">{value}</div>
        {hint ? (
          <p className={cn("mt-1.5 text-[13px] font-semibold break-words", hintClassName ?? "text-[#75718F]")}>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
