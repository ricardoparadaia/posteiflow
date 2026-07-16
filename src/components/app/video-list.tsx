"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Video } from "@/types/db";

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoList({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este vídeo da biblioteca?")) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Falha ao excluir vídeo");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum vídeo na biblioteca ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden py-0">
            <div className="relative aspect-[9/16] bg-muted">
              {video.thumbnail_url ? (
                <Image
                  src={video.thumbnail_url}
                  alt={video.filename}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem thumbnail
                </div>
              )}
            </div>
            <CardContent className="p-3">
              <p className="truncate text-sm font-medium" title={video.filename}>
                {video.filename}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(video.duration_seconds)}
                {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
              </p>
              {video.caption ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.caption}</p>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-destructive hover:text-destructive"
                onClick={() => handleDelete(video.id)}
                disabled={deletingId === video.id}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingId === video.id ? "Excluindo…" : "Excluir"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
