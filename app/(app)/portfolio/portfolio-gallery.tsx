"use client";

import { useTransition } from "react";
import { Star } from "lucide-react";
import { useActionResult } from "@/components/use-action-result";
import { setPortfolioCover } from "./actions";
import { cn } from "@/lib/utils";

export type GalleryImage = {
  attachmentId: string;
  url: string;
  fileName: string;
  isCover: boolean;
};

/** Image grid for a portfolio item; editors can pick the cover («غلاف»). */
export function PortfolioGallery({
  itemId,
  images,
  canEdit,
}: {
  itemId: string;
  images: GalleryImage[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  if (images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا توجد صور بعد — أضف الصور من بطاقة «المرفقات» بالأسفل وستظهر هنا.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((img) => (
        <li key={img.attachmentId} className="group relative overflow-hidden rounded-lg border border-border">
          <a href={img.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
            <img src={img.url} alt={img.fileName} className="aspect-[4/3] w-full object-cover" />
          </a>
          {canEdit ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("item_id", itemId);
                  fd.set("attachment_id", img.isCover ? "" : img.attachmentId);
                  onResult(await setPortfolioCover(fd));
                })
              }
              aria-label={img.isCover ? "إزالة الغلاف" : "تعيين كغلاف"}
              title={img.isCover ? "إزالة الغلاف" : "تعيين كغلاف"}
              className={cn(
                "absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-full backdrop-blur",
                img.isCover
                  ? "bg-amber-400 text-amber-950"
                  : "bg-background/80 text-muted-foreground hover:text-foreground",
              )}
            >
              <Star className={cn("size-4", img.isCover && "fill-current")} />
            </button>
          ) : img.isCover ? (
            <span className="absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-full bg-amber-400 text-amber-950">
              <Star className="size-4 fill-current" />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
