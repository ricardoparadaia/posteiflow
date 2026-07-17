"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabaseBrowser, VIDEOS_BUCKET } from "@/lib/supabase-browser";
import { formatBrasilia } from "@/lib/format-date";
import type { Post, Video } from "@/types/db";

type PostWithVideo = Post & { video: Video };

// Formatos aceitos pela Content Publishing API do Instagram para Reels
// (container .mp4 ou .mov, codec H.264/AAC).
const ALLOWED_EXTENSIONS = [".mp4", ".mov"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// 50MB é o teto do "Global file size limit" do Supabase Storage no plano
// Free — não dá pra configurar acima disso nem por bucket, o limite global
// do projeto sempre prevalece (confirmado na doc do Supabase). NÃO é o
// limite do Instagram (Reels via Content Publishing API aceita até 300MB) —
// se um dia o projeto migrar pro plano Pro, é só subir este número (até
// 300MB, acima disso o Instagram que rejeitaria).
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = "50MB";

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

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type UploadTileStatus = "reading" | "uploading" | "saving" | "error";

interface UploadTile {
  id: string;
  filename: string;
  status: UploadTileStatus;
  error?: string;
}

interface QueueItem {
  video: Video;
  captionOverride: string | null;
  timeOverride: string | null; // valor cru do <input type="datetime-local">
}

/** yyyy-MM-ddTHH:mm em horário local do browser, formato aceito por <input type="datetime-local">. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

export function QueueView({
  initialUnscheduled,
  initialActivePosts,
  quota,
}: {
  initialUnscheduled: Video[];
  initialActivePosts: PostWithVideo[];
  quota: { quotaUsage: number; quotaTotal: number } | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<UploadTile[]>([]);
  const [uploadStats, setUploadStats] = useState({ total: 0, done: 0 });
  const [queueItems, setQueueItems] = useState<QueueItem[]>(
    initialUnscheduled.map((video) => ({ video, captionOverride: null, timeOverride: null }))
  );
  const [defaultCaption, setDefaultCaption] = useState("");

  // Lazy initializer: roda uma única vez no mount, não a cada render (evita
  // o problema de Date.now() impuro sendo chamado durante o render).
  const [startDate, setStartDate] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000)).slice(0, 10)
  );
  const [startTime, setStartTime] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000)).slice(11, 16)
  );
  const [intervalMinutes, setIntervalMinutes] = useState(30);

  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  function computeDefaultSlot(index: number): Date {
    const start = new Date(`${startDate}T${startTime}:00`);
    return new Date(start.getTime() + index * intervalMinutes * 60_000);
  }

  function itemDatetime(item: QueueItem, index: number): Date {
    return item.timeOverride ? new Date(item.timeOverride) : computeDefaultSlot(index);
  }

  function itemCaption(item: QueueItem): string {
    return item.captionOverride ?? defaultCaption;
  }

  async function uploadOneFile(file: File) {
    const tileId = crypto.randomUUID();
    setUploading((prev) => [...prev, { id: tileId, filename: file.name, status: "reading" }]);

    function updateTile(patch: Partial<UploadTile>) {
      setUploading((prev) => prev.map((t) => (t.id === tileId ? { ...t, ...patch } : t)));
    }
    function finishAttempt() {
      setUploadStats((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    try {
      const meta = await extractVideoMeta(file);

      updateTile({ status: "uploading" });
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) {
        throw new Error((await urlRes.json()).error ?? "Falha ao gerar URL de upload");
      }
      const { path, token } = await urlRes.json();

      const { error: uploadErr } = await supabaseBrowser.storage
        .from(VIDEOS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (uploadErr) throw new Error(uploadErr.message);

      updateTile({ status: "saving" });
      const form = new FormData();
      form.set("path", path);
      form.set("filename", file.name);
      form.set("duration", String(Math.round(meta.duration)));
      form.set("width", String(meta.width));
      form.set("height", String(meta.height));
      if (meta.thumbnailBlob) form.set("thumbnail", meta.thumbnailBlob, "thumbnail.jpg");

      const saveRes = await fetch("/api/videos", { method: "POST", body: form });
      if (!saveRes.ok) {
        throw new Error((await saveRes.json()).error ?? "Falha ao salvar vídeo");
      }
      const { video } = await saveRes.json();

      setQueueItems((prev) => [...prev, { video: video as Video, captionOverride: null, timeOverride: null }]);
      setUploading((prev) => prev.filter((t) => t.id !== tileId));
      finishAttempt();
    } catch (err) {
      updateTile({ status: "error", error: err instanceof Error ? err.message : String(err) });
      finishAttempt();
    }
  }

  function handleFiles(fileList: FileList | File[]) {
    setUploadError(null);
    const files = Array.from(fileList);
    const withExt = files.filter((f) => hasAllowedExtension(f.name));
    const extRejected = files.length - withExt.length;
    if (extRejected > 0) {
      setUploadError(
        `${extRejected} arquivo(s) ignorado(s) por formato não suportado. Envie vídeos ${ALLOWED_EXTENSIONS.join(" ou ")}.`
      );
    }

    // Tamanho é validado aqui, antes de qualquer chamada de rede — arquivos
    // grandes demais nascem direto como tile de erro, sem tentar upload-url
    // nem Storage (que rejeitaria de qualquer forma, só que depois de gastar
    // tempo lendo o vídeo inteiro no browser).
    const tooLarge = withExt.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    const allowed = withExt.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    const totalAttempted = allowed.length + tooLarge.length;
    if (totalAttempted === 0) return;

    setUploadStats((prev) =>
      prev.total === 0 || uploading.length === 0
        ? { total: totalAttempted, done: tooLarge.length }
        : { total: prev.total + totalAttempted, done: prev.done + tooLarge.length }
    );

    for (const file of tooLarge) {
      setUploading((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          filename: file.name,
          status: "error",
          error: `Arquivo muito grande — máximo ${MAX_FILE_SIZE_LABEL}`,
        },
      ]);
    }

    for (const file of allowed) {
      void uploadOneFile(file);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  async function handleDeleteQueuedVideo(videoId: string) {
    if (!confirm("Excluir este vídeo da fila? Ele será removido do Storage.")) return;
    setDeletingVideoId(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao excluir vídeo");
      setQueueItems((prev) => prev.filter((item) => item.video.id !== videoId));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingVideoId(null);
    }
  }

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

  async function handleScheduleAll() {
    if (queueItems.length === 0) return;
    setScheduling(true);
    setScheduleError(null);
    try {
      const items = queueItems.map((item, index) => ({
        video_id: item.video.id,
        scheduled_datetime: itemDatetime(item, index).toISOString(),
        caption: itemCaption(item) || null,
      }));

      const res = await fetch("/api/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao agendar em lote");

      const { results } = (await res.json()) as {
        results: { video_id: string; ok: boolean; error?: string }[];
      };
      const failed = results.filter((r) => !r.ok);
      const succeededIds = new Set(results.filter((r) => r.ok).map((r) => r.video_id));

      setQueueItems((prev) => prev.filter((item) => !succeededIds.has(item.video.id)));

      if (failed.length > 0) {
        setScheduleError(
          `${failed.length} de ${results.length} não foram agendados: ${failed
            .map((f) => f.error)
            .join("; ")}`
        );
      }
      router.refresh();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduling(false);
    }
  }

  const quotaWouldExceed = quota != null && quota.quotaUsage + queueItems.length > quota.quotaTotal;

  return (
    <div className="flex flex-col gap-8">
      {/* -------------------------------------------------------------- */}
      {/* Upload em massa                                                 */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <div
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
            dragOver ? "border-primary bg-accent" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            Arraste vários vídeos aqui <span className="text-xs font-normal text-muted-foreground">— MP4 ou MOV, até {MAX_FILE_SIZE_LABEL}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Selecionar vídeos
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="video/mp4,video/quicktime,.mp4,.mov"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploadError ? (
          <Alert variant="destructive">
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        ) : null}

        {uploading.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Enviando… {uploadStats.done} de {uploadStats.total}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {uploading.map((tile) => (
                <div key={tile.id} className="overflow-hidden rounded-lg border">
                  <div className="relative flex h-20 items-center justify-center bg-muted">
                    {tile.status === "error" ? (
                      <X className="h-5 w-5 text-destructive" />
                    ) : (
                      <>
                        <Skeleton className="absolute inset-0" />
                        <Loader2 className="relative h-5 w-5 animate-spin text-muted-foreground" />
                      </>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-medium" title={tile.filename}>
                      {tile.filename}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground" title={tile.error}>
                      {tile.status === "reading" && "Lendo…"}
                      {tile.status === "uploading" && "Enviando…"}
                      {tile.status === "saving" && "Salvando…"}
                      {tile.status === "error" && (tile.error ?? "Falhou")}
                    </p>
                    {tile.status === "error" ? (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground underline"
                        onClick={() => setUploading((prev) => prev.filter((t) => t.id !== tile.id))}
                      >
                        dispensar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Controles gerais + agendar todos                                */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-2">
          <Label htmlFor="default-caption">Legenda padrão</Label>
          <Textarea
            id="default-caption"
            value={defaultCaption}
            onChange={(e) => setDefaultCaption(e.target.value)}
            placeholder="Aplicada a todos os vídeos da fila, exceto onde houver legenda individual"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="start-date">Data de início</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="start-time">Hora de início</Label>
            <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="interval">Intervalo (min)</Label>
            <Input
              id="interval"
              type="number"
              min={1}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>

        {quotaWouldExceed && quota ? (
          <Alert variant="destructive">
            <AlertDescription>
              Agendar estes {queueItems.length} vídeo(s) pode ultrapassar o limite de {quota.quotaTotal}{" "}
              publicações/24h (uso atual: {quota.quotaUsage}/{quota.quotaTotal}). Isso não é bloqueado — o
              scheduler reagenda automaticamente os excedentes quando a cota liberar, mas os horários reais
              de publicação vão se afastar do que está calculado abaixo.
            </AlertDescription>
          </Alert>
        ) : null}

        {scheduleError ? (
          <Alert variant="destructive">
            <AlertDescription>{scheduleError}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="button"
          onClick={handleScheduleAll}
          disabled={queueItems.length === 0 || scheduling}
          className="self-start"
        >
          {scheduling ? "Agendando…" : `Agendar todos (${queueItems.length})`}
        </Button>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Fila (ainda não agendados)                                     */}
      {/* -------------------------------------------------------------- */}
      <div>
        <h2 className="mb-3 text-lg font-medium">Aguardando configuração ({queueItems.length})</h2>
        {queueItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vídeo na fila — envie vídeos acima.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {queueItems.map((item, index) => (
              <div key={item.video.id} className="overflow-hidden rounded-lg border">
                <div className="relative h-24 bg-muted">
                  {item.video.thumbnail_url ? (
                    <Image
                      src={item.video.thumbnail_url}
                      alt={item.video.filename}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      Sem thumbnail
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-50"
                    onClick={() => handleDeleteQueuedVideo(item.video.id)}
                    disabled={deletingVideoId === item.video.id}
                    title="Excluir"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-col gap-1 p-1.5">
                  <p className="truncate text-[11px] font-medium" title={item.video.filename}>
                    {item.video.filename}
                    <span className="font-normal text-muted-foreground"> · {formatDuration(item.video.duration_seconds)}</span>
                  </p>

                  <Textarea
                    aria-label="Legenda"
                    className="min-h-10 py-1 text-[11px]"
                    value={itemCaption(item)}
                    placeholder="Legenda padrão"
                    onChange={(e) => {
                      const value = e.target.value;
                      setQueueItems((prev) =>
                        prev.map((qi) => (qi.video.id === item.video.id ? { ...qi, captionOverride: value } : qi))
                      );
                    }}
                  />
                  {item.captionOverride !== null ? (
                    <button
                      type="button"
                      className="self-start text-[10px] text-muted-foreground underline"
                      onClick={() =>
                        setQueueItems((prev) =>
                          prev.map((qi) => (qi.video.id === item.video.id ? { ...qi, captionOverride: null } : qi))
                        )
                      }
                    >
                      usar padrão
                    </button>
                  ) : null}

                  <Input
                    aria-label="Horário"
                    type="datetime-local"
                    className="h-7 text-[11px]"
                    value={item.timeOverride ?? toDatetimeLocalValue(itemDatetime(item, index))}
                    onChange={(e) => {
                      const value = e.target.value;
                      setQueueItems((prev) =>
                        prev.map((qi) => (qi.video.id === item.video.id ? { ...qi, timeOverride: value } : qi))
                      );
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Agendados / publicados hoje                                    */}
      {/* -------------------------------------------------------------- */}
      <div>
        <h2 className="mb-3 text-lg font-medium">Agendados ({initialActivePosts.length})</h2>
        {initialActivePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento ativo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vídeo</TableHead>
                <TableHead>Data/hora</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialActivePosts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="max-w-48 truncate">{post.video.filename}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatBrasilia(
                      post.status === "publicado" && post.published_at ? post.published_at : post.scheduled_datetime,
                      "PPPp"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-64 truncate text-xs text-muted-foreground"
                    title={post.error_message ?? undefined}
                  >
                    {post.error_message ?? "—"}
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
