"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, CreditCard, MessageSquarePlus, Ban, Trash2, Pencil } from "lucide-react";
import {
  sendInvoice,
  recordPayment,
  addInvoiceNote,
  voidInvoice,
  deleteInvoice,
  type ActionState,
} from "./actions";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type InvoiceAction,
} from "@/lib/finance/invoice";
import { InvoiceFormDialog } from "./invoice-form";
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

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type EditData = {
  subtotal: number;
  vat_rate: number;
  due_date: string | null;
  description: string | null;
};

/**
 * Role-gated invoice action bar. `actions` is computed server-side by
 * nextInvoiceActions(); every control maps to a SECURITY DEFINER function that
 * re-checks authority — so this only decides what to *offer*, never what's allowed.
 */
export function InvoiceActions({
  invoiceId,
  projectId,
  projectName,
  actions,
  editData,
}: {
  invoiceId: string;
  projectId: string;
  projectName: string;
  actions: InvoiceAction[];
  editData: EditData;
}) {
  const has = (a: InvoiceAction) => actions.includes(a);
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">لا تتوفر إجراءات على هذه الفاتورة لك.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {has("edit") ? (
        <InvoiceFormDialog
          projects={[{ id: projectId, name: projectName }]}
          invoice={{ id: invoiceId, project_id: projectId, ...editData }}
          trigger={
            <Button variant="outline">
              <Pencil className="size-4" />
              تعديل
            </Button>
          }
        />
      ) : null}

      {has("send") ? (
        <ConfirmDialog
          action={sendInvoice}
          invoiceId={invoiceId}
          projectId={projectId}
          title="إرسال الفاتورة"
          description="بعد الإرسال يمكن تسجيل الدفعات، ولا يمكن تعديل الفاتورة."
          confirmLabel="إرسال"
          trigger={
            <Button>
              <Send className="size-4" />
              إرسال
            </Button>
          }
        />
      ) : null}

      {has("record_payment") ? <PaymentDialog invoiceId={invoiceId} projectId={projectId} /> : null}

      {has("note") ? (
        <ConfirmDialog
          action={addInvoiceNote}
          invoiceId={invoiceId}
          projectId={projectId}
          title="ملاحظة تحصيل"
          description="سجّل متابعة التحصيل (مثل: اتصلنا بالعميل ووعد بالسداد)."
          confirmLabel="إضافة"
          noteRequired
          trigger={
            <Button variant="outline">
              <MessageSquarePlus className="size-4" />
              ملاحظة تحصيل
            </Button>
          }
        />
      ) : null}

      {has("void") ? (
        <ConfirmDialog
          action={voidInvoice}
          invoiceId={invoiceId}
          projectId={projectId}
          title="إلغاء الفاتورة"
          description="ستصبح الفاتورة ملغاة وتخرج من المتأخرات والتحصيل. تبقى دفعاتها محفوظة للمراجعة."
          confirmLabel="إلغاء الفاتورة"
          destructive
          trigger={
            <Button variant="outline" className="text-destructive">
              <Ban className="size-4" />
              إلغاء
            </Button>
          }
        />
      ) : null}

      {has("delete") ? <DeleteInvoiceDialog invoiceId={invoiceId} projectId={projectId} /> : null}
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

/** Generic confirm dialog with an optional/required note → send/note/void. */
function ConfirmDialog({
  action,
  invoiceId,
  projectId,
  title,
  description,
  confirmLabel,
  noteRequired,
  destructive,
  trigger,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  invoiceId: string;
  projectId: string;
  title: string;
  description?: string;
  confirmLabel: string;
  noteRequired?: boolean;
  destructive?: boolean;
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
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="c-note">{noteRequired ? "الملاحظة" : "ملاحظة (اختياري)"}</Label>
            <Textarea id="c-note" name="note" rows={3} required={noteRequired} />
          </div>
          <DialogFooter>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "جارٍ التنفيذ…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoiceId, projectId }: { invoiceId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (notify(await recordPayment(formData))) setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CreditCard className="size-4" />
          تسجيل دفعة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
          <DialogDescription>لا يمكن أن تتجاوز الدفعة المبلغ المتبقّي على الفاتورة.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="pay-amount">المبلغ (ر.س)</Label>
            <Input id="pay-amount" name="amount" type="number" min={0} step="0.01" dir="ltr" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-method">طريقة الدفع</Label>
            <select id="pay-method" name="method" defaultValue="bank_transfer" className={SELECT_CLASS}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">تاريخ الدفع</Label>
            <Input id="pay-date" name="paid_at" type="date" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">مرجع (اختياري)</Label>
            <Input id="pay-ref" name="reference" dir="ltr" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pay-note">ملاحظة (اختياري)</Label>
            <Textarea id="pay-note" name="note" rows={2} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "تسجيل الدفعة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteInvoiceDialog({ invoiceId, projectId }: { invoiceId: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function onDelete() {
    const fd = new FormData();
    fd.set("invoice_id", invoiceId);
    if (projectId) fd.set("project_id", projectId);
    startTransition(async () => {
      if (notify(await deleteInvoice(fd))) router.push("/invoices");
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
          <AlertDialogTitle>حذف المسودة؟</AlertDialogTitle>
          <AlertDialogDescription>
            يمكن حذف المسودات فقط (بدون دفعات). لا يمكن التراجع عن هذا الإجراء.
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
