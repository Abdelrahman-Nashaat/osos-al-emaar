"use client";

import { useState, useTransition } from "react";
import { useActionResult } from "@/components/use-action-result";
import { savePortfolioItem } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const CATEGORY_SUGGESTIONS = [
  "فيلا سكنية",
  "عمارة سكنية",
  "مبنى تجاري",
  "إشراف هندسي",
  "مخططات ترخيص",
  "تصميم داخلي",
  "مخطط معماري",
];

export type EditPortfolioItem = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  city: string | null;
  year: number | null;
  project_id: string | null;
  is_published: boolean;
};

/** Create / edit portfolio item dialog. portfolio.edit holders only. */
export function PortfolioFormDialog({
  projects,
  item,
  trigger,
}: {
  projects: { id: string; name: string }[];
  item?: EditPortfolioItem;
  trigger: React.ReactNode;
}) {
  const isEdit = !!item;
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState(item?.is_published ?? true);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  function handleSubmit(formData: FormData) {
    if (published) formData.set("is_published", "on");
    else formData.delete("is_published");
    startTransition(async () => {
      const res = await savePortfolioItem(formData);
      if (onResult(res)) {
        setFormError(null);
        setOpen(false);
      } else {
        setFormError(res.error ?? null);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFormError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل عنصر المعرض" : "إضافة عمل إلى المعرض"}</DialogTitle>
          <DialogDescription>
            أعمال المكتب المنجزة — تظهر لكل الفريق، والصور تُضاف من صفحة العنصر.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          {isEdit ? <input type="hidden" name="id" value={item.id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-title">عنوان العمل</Label>
            <Input
              id="pf-title"
              name="title"
              required
              placeholder="مثال: فيلا سكنية — حي الشاطئ، الدمام"
              defaultValue={item?.title ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-category">التصنيف</Label>
            <Input
              id="pf-category"
              name="category"
              list="pf-categories"
              defaultValue={item?.category ?? ""}
            />
            <datalist id="pf-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-year">سنة الإنجاز</Label>
            <Input
              id="pf-year"
              name="year"
              type="number"
              min={1980}
              max={2100}
              dir="ltr"
              defaultValue={item?.year ?? new Date().getFullYear()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-city">المدينة</Label>
            <Input id="pf-city" name="city" defaultValue={item?.city ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pf-project">مشروع مرتبط (اختياري)</Label>
            <select
              id="pf-project"
              name="project_id"
              defaultValue={item?.project_id ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">— بدون —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-desc">وصف العمل</Label>
            <Textarea id="pf-desc" name="description" rows={3} defaultValue={item?.description ?? ""} />
          </div>

          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <div>
              <Label htmlFor="pf-published">منشور</Label>
              <p className="text-xs text-muted-foreground">
                غير المنشور يظهر لمحرري المعرض فقط (مسودة).
              </p>
            </div>
            <Switch id="pf-published" checked={published} onCheckedChange={setPublished} />
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إضافة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
