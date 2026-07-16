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
import { getLatestAnalyticsMap } from "@/lib/metrics";
import type { Post, Video } from "@/types/db";

export const dynamic = "force-dynamic";

type PostWithVideo = Post & { video: Video };

async function getData() {
  const { data: posts, error } = await supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .eq("status", "publicado")
    .order("published_at", { ascending: false });

  if (error) throw new Error(error.message);

  const analytics = await getLatestAnalyticsMap();

  return { posts: (posts ?? []) as PostWithVideo[], analytics };
}

export default async function MetricsPage() {
  const { posts, analytics } = await getData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Métricas</h1>
        <p className="text-sm text-muted-foreground">Views, curtidas, comentários e compartilhamentos por Reels publicado.</p>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum Reels publicado ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vídeo</TableHead>
              <TableHead>Publicado em</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Likes</TableHead>
              <TableHead className="text-right">Comentários</TableHead>
              <TableHead className="text-right">Compartilhamentos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => {
              const m = analytics.get(post.id);
              return (
                <TableRow key={post.id}>
                  <TableCell className="max-w-56 truncate">{post.video.filename}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {post.published_at
                      ? format(new Date(post.published_at), "PPPp", { locale: ptBR })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">{(m?.views ?? 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{(m?.likes ?? 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{(m?.comments ?? 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{(m?.shares ?? 0).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
