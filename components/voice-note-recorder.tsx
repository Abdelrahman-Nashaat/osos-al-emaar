"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * «تسجيل صوتي» — in-browser voice note recorder for the attachments card.
 * Engineers on site dictate updates instead of typing. Produces a normal
 * attachment file (audio/webm on Chrome/Android, audio/mp4 on iOS Safari)
 * and hands it to the same server upload path as picked files.
 */
const MAX_SECONDS = 300; // 5 minutes ≈ well under the 10MB attachment cap

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function extensionFor(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceNoteRecorder({
  uploading,
  onSubmit,
}: {
  uploading: boolean;
  onSubmit: (file: File) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "preview">("idle");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseStream = () => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  };

  // Never leak the mic or blob URLs on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mimeRef.current = rec.mimeType || mimeType || "audio/webm";
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        releaseStream();
        const blob = new Blob(chunksRef.current, { type: mimeRef.current.split(";")[0] });
        blobRef.current = blob;
        if (blob.size === 0) {
          setPhase("idle");
          toast.error("لم يُسجَّل أي صوت. حاول مجدداً.");
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPhase("preview");
      };
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS && recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
            stopTimer();
            toast.info("اكتمل الحد الأقصى للتسجيل (5 دقائق).");
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("تعذّر الوصول إلى الميكروفون. تأكد من منح الإذن في المتصفح.");
    }
  };

  const stop = () => {
    stopTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setSeconds(0);
    setPhase("idle");
  };

  const submit = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const ext = extensionFor(blob.type);
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")
      .replace(":", ".");
    const file = new File([blob], `تسجيل صوتي ${stamp}.${ext}`, { type: blob.type });
    onSubmit(file);
    discard();
  };

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-2" role="status">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
        </span>
        <span className="text-sm tabular-nums text-muted-foreground" dir="ltr">
          {formatClock(seconds)}
        </span>
        <Button type="button" variant="destructive" size="sm" onClick={stop}>
          <Square className="size-4" />
          إيقاف
        </Button>
      </div>
    );
  }

  if (phase === "preview" && previewUrl) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <audio src={previewUrl} controls preload="metadata" className="h-9 max-w-56" />
        <Button type="button" size="sm" disabled={uploading} onClick={submit}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          إرفاق التسجيل
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-destructive"
          aria-label="حذف التسجيل"
          disabled={uploading}
          onClick={discard}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={start}>
      <Mic className="size-4" />
      تسجيل صوتي
    </Button>
  );
}
