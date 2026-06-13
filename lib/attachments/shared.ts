import type { Database } from "@/lib/supabase/database.types";

export type AttachmentEntity = Database["public"]["Enums"]["attachment_entity"];
export type AttachmentRow = Database["public"]["Tables"]["attachments"]["Row"];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // mirrors the DB CHECK + bucket limit

/**
 * Extension allowlist — engineering-office daily formats. SVG is deliberately
 * excluded (scriptable). The DB/bucket enforce size; this enforces type.
 */
export const ALLOWED_EXTENSIONS = [
  "pdf", "png", "jpg", "jpeg", "webp", "heic",
  "dwg", "dxf", "zip", "rar",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  // Voice notes (in-app recorder) + phone audio files engineers share from site.
  "webm", "m4a", "mp4", "mp3", "wav", "ogg", "oga", "aac", "amr",
] as const;

const AUDIO_EXTENSIONS = ["webm", "m4a", "mp4", "mp3", "wav", "ogg", "oga", "aac", "amr"];

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return (m?.[1] ?? "").toLowerCase();
}

export function isAllowedFile(name: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

export function isImageAttachment(a: { mime_type: string | null; file_name: string }): boolean {
  if (a.mime_type?.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "webp", "heic"].includes(fileExtension(a.file_name));
}

/** Voice notes / audio files get an inline player instead of a new-tab open. */
export function isAudioAttachment(a: { mime_type: string | null; file_name: string }): boolean {
  if (a.mime_type?.startsWith("audio/")) return true;
  if (a.mime_type?.startsWith("video/")) return false;
  return AUDIO_EXTENSIONS.includes(fileExtension(a.file_name));
}

/** «2.4 م.ب» / «320 ك.ب» — Latin digits per the house rule. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${bytes} بايت`;
}

export const ENTITY_LABEL: Record<AttachmentEntity, string> = {
  project: "المشروع",
  task: "المهمة",
  client: "العميل",
  offer: "عرض السعر",
  invoice: "الفاتورة",
  portfolio: "معرض الأعمال",
};
