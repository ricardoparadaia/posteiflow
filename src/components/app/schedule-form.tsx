"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Video } from "@/types/db";

export function ScheduleForm({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const [videoId, setVideoId] = useState<string>("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!videoId || !date || !time) return;
    setError(null);
    setSubmitting(true);
    try {
      const scheduledDatetime = new Date(`${date}T${time}:00`).toISOString();
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, scheduled_datetime: scheduledDatetime }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Falha ao agendar");
      }
      setVideoId("");
      setDate("");
      setTime("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (videos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum vídeo na biblioteca ainda — envie um vídeo primeiro na tela Biblioteca.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="video">Vídeo</Label>
        <Select value={videoId} onValueChange={setVideoId}>
          <SelectTrigger id="video" className="w-full">
            <SelectValue placeholder="Escolha um vídeo" />
          </SelectTrigger>
          <SelectContent>
            {videos.map((video) => (
              <SelectItem key={video.id} value={video.id}>
                {video.filename}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="date">Data</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="time">Hora</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={!videoId || !date || !time || submitting} className="self-start">
        {submitting ? "Agendando…" : "Salvar agendamento"}
      </Button>
    </form>
  );
}
