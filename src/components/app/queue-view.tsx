"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowDownWideNarrow,
  Calendar,
  Clock,
  Flag,
  Folder,
  Info,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabaseBrowser, VIDEOS_BUCKET } from "@/lib/supabase-browser";
import { formatBrasilia } from "@/lib/format-date";
import { cn } from "@/lib/utils";
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

/** dd/MM/yyyy HH:mm de um Date já em horário local do browser (mesmo tz usado pelos inputs date/time). */
function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

const STATUS_STYLES: Record<Post["status"], { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-[#DCFCE7] text-[#16A34A]" },
  processando: { label: "Processando", className: "bg-accent text-accent-foreground" },
  publicado: { label: "Publicado", className: "bg-[#F1F0F8] text-[#5B5876]" },
  erro: { label: "Erro", className: "bg-[#FEE2E2] text-[#DC2626]" },
};

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

  /** Restaura a ordem em que os vídeos foram enviados (created_at) — uploads em paralelo podem
   * terminar fora de ordem e embaralhar a fila, isso desfaz o embaralhamento. */
  function handleSortByUploadOrder() {
    setQueueItems((prev) =>
      [...prev].sort(
        (a, b) => new Date(a.video.created_at).getTime() - new Date(b.video.created_at).getTime()
      )
    );
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
    <div className="flex flex-col gap-6">
      {/* -------------------------------------------------------------- */}
      {/* Upload em massa                                                 */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-col gap-3.5">
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3.5 rounded-[20px] border-2 border-dashed bg-card p-7 text-center transition-colors sm:p-10",
            dragOver ? "border-primary bg-accent/40" : "border-[#DCD6F7]"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EDE9FE] text-[#7C5CFC]">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold">Arraste vários vídeos aqui</p>
            <p className="text-[13px] text-muted-foreground">
              MP4 ou MOV, até {MAX_FILE_SIZE_LABEL}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl border-border bg-secondary text-[13px] font-semibold text-primary hover:bg-secondary/70"
            onClick={() => inputRef.current?.click()}
          >
            <Folder className="h-4 w-4" />
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
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] font-semibold text-[#5B5876]">
              Enviando… {uploadStats.done} de {uploadStats.total}
            </p>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {uploading.map((tile) => (
                <div key={tile.id} className="card-shadow flex flex-col gap-2.5 rounded-2xl bg-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[#B4B1C9]">
                      {tile.status === "error" ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <VideoIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold" title={tile.filename}>
                        {tile.filename}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={tile.error}>
                        {tile.status === "reading" && "Lendo…"}
                        {tile.status === "uploading" && "Enviando…"}
                        {tile.status === "saving" && "Salvando…"}
                        {tile.status === "error" && (tile.error ?? "Falhou")}
                      </p>
                    </div>
                    {tile.status !== "error" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                  {tile.status === "error" ? (
                    <button
                      type="button"
                      className="self-start text-xs text-muted-foreground underline"
                      onClick={() => setUploading((prev) => prev.filter((t) => t.id !== tile.id))}
                    >
                      dispensar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Configuração da fila + Aguardando configuração                  */}
      {/* -------------------------------------------------------------- */}
      <Card className="p-[22px]">
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#EDE9FE] text-[#7C5CFC]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-bold">Configuração da fila</p>
              <p className="text-xs text-muted-foreground">
                Defina os padrões e revise seus vídeos antes de agendar.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="default-caption" className="text-xs font-semibold text-[#5B5876]">
                Legenda padrão
              </Label>
              <Textarea
                id="default-caption"
                className="min-h-[90px] rounded-xl text-[13px]"
                value={defaultCaption}
                onChange={(e) => setDefaultCaption(e.target.value)}
                placeholder="Aplicada a todos os vídeos da fila, exceto onde houver legenda individual"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="start-date" className="text-xs font-semibold text-[#5B5876]">
                Data de início
              </Label>
              <Input
                id="start-date"
                type="date"
                className="rounded-xl"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="start-time" className="text-xs font-semibold text-[#5B5876]">
                Hora de início
              </Label>
              <Input
                id="start-time"
                type="time"
                className="rounded-xl"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="interval" className="text-xs font-semibold text-[#5B5876]">
                Intervalo (min)
              </Label>
              <Input
                id="interval"
                type="number"
                min={1}
                className="rounded-xl"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Info className="h-2.5 w-2.5" />
            </span>
            Os horários serão incrementados automaticamente com base no intervalo definido.
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <p className="text-base font-bold">Aguardando configuração</p>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                  {queueItems.length} vídeos
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-[10px] border-border bg-secondary text-xs font-semibold text-[#5B5876] hover:bg-secondary/70"
                onClick={handleSortByUploadOrder}
                disabled={queueItems.length < 2}
              >
                Ordenar por ordem de envio
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              </Button>
            </div>

            {queueItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vídeo na fila — envie vídeos acima.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {queueItems.map((item, index) => (
                  <div key={item.video.id} className="relative flex flex-col gap-2 rounded-[14px] border border-border p-2.5">
                    <span className="absolute top-2.5 left-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      className="absolute top-2.5 right-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626] disabled:opacity-50"
                      onClick={() => handleDeleteQueuedVideo(item.video.id)}
                      disabled={deletingVideoId === item.video.id}
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <div className="relative aspect-9/16 w-full overflow-hidden rounded-[10px] bg-muted">
                      {item.video.thumbnail_url ? (
                        <Image
                          src={item.video.thumbnail_url}
                          alt={item.video.filename}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <VideoIcon className="h-6 w-6 text-[#B4B1C9]" />
                        </div>
                      )}
                      <span className="absolute right-1.5 bottom-1.5 rounded-md bg-[#15132A]/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {formatDuration(item.video.duration_seconds)}
                      </span>
                    </div>
                    <p className="truncate text-xs font-semibold" title={item.video.filename}>
                      {item.video.filename}
                    </p>

                    <Textarea
                      aria-label="Legenda"
                      className="min-h-8 rounded-[9px] py-1.5 text-[11px]"
                      value={itemCaption(item)}
                      placeholder="Legenda (opcional)"
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
                      className="h-7 rounded-[9px] text-[11px]"
                      value={item.timeOverride ?? toDatetimeLocalValue(itemDatetime(item, index))}
                      onChange={(e) => {
                        const value = e.target.value;
                        setQueueItems((prev) =>
                          prev.map((qi) => (qi.video.id === item.video.id ? { ...qi, timeOverride: value } : qi))
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

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

            <div className="flex flex-wrap items-center gap-5 rounded-[14px] bg-secondary p-3.5 sm:px-[18px] sm:py-3.5">
              <div className="flex items-center gap-2">
                <VideoIcon className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[13px] font-bold">{queueItems.length} vídeos</p>
                  <p className="text-[11px] text-muted-foreground">na fila</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[13px] font-bold">Início</p>
                  <p className="text-[11px] text-muted-foreground">
                    {queueItems.length > 0 ? formatLocalDatetime(itemDatetime(queueItems[0], 0)) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[13px] font-bold">Término estimado</p>
                  <p className="text-[11px] text-muted-foreground">
                    {queueItems.length > 0
                      ? formatLocalDatetime(itemDatetime(queueItems[queueItems.length - 1], queueItems.length - 1))
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[13px] font-bold">Intervalo</p>
                  <p className="text-[11px] text-muted-foreground">{intervalMinutes} minutos</p>
                </div>
              </div>
              <Button
                type="button"
                onClick={handleScheduleAll}
                disabled={queueItems.length === 0 || scheduling}
                className="brand-gradient h-auto gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(109,76,251,0.6)] hover:brightness-[1.06] sm:ml-auto"
              >
                <Calendar className="h-3.5 w-3.5" strokeWidth={2.5} />
                {scheduling ? "Agendando…" : `Agendar todos os ${queueItems.length} vídeos`}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------------- */}
      {/* Agendados / publicados hoje                                    */}
      {/* -------------------------------------------------------------- */}
      <Card className="p-[22px]">
        <p className="mb-4 text-base font-bold">Agendados ({initialActivePosts.length})</p>
        {initialActivePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[640px] flex-col">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-3 border-b border-border px-2 pb-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                <div>Vídeo</div>
                <div>Data</div>
                <div>Horário</div>
                <div>Status</div>
                <div className="text-right">Ação</div>
              </div>
              {initialActivePosts.map((post) => {
                const statusStyle = STATUS_STYLES[post.status];
                const displayDatetime =
                  post.status === "publicado" && post.published_at ? post.published_at : post.scheduled_datetime;
                return (
                  <div
                    key={post.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] items-center gap-3 border-b border-[#F1F0F8] px-2 py-3 last:border-b-0"
                  >
                    {post.status === "publicado" && post.permalink ? (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2.5 hover:opacity-80"
                      >
                        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-[#B4B1C9]">
                          <VideoIcon className="h-4 w-4" />
                        </div>
                        <p className="truncate text-[13px] font-semibold">{post.video.filename}</p>
                      </a>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-[#B4B1C9]">
                          <VideoIcon className="h-4 w-4" />
                        </div>
                        <p className="truncate text-[13px] font-semibold">{post.video.filename}</p>
                      </div>
                    )}
                    <p className="text-[13px] text-[#5B5876]">{formatBrasilia(displayDatetime, "dd/MM/yyyy")}</p>
                    <p className="text-[13px] text-[#5B5876]">{formatBrasilia(displayDatetime, "HH:mm")}</p>
                    <div>
                      <span
                        className={cn("inline-block rounded-full px-2.5 py-1 text-[11px] font-bold", statusStyle.className)}
                        title={post.status === "erro" ? (post.error_message ?? undefined) : undefined}
                      >
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {post.status === "erro" ? (
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] disabled:opacity-50"
                          onClick={() => handleRetry(post.id)}
                          disabled={retryingId === post.id}
                          title={post.error_message ? `Reprocessar — ${post.error_message}` : "Reprocessar"}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {post.status === "pendente" ? (
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground disabled:opacity-50"
                          onClick={() => handleCancel(post.id)}
                          disabled={cancelingId === post.id}
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
