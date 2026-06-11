import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentEntity, AttachmentRow } from "@/lib/attachments/shared";

export type AttachmentListItem = AttachmentRow & { uploader_name: string | null };

/**
 * Attachments of one entity, with uploader display names resolved through
 * team_directory() (engineers cannot read other profiles directly — the
 * directory function exposes names only, by design).
 */
export async function fetchAttachments(
  entityType: AttachmentEntity,
  entityId: string,
): Promise<AttachmentListItem[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: directory }] = await Promise.all([
    supabase
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false }),
    supabase.rpc("team_directory"),
  ]);
  const names = new Map((directory ?? []).map((d) => [d.id, d.full_name]));
  return (rows ?? []).map((r) => ({
    ...r,
    uploader_name: r.uploaded_by ? (names.get(r.uploaded_by) ?? null) : null,
  }));
}
