"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser, VIDEOS_BUCKET } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  thumbnailBlob: Blob | null;
}

/** Lê duração/resolução no browser e captura um frame como thumbnail via <video> + <canvas>. */
function extractVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.muted = true;
    videoEl.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

    videoEl.onloadedmetadata = () => {
      const seekTo = Math.min(1, videoEl.duration / 2 || 0);
      videoEl.currentTime = seekTo;
    };

    videoEl.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            duration: videoEl.duration,
            width: videoEl.videoWidth,
            height: videoEl.videoHeight,
            thumbnailBlob: blob,
          });
        },
        "image/jpeg",
        0.85
      );
    };

    videoEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler o vídeo selecionado"));
    };
  });
}

type Status = "idle" | "reading" | "uploading" | "saving" | "error";

// Formatos aceitos pela Content Publishing API do Instagram para Reels
// (container .mp4 ou .mov, codec H.264/AAC).
const ALLOWED_EXTENSIONS = [".mp4", ".mov"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function VideoUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status === "reading" || status === "uploading" || status === "saving";

  function handleFileChange(selected: File | null) {
    setError(null);
    if (selected && !hasAllowedExtension(selected.name)) {
      setError(`Formato não suportado. Envie um vídeo ${ALLOWED_EXTENSIONS.join(" ou ")}.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);

    try {
      setStatus("reading");
      const meta = await extractVideoMeta(file);

      setStatus("uploading");
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) {
        throw new Error((await urlRes.json()).error ?? "Falha ao gerar URL de upload");
      }
      const { path, token } = await urlRes.json();

      const { error: uploadError } = await supabaseBrowser.storage
        .from(VIDEOS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (uploadError) throw new Error(uploadError.message);

      setStatus("saving");
      const form = new FormData();
      form.set("path", path);
      form.set("filename", file.name);
      form.set("duration", String(Math.round(meta.duration)));
      form.set("width", String(meta.width));
      form.set("height", String(meta.height));
      form.set("caption", caption);
      if (meta.thumbnailBlob) form.set("thumbnail", meta.thumbnailBlob, "thumbnail.jpg");

      const saveRes = await fetch("/api/videos", { method: "POST", body: form });
      if (!saveRes.ok) {
        throw new Error((await saveRes.json()).error ?? "Falha ao salvar vídeo");
      }

      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="video-file">Arquivo do vídeo</Label>
        <Input
          id="video-file"
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          ref={inputRef}
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">Formatos aceitos: MP4 ou MOV.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="caption">Legenda</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Legenda do Reels (opcional)"
          disabled={busy}
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {busy ? (
        <div className="flex flex-col gap-1">
          <Progress value={status === "reading" ? 25 : status === "uploading" ? 65 : 90} />
          <p className="text-xs text-muted-foreground">
            {status === "reading" && "Lendo vídeo (duração, resolução, thumbnail)…"}
            {status === "uploading" && "Enviando vídeo para o Storage…"}
            {status === "saving" && "Salvando na biblioteca…"}
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={!file || busy} className="self-start">
        {busy ? "Enviando…" : "Enviar vídeo"}
      </Button>
    </form>
  );
}
