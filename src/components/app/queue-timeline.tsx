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
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2.5 text-[13px] font-bold tracking-wide text-primary uppercase">{group.label}</p>
          <div className="flex flex-col gap-3.5 border-l-2 border-border pl-[18px]">
            {group.items.map((item) => (
              <div key={item.id} className="relative flex items-center gap-3">
                <span className="absolute top-1/2 -left-[23px] h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--border)]" />
                <span className="w-11 shrink-0 text-xs font-bold text-[#5B5876]">
                  {formatBrasilia(item.scheduledDatetime, "HH:mm")}
                </span>
                <div className="relative h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[9px] bg-muted">
                  {item.thumbnailUrl ? (
                    <Image src={item.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <VideoIcon className="h-4 w-4 text-[#B4B1C9]" />
                    </div>
                  )}
                </div>
                <span className="min-w-0 truncate text-[13px] font-semibold">{item.filename}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Link href="/queue" className="pl-[52px] text-xs font-semibold text-[#8B88A3]">
        {remaining > 0 ? `+${remaining} mais` : "Ver fila completa"}
      </Link>
    </div>
  );
}
