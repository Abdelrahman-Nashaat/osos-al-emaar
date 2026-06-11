"use client";

import { useState, useTransition } from "react";
import { useActionResult } from "@/components/use-action-result";
import { saveProject } from "./actions";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/lib/projects/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export type ProjectFormValues = {
  id: string;
  name: string;
  code: string | null;
  client_id: string | null;
  status: ProjectStatus;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
};

export function ProjectFormDialog({
  project,
  clients,
  trigger,
}: {
  project?: ProjectFormValues;
  clients: { id: string; name: string }[];
  trigger: React.ReactNode;
}) {
  const isEdit = Boolean(project);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  function handleSubmit(formData: FormData) {
    // Instant cross-field check (the server re-validates — B8).
    const start = String(formData.get("start_date") ?? "");
    const due = String(formData.get("due_date") ?? "");
    if (start && due && due < start) {
      setFormError("تاريخ البدء يجب أن يسبق تاريخ الاستحقاق أو يساويه.");
      return;
    }
    startTransition(async () => {
      const res = await saveProject(formData);
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
          <DialogTitle>{isEdit ? "تعديل المشروع" : "مشروع جديد"}</DialogTitle>
          <DialogDescription>
            المعلومات التشغيلية للمشروع. تُدار المبالغ من صفحة المشروع (للمدير والمحاسب فقط).
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
          {isEdit ? <input type="hidden" name="id" defaultValue={project!.id} /> : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-name">اسم المشروع</Label>
            <Input id="p-name" name="name" defaultValue={project?.name ?? ""} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-code">رمز المشروع</Label>
            <Input id="p-code" name="code" defaultValue={project?.code ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-client">العميل</Label>
            <select
              id="p-client"
              name="client_id"
              defaultValue={project?.client_id ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">— بدون عميل —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-status">الحالة</Label>
            <select
              id="p-status"
              name="status"
              defaultValue={project?.status ?? "planning"}
              className={SELECT_CLASS}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-progress">نسبة الإنجاز (٪)</Label>
            <Input
              id="p-progress"
              name="progress"
              type="number"
              min={0}
              max={100}
              dir="ltr"
              defaultValue={project?.progress ?? 0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-start">تاريخ البدء</Label>
            <Input
              id="p-start"
              name="start_date"
              type="date"
              dir="ltr"
              defaultValue={project?.start_date ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-due">تاريخ الاستحقاق</Label>
            <Input
              id="p-due"
              name="due_date"
              type="date"
              dir="ltr"
              defaultValue={project?.due_date ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-desc">الوصف / ملاحظات</Label>
            <Textarea id="p-desc" name="description" rows={3} defaultValue={project?.description ?? ""} />
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : isEdit ? "حفظ التغييرات" : "إنشاء المشروع"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
