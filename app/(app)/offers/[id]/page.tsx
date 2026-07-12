import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { getOfficeSettings } from "@/lib/office/settings";
import { fetchAttachments } from "@/lib/attachments/list";
import { formatMoney } from "@/lib/projects/money";
import { formatDate, formatDateLong } from "@/lib/format/date";
import { nextOfferActions } from "@/lib/offers/offer";
import { PermissionDenied } from "@/components/permission-denied";
import { AttachmentsCard } from "@/components/attachments-card";
import { PrintLetterhead } from "@/components/print/letterhead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintButton } from "../../invoices/print-button";
import { ShareButton } from "@/components/share-button";
import { OfferStatusBadge } from "../offer-status-badge";
import { OfferActions } from "../offer-actions";
import { OfferFormDialog } from "../offer-form";
import { OfferTimeline } from "../offer-timeline";

function Field({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}

/** Offer detail + printable quotation. FINANCIAL surface (manager + accountant). */
export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view") || !can(perms, "offers.view")) return <PermissionDenied />;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: offer, error } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("fetch_failed: offer.detail");
  if (!offer) notFound();

  const [clientRes, events, directory, attachments, office] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, company, address")
      .eq("id", offer.client_id)
      .maybeSingle(),
    must(
      "offer.events",
      supabase
        .from("offer_events")
        .select("id, event_type, amount, note, created_at, actor_id")
        .eq("offer_id", id)
        .order("created_at", { ascending: true }),
    ),
    must("offer.directory", supabase.rpc("team_directory")),
    fetchAttachments("offer", id),
    getOfficeSettings(),
  ]);
  if (clientRes.error) throw new Error("fetch_failed: offer.client");
  const client = clientRes.data;
  if (!client) notFound();

  const names = new Map(directory.map((d) => [d.id, d.full_name]));
  const isManager = session.profile.role === "manager";
  const actions = nextOfferActions(offer.status, {
    isManager,
    canEdit: can(perms, "offers.edit"),
    converted: Boolean(offer.project_id),
  });

  return (
    <div className="space-y-6">
      {/* ── Screen view ── */}
      <div className="no-print space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Link href="/offers" className="text-sm text-muted-foreground hover:underline">
              → العروض
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight" dir="ltr">
                {offer.offer_number}
              </h1>
              <OfferStatusBadge status={offer.status} />
            </div>
            <p className="text-sm text-muted-foreground">{offer.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton
              title={`عرض ${offer.offer_number}`}
              text={`عرض سعر من ${office.office_name}`}
              url={`/offers/${offer.id}`}
            />
            <PrintButton label="طباعة العرض / PDF" />
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">الإجراءات</CardTitle>
            {actions.includes("edit") ? (
              <OfferFormDialog
                clients={[{ id: client.id, name: client.name }]}
                offer={{
                  id: offer.id,
                  client_id: offer.client_id,
                  title: offer.title,
                  scope: offer.scope,
                  subtotal: offer.subtotal,
                  vat_rate: offer.vat_rate,
                  valid_until: offer.valid_until,
                }}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="size-4" /> تعديل
                  </Button>
                }
              />
            ) : null}
          </CardHeader>
          <CardContent>
            <OfferActions
              offerId={offer.id}
              offerTitle={offer.title}
              actions={actions.filter((a) => a !== "edit")}
            />
            {offer.project_id ? (
              <p className="mt-3 text-sm text-muted-foreground">
                حُوّل إلى مشروع:{" "}
                <Link href={`/projects/${offer.project_id}`} className="font-medium hover:underline">
                  فتح المشروع
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">المبالغ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="المبلغ قبل الضريبة" value={formatMoney(offer.subtotal)} ltr />
            <Field label={`الضريبة (${offer.vat_rate}%)`} value={formatMoney(offer.vat_amount)} ltr />
            <Field label="الإجمالي" value={formatMoney(offer.total)} ltr />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">التفاصيل</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="العميل" value={client.name} />
            <Field label="تاريخ الإصدار" value={formatDate(offer.issue_date)} />
            <Field label="صالح حتى" value={formatDate(offer.valid_until)} />
            {offer.scope ? (
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs text-muted-foreground">نطاق العمل</p>
                <p className="whitespace-pre-wrap text-sm" dir="auto">
                  {offer.scope}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <AttachmentsCard
          entityType="offer"
          entityId={offer.id}
          items={attachments}
          canUpload={can(perms, "financials.view")}
          currentUserId={session.userId}
          isManager={isManager}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">السجل</CardTitle>
          </CardHeader>
          <CardContent>
            <OfferTimeline
              events={events.map((e) => ({
                id: e.id,
                event_type: e.event_type,
                amount: e.amount,
                note: e.note,
                created_at: e.created_at,
                actor_name: e.actor_id ? (names.get(e.actor_id) ?? null) : null,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Print document (quotation on letterhead) ── */}
      <div className="hidden print:block">
        <div className="space-y-6 text-black">
          <PrintLetterhead office={office} />
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">عرض سعر</h1>
              <p className="text-sm text-neutral-700" dir="ltr">
                {offer.offer_number}
              </p>
            </div>
            <div className="text-end text-sm leading-6">
              <p>التاريخ: {formatDateLong(offer.issue_date)}</p>
              {offer.valid_until ? <p>صالح حتى: {formatDateLong(offer.valid_until)}</p> : null}
            </div>
          </div>

          <div className="rounded border border-neutral-300 p-3 text-sm leading-6">
            <p>
              <span className="font-bold">السادة/</span> {client.name}
              {client.company && client.company !== client.name ? ` — ${client.company}` : ""}
            </p>
            {client.address ? <p>{client.address}</p> : null}
            <p className="mt-2">
              تحية طيبة وبعد، يسرّنا تقديم عرض سعرنا التالي:
            </p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-start">
                <th className="py-2 text-start">البيان</th>
                <th className="py-2 text-end">المبلغ (ر.س)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-300 align-top">
                <td className="py-3">
                  <p className="font-medium">{offer.title}</p>
                  {offer.scope ? (
                    <p className="mt-1 whitespace-pre-wrap text-neutral-700">{offer.scope}</p>
                  ) : null}
                </td>
                <td className="py-3 text-end" dir="ltr">
                  {formatMoney(offer.subtotal)}
                </td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="py-2">ضريبة القيمة المضافة ({offer.vat_rate}%)</td>
                <td className="py-2 text-end" dir="ltr">
                  {formatMoney(offer.vat_amount)}
                </td>
              </tr>
              <tr className="font-bold">
                <td className="py-2">الإجمالي</td>
                <td className="py-2 text-end" dir="ltr">
                  {formatMoney(offer.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {office.invoice_footer ? (
            <p className="text-sm leading-6 text-neutral-700">{office.invoice_footer}</p>
          ) : null}
          <p className="text-sm">وتفضلوا بقبول فائق الاحترام والتقدير،،،</p>
          <div className="pt-8 text-sm">
            <p className="font-bold">{office.office_name}</p>
            <p className="mt-10 border-t border-neutral-400 pt-1 text-neutral-600">التوقيع والختم</p>
          </div>
        </div>
      </div>
    </div>
  );
}
