import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabaseAdmin } from "@/lib/supabase";
import type { AccountStatsDaily } from "@/types/db";

export const dynamic = "force-dynamic";

async function getData(): Promise<AccountStatsDaily[]> {
  const { data, error } = await supabaseAdmin
    .from("account_stats_daily")
    .select("*")
    .order("stat_date", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export default async function AnalyticsPage() {
  const days = await getData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Resumo diário da conta — atualizado a cada coleta de métricas (a cada ~2h).
        </p>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda sem dados. O primeiro resumo aparece após a primeira coleta de métricas.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Seguidores</TableHead>
              <TableHead className="text-right">Ganhos no dia</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Curtidas</TableHead>
              <TableHead className="text-right">Comentários</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.id}>
                <TableCell className="whitespace-nowrap">
                  {format(new Date(`${day.stat_date}T00:00:00`), "PPP", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  {day.followers_count != null ? day.followers_count.toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {day.followers_gained != null
                    ? `${day.followers_gained >= 0 ? "+" : ""}${day.followers_gained}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">{day.posts_count}</TableCell>
                <TableCell className="text-right">{day.total_views.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">{day.total_likes.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">{day.total_comments.toLocaleString("pt-BR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
