import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoUploadForm } from "@/components/app/video-upload-form";
import { VideoList } from "@/components/app/video-list";
import { supabaseAdmin } from "@/lib/supabase";
import type { Video } from "@/types/db";

export const dynamic = "force-dynamic";

async function getVideos(): Promise<Video[]> {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default async function LibraryPage() {
  const videos = await getVideos();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Biblioteca</h1>
        <p className="text-sm text-muted-foreground">Upload e gerenciamento dos vídeos disponíveis para agendar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo vídeo</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoUploadForm />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Vídeos ({videos.length})</h2>
        <VideoList videos={videos} />
      </div>
    </div>
  );
}
