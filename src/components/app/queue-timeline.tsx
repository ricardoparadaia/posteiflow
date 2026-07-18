import Image from "next/image";
import Link from "next/link";
import { Video as VideoIcon } from "lucide-react";
import { formatBrasilia } from "@/lib/format-date";

export interface QueueTimelineItem {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  scheduledDatetime: string;
  dayLabel: string;
}

/** Timeline vertical compacta, agrupada por dia — usada no card "Fila de postagens" do Dashboard. */
export function QueueTimeline({ items, totalCount }: { items: QueueTimelineItem[]; totalCount: number }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>;
  }

  const groups: { label: string; items: QueueTimelineItem[] }[] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === item.dayLabel) {
      lastGroup.items.push(item);
    } else {
      groups.push({ label: item.dayLabel, items: [item] });
    }
  }

  const remaining = totalCount - items.length;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="flex flex-col">
            {group.items.map((item, index) => (
              <div key={item.id} className="flex gap-2">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground/40" />
                  {index < group.items.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                </div>
                <div className="flex min-w-0 items-center gap-2 pb-2.5">
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">
                    {formatBrasilia(item.scheduledDatetime, "HH:mm")}
                  </span>
                  <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-muted">
                    {item.thumbnailUrl ? (
                      <Image src={item.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <VideoIcon className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="truncate text-xs">{item.filename}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Link href="/queue" className="text-center text-xs text-muted-foreground underline">
        {remaining > 0 ? `+${remaining} mais · Ver fila completa` : "Ver fila completa"}
      </Link>
    </div>
  );
}
