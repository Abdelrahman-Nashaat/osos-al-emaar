"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteClient } from "./actions";
import { ClientFormDialog, type ClientRow } from "./client-form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function ClientsTable({
  clients,
  canEdit,
}: {
  clients: ClientRow[];
  canEdit: boolean;
}) {
  if (clients.length === 0) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        لا يوجد عملاء بعد.
      </p>
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الجهة</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>العنوان</TableHead>
              {canEdit ? <TableHead className="text-end">إجراءات</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/clients/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.company ?? "—"}</TableCell>
                <TableCell dir="ltr" className="text-end text-muted-foreground">
                  {c.phone ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.address ?? "—"}</TableCell>
                {canEdit ? (
                  <TableCell className="text-end">
                    <RowActions client={c} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (no horizontal scroll) */}
      <div className="space-y-3 md:hidden">
        {clients.map((c) => (
          <div key={c.id} className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              {canEdit ? <RowActions client={c} /> : null}
            </div>
            {c.company ? <div className="text-sm text-muted-foreground">{c.company}</div> : null}
            {c.phone ? (
              <div dir="ltr" className="text-end text-sm text-muted-foreground">
                {c.phone}
              </div>
            ) : null}
            {c.address ? <div className="text-sm text-muted-foreground">{c.address}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}

function RowActions({ client }: { client: ClientRow }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const res = await deleteClient(client.id);
      if (res.error) toast.error(res.error);
      else toast.success(res.success ?? "تم");
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <ClientFormDialog
        client={client}
        trigger={
          <Button variant="ghost" size="icon" className="size-10" aria-label="تعديل العميل">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10 text-destructive" aria-label="حذف العميل">
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العميل «{client.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء، ولا يمكن حذف عميل مرتبط بمشاريع.
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
    </div>
  );
}
