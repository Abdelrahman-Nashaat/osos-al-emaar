"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { setProjectFinancials } from "./actions";
import { formatMoney } from "@/lib/projects/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Financials = {
  budget: number | null;
  contract_value: number | null;
  cost: number | null;
  currency: string;
  notes: string | null;
};

/**
 * Financial summary for a project. This component is only ever RENDERED on the
 * server when the viewer can_view_financials() — engineers never receive it or its
 * data. `canEdit` is true only for the manager (financial writes are manager-only).
 */
export function ProjectFinancialsCard({
  projectId,
  financials,
  canEdit,
}: {
  projectId: string;
  financials: Financials | null;
  canEdit: boolean;
}) {
  const currency = financials?.currency ?? "SAR";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">المالية</CardTitle>
        {canEdit ? <FinancialsDialog projectId={projectId} financials={financials} /> : null}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Stat label="الميزانية" value={formatMoney(financials?.budget ?? null, currency)} />
        <Stat label="قيمة العقد" value={formatMoney(financials?.contract_value ?? null, currency)} />
        <Stat label="التكلفة" value={formatMoney(financials?.cost ?? null, currency)} />
        {financials?.notes ? (
          <p className="text-sm text-muted-foreground sm:col-span-3">{financials.notes}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FinancialsDialog({
  projectId,
  financials,
}: {
  projectId: string;
  financials: Financials | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await setProjectFinancials(formData);
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
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          تعديل
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل المبالغ</DialogTitle>
          <DialogDescription>تظهر هذه المبالغ للمدير العام والمحاسب فقط.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="project_id" defaultValue={projectId} />
          <div className="space-y-2">
            <Label htmlFor="f-budget">الميزانية (ر.س)</Label>
            <Input
              id="f-budget"
              name="budget"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              defaultValue={financials?.budget ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-contract">قيمة العقد (ر.س)</Label>
            <Input
              id="f-contract"
              name="contract_value"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              defaultValue={financials?.contract_value ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-cost">التكلفة (ر.س)</Label>
            <Input
              id="f-cost"
              name="cost"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              defaultValue={financials?.cost ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-notes">ملاحظات مالية</Label>
            <Textarea id="f-notes" name="notes" rows={2} defaultValue={financials?.notes ?? ""} />
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
