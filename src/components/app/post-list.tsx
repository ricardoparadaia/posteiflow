"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Post, Video } from "@/types/db";

type PostWithVideo = Post & { video: Video };

function statusVariant(status: Post["status"]) {
  switch (status) {
    case "publicado":
      return "default" as const;
    case "erro":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function PostList({
  posts,
  allowCancel = false,
  showError = false,
}: {
  posts: PostWithVideo[];
  allowCancel?: boolean;
  showError?: boolean;
}) {
  const router = useRouter();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    if (!confirm("Cancelar este agendamento?")) return;
    setCancelingId(id);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao cancelar");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelingId(null);
    }
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao reprocessar");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  }

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum agendamento.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vídeo</TableHead>
          <TableHead>Data/hora</TableHead>
          <TableHead>Status</TableHead>
          {showError ? <TableHead>Detalhe</TableHead> : null}
          {allowCancel ? <TableHead className="w-10" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
          <TableRow key={post.id}>
            <TableCell className="max-w-48 truncate">{post.video.filename}</TableCell>
            <TableCell className="whitespace-nowrap">
              {format(new Date(post.scheduled_datetime), "PPPp", { locale: ptBR })}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
            </TableCell>
            {showError ? (
              <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={post.error_message ?? undefined}>
                {post.error_message ?? "—"}
              </TableCell>
            ) : null}
            {allowCancel ? (
              <TableCell>
                {post.status === "pendente" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleCancel(post.id)}
                    disabled={cancelingId === post.id}
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {post.status === "erro" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleRetry(post.id)}
                    disabled={retryingId === post.id}
                    title="Reprocessar"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {retryingId === post.id ? "Reprocessando…" : "Reprocessar"}
                  </Button>
                ) : null}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
