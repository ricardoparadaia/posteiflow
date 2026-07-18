import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ACCENT_CLASSES = {
  violet: "bg-violet-100 text-violet-600",
  emerald: "bg-emerald-100 text-emerald-600",
  sky: "bg-sky-100 text-sky-600",
  amber: "bg-amber-100 text-amber-600",
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
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon ? (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              accent ? ACCENT_CLASSES[accent] : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? <p className={cn("mt-1 text-xs", hintClassName ?? "text-muted-foreground")}>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
