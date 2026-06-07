"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Send,
  Gauge,
  MessageSquarePlus,
  Flag,
  UserCog,
  CheckCircle2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  assignTask,
  startTask,
  updateTaskProgress,
  submitTask,
  closeTask,
  reopenTask,
  addTaskNote,
  addTaskMilestone,
  deleteTask,
  type ActionState,
} from "./actions";
import type { TaskAction } from "@/lib/tasks/status";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Engineer = { id: string; full_name: string };

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Role-gated lifecycle action bar. `actions` is computed server-side by
 * nextActions(); every control here maps to a SECURITY DEFINER function that
 * re-checks authority — so this only decides what to *offer*, never what's allowed.
 */
export function TaskActions({
  taskId,
  projectId,
  progress,
  actions,
  assignable,
}: {
  taskId: string;
  projectId: string;
  progress: number;
  actions: TaskAction[];
  assignable: Engineer[];
}) {
  const has = (a: TaskAction) => actions.includes(a);
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">لا تتوفر إجراءات على هذه المهمة لك.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {has("start") ? <StartButton taskId={taskId} projectId={projectId} /> : null}

      {has("progress") ? (
        <ProgressDialog taskId={taskId} projectId={projectId} progress={progress} />
      ) : null}

      {has("submit") ? (
        <ConfirmDialog
          action={submitTask}
          taskId={taskId}
          projectId={projectId}
          title="إرسال المهمة للمراجعة"
          description="ستنتقل المهمة إلى «بانتظار المراجعة» ليراجعها المدير ويغلقها."
          confirmLabel="إرسال"
          trigger={
            <Button>
              <Send className="size-4" />
              إرسال للمراجعة
            </Button>
          }
        />
      ) : null}

      {has("note") ? (
        <ConfirmDialog
          action={addTaskNote}
          taskId={taskId}
          projectId={projectId}
          title="إضافة ملاحظة"
          confirmLabel="إضافة"
          noteRequired
          trigger={
            <Button variant="outline">
              <MessageSquarePlus className="size-4" />
              ملاحظة
            </Button>
          }
        />
      ) : null}

      {has("milestone") ? (
        <MilestoneDialog taskId={taskId} projectId={projectId} />
      ) : null}

      {has("assign") ? (
        <AssignDialog
          taskId={taskId}
          projectId={projectId}
          assignable={assignable}
          title="تعيين مهندس"
          confirmLabel="تعيين"
          trigger={
            <Button variant="outline">
              <UserCog className="size-4" />
              تعيين مهندس
            </Button>
          }
        />
      ) : null}

      {has("handoff") ? (
        <AssignDialog
          taskId={taskId}
          projectId={projectId}
          assignable={assignable}
          title="نقل المهمة إلى مهندس آخر"
          confirmLabel="نقل"
          trigger={
            <Button variant="outline">
              <UserCog className="size-4" />
              نقل المهمة
            </Button>
          }
        />
      ) : null}

      {has("close") ? (
        <ConfirmDialog
          action={closeTask}
          taskId={taskId}
          projectId={projectId}
          title="إغلاق المهمة"
          description="بعد المراجعة، سيتم إغلاق المهمة واعتبارها مكتملة (100%)."
          confirmLabel="إغلاق"
          trigger={
            <Button>
              <CheckCircle2 className="size-4" />
              إغلاق المهمة
            </Button>
          }
        />
      ) : null}

      {has("reopen") ? (
        <ConfirmDialog
          action={reopenTask}
          taskId={taskId}
          projectId={projectId}
          title="إعادة فتح المهمة"
          description="ستعود المهمة إلى «قيد التنفيذ» مع المهندس الحالي."
          confirmLabel="إعادة الفتح"
          trigger={
            <Button variant="outline">
              <RotateCcw className="size-4" />
              إعادة فتح
            </Button>
          }
        />
      ) : null}

      {has("delete") ? <DeleteTaskDialog taskId={taskId} projectId={projectId} /> : null}
    </div>
  );
}

/** Shared toast handler for a transition result. Returns true on success. */
function notify(res: ActionState): boolean {
  if (res.error) {
    toast.error(res.error);
    return false;
  }
  toast.success(res.success ?? "تم");
  return true;
}

function StartButton({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      notify(await startTask(formData));
    });
  }
  // A form action (not an imperative call) so the router refreshes the page and the
  // action bar updates to the next state in place.
  return (
    <form action={handleSubmit}>
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="project_id" value={projectId} />
      <Button type="submit" disabled={pending}>
        <Play className="size-4" />
        بدء التنفيذ
      </Button>
    </form>
  );
}

/** Generic confirm dialog with an optional/required note → submit/close/reopen/note. */
function ConfirmDialog({
  action,
  taskId,
  projectId,
  title,
  description,
  confirmLabel,
  noteRequired,
  trigger,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  taskId: string;
  projectId: string;
  title: string;
  description?: string;
  confirmLabel: string;
  noteRequired?: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (notify(await action(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="c-note">{noteRequired ? "الملاحظة" : "ملاحظة (اختياري)"}</Label>
            <Textarea id="c-note" name="note" rows={3} required={noteRequired} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ التنفيذ…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProgressDialog({
  taskId,
  projectId,
  progress,
}: {
  taskId: string;
  projectId: string;
  progress: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (notify(await updateTaskProgress(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Gauge className="size-4" />
          تحديث الإنجاز
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تحديث نسبة الإنجاز</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="p-progress">النسبة (٪)</Label>
            <Input
              id="p-progress"
              name="progress"
              type="number"
              min={0}
              max={100}
              dir="ltr"
              defaultValue={progress}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-note">ملاحظة (اختياري)</Label>
            <Textarea id="p-note" name="note" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  taskId,
  projectId,
  assignable,
  title,
  confirmLabel,
  trigger,
}: {
  taskId: string;
  projectId: string;
  assignable: Engineer[];
  title: string;
  confirmLabel: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (notify(await assignTask(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>تُسند المهام إلى المهندسين النشطين فقط.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="a-assignee">المهندس</Label>
            <select id="a-assignee" name="assignee" required defaultValue="" className={SELECT_CLASS}>
              <option value="" disabled>
                {assignable.length === 0 ? "لا يوجد مهندسون نشطون" : "— اختر مهندساً —"}
              </option>
              {assignable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-note">ملاحظة (اختياري)</Label>
            <Textarea id="a-note" name="note" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || assignable.length === 0}>
              {pending ? "جارٍ التنفيذ…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (notify(await addTaskMilestone(formData))) {
        setOpen(false);
        setLabel("");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Flag className="size-4" />
          مَعلَم
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسجيل مَعلَم</DialogTitle>
          <DialogDescription>سجّل حدثاً مهماً في مسار المهمة، مثل إصدار الرخصة.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="task_id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="m-label">المَعلَم</Label>
            <Input
              id="m-label"
              name="label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLabel("أصدرنا الرخصة")}
            >
              أصدرنا الرخصة
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-note">ملاحظة (اختياري)</Label>
            <Textarea id="m-note" name="note" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "تسجيل"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaskDialog({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onDelete() {
    startTransition(async () => {
      if (notify(await deleteTask(taskId, projectId))) router.push("/tasks");
    });
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <Trash2 className="size-4" />
          حذف
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>حذف المهمة؟</AlertDialogTitle>
          <AlertDialogDescription>
            لا يمكن التراجع عن هذا الإجراء. سيُحذف سجل المهمة بالكامل.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onDelete}>
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
