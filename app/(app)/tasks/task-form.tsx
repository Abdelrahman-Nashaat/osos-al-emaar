"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "./actions";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/tasks/status";
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

/**
 * Create-task dialog. tasks.assign holders only (the page renders the trigger only
 * then). When `lockedProjectId` is set (project-detail page) the project is fixed.
 */
export function TaskFormDialog({
  projects,
  engineers,
  lockedProjectId,
  trigger,
}: {
  projects: { id: string; name: string }[];
  engineers: { id: string; full_name: string }[];
  lockedProjectId?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createTask(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.success ?? "تم");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مهمة جديدة</DialogTitle>
          <DialogDescription>
            أضف مهمة وأسندها لمهندس. يمكن تركها بدون إسناد الآن وتعيينها لاحقاً.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t-title">عنوان المهمة</Label>
            <Input id="t-title" name="title" required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t-project">المشروع</Label>
            {lockedProjectId ? (
              <>
                <input type="hidden" name="project_id" value={lockedProjectId} />
                <Input
                  value={projects.find((p) => p.id === lockedProjectId)?.name ?? ""}
                  disabled
                  readOnly
                />
              </>
            ) : (
              <select id="t-project" name="project_id" required defaultValue="" className={SELECT_CLASS}>
                <option value="" disabled>
                  — اختر مشروعاً —
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-priority">الأولوية</Label>
            <select id="t-priority" name="priority" defaultValue="normal" className={SELECT_CLASS}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-due">تاريخ الاستحقاق</Label>
            <Input id="t-due" name="due_at" type="date" dir="ltr" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t-assignee">المهندس المسند إليه</Label>
            <select id="t-assignee" name="assignee" defaultValue="" className={SELECT_CLASS}>
              <option value="">— بدون إسناد —</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t-desc">الوصف / التفاصيل</Label>
            <Textarea id="t-desc" name="description" rows={3} />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإنشاء…" : "إنشاء المهمة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
