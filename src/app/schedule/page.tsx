import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/app/schedule-form";
import { PostList } from "@/components/app/post-list";
import { supabaseAdmin } from "@/lib/supabase";
import type { Post, Video } from "@/types/db";

export const dynamic = "force-dynamic";

type PostWithVideo = Post & { video: Video };

async function getData() {
  const [{ data: videos, error: videosError }, { data: posts, error: postsError }] = await Promise.all([
    supabaseAdmin.from("videos").select("*").order("created_at", { ascending: false }),
    supabaseAdmin
      .from("posts")
      .select("*, video:videos(*)")
      .in("status", ["pendente", "processando", "erro"])
      .order("scheduled_datetime", { ascending: true }),
  ]);

  if (videosError) throw new Error(videosError.message);
  if (postsError) throw new Error(postsError.message);

  return {
    videos: (videos ?? []) as Video[],
    posts: (posts ?? []) as PostWithVideo[],
  };
}

export default async function SchedulePage() {
  const { videos, posts } = await getData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Agendar</h1>
        <p className="text-sm text-muted-foreground">Escolha um vídeo, data e hora para publicar como Reels.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo agendamento</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm videos={videos} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Próximos agendamentos ({posts.length})</h2>
        <PostList posts={posts} allowCancel showError />
      </div>
    </div>
  );
}
