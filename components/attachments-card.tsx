"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadAttachment, deleteAttachment, getAttachmentUrl } from "@/app/(app)/attachments/actions";
import { useActionResult } from "@/components/use-action-result";
import {
  formatFileSize,
  isImageAttachment,
  type AttachmentEntity,
} from "@/lib/attachments/shared";
import type { AttachmentListItem } from "@/lib/attachments/list";
import { formatDate } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * «المرفقات» — one card used on project/task/offer/invoice detail pages.
 * Server passes the RLS-filtered list; uploads/deletes re-check on the server
 * AND at the DB/storage layers.
 */
export function AttachmentsCard({
  entityType,
  entityId,
  items,
  canUpload,
  currentUserId,
  isManager,
  title = "المرفقات",
}: {
  entityType: AttachmentEntity;
  entityId: string;
  items: AttachmentListItem[];
  canUpload: boolean;
  currentUserId: string;
  isManager: boolean;
  title?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const handle = useActionResult();

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("entity_type", entityType);
    fd.set("entity_id", entityId);
    fd.set("file", f);
    startUpload(async () => {
      handle(await uploadAttachment(fd));
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const open = (id: string) => {
    setBusyId(id);
    void getAttachmentUrl(id).then((res) => {
      setBusyId(null);
      if (res.error || !res.url) {
        toast.error(res.error ?? "تعذّر فتح المرفق.");
        return;
      }
      window.open(res.url, "_blank", "noopener");
    });
  };

  return (
    <Card className="no-print">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4 text-muted-foreground" aria-hidden />
          {title}
          {items.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
          ) : null}
        </CardTitle>
        {canUpload ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              aria-label="اختيار ملف"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "جارٍ الرفع…" : "إضافة ملف"}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد مرفقات بعد.
            {canUpload ? " ارفع المخططات أو المستندات أو الصور (حتى 10 م.ب)." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((a) => {
              const Icon = isImageAttachment(a) ? ImageIcon : FileText;
              const canDelete = isManager || a.uploaded_by === currentUserId;
              return (
                <li key={a.id} className="flex min-w-0 items-center gap-3 py-2.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => open(a.id)}
                      className="block max-w-full truncate text-start text-sm font-medium hover:underline"
                      dir="auto"
                    >
                      {a.file_name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(a.size_bytes)}
                      {a.uploader_name ? ` · ${a.uploader_name}` : ""} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`تنزيل ${a.file_name}`}
                    disabled={busyId === a.id}
                    onClick={() => open(a.id)}
                  >
                    {busyId === a.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive"
                      aria-label={`حذف ${a.file_name}`}
                      onClick={() => {
                        setBusyId(a.id);
                        void deleteAttachment(a.id).then((res) => {
                          setBusyId(null);
                          handle(res);
                        });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
