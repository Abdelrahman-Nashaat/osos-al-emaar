import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { PermissionDenied } from "@/components/permission-denied";
import { LIST_PAGE_SIZE, Pager, SearchBox, parseListParams } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { OfferFormDialog } from "./offer-form";
import { OffersTable, type OfferListRow } from "./offers-table";
import type { OfferStatus } from "@/lib/offers/offer";

const FILTERS: { id: string; label: string; status?: OfferStatus }[] = [
  { id: "all", label: "الكل" },
  { id: "draft", label: "مسودات", status: "draft" },
  { id: "sent", label: "مُرسلة", status: "sent" },
  { id: "accepted", label: "مقبولة", status: "accepted" },
  { id: "rejected", label: "مرفوضة", status: "rejected" },
  { id: "expired", label: "منتهية", status: "expired" },
];

/** «العروض» — quotations pipeline. FINANCIAL surface: manager + accountant only. */
export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; filter?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "financials.view") || !can(perms, "offers.view")) return <PermissionDenied />;

  const params = await searchParams;
  const { q, page, from, to } = parseListParams(params);
  const filter = FILTERS.find((f) => f.id === (params.filter ?? "all")) ?? FILTERS[0];
  const canEdit = can(perms, "offers.edit");

  const supabase = await createClient();

  let query = supabase
    .from("offers")
    .select("id, offer_number, title, status, total, valid_until, issue_date, project_id, client_id")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (filter.status) query = query.eq("status", filter.status);
  if (q) query = query.or(`offer_number.ilike.%${q}%,title.ilike.%${q}%`);

  const [rows, clients, counts] = await Promise.all([
    must("offers.list", query),
    must("offers.clients", supabase.from("clients").select("id, name").order("name")),
    must(
      "offers.counts",
      supabase.from("offers").select("status"),
    ),
  ]);

  const hasMore = rows.length > LIST_PAGE_SIZE;
  const visible = rows.slice(0, LIST_PAGE_SIZE);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const countFor = (f: (typeof FILTERS)[number]) =>
    f.status ? counts.filter((c) => c.status === f.status).length : counts.length;

  const list: OfferListRow[] = visible.map((o) => ({
    id: o.id,
    offer_number: o.offer_number,
    title: o.title,
    status: o.status,
    total: o.total,
    valid_until: o.valid_until,
    issue_date: o.issue_date,
    client_name: clientName.get(o.client_id) ?? "—",
    converted: Boolean(o.project_id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">العروض</h1>
          <p className="text-sm text-muted-foreground">
            عروض الأسعار من الطلب حتى القبول وتحويلها إلى مشاريع.
          </p>
        </div>
        {canEdit ? (
          <OfferFormDialog
            clients={clients}
            trigger={
              <Button>
                <Plus className="size-4" />
                <span>عرض جديد</span>
              </Button>
            }
          />
        ) : null}
      </div>

      <div className="no-print flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.id === filter.id;
          return (
            <Link
              key={f.id}
              href={f.id === "all" ? "/offers" : `/offers?filter=${f.id}`}
              className={
                active
                  ? "inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground"
                  : "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {f.label}
              <span className="text-xs tabular-nums">{countFor(f)}</span>
            </Link>
          );
        })}
      </div>

      <SearchBox placeholder="ابحث برقم العرض أو موضوعه…" q={q} hidden={{ filter: params.filter }} />

      <OffersTable offers={list} />

      <Pager
        page={page}
        hasMore={hasMore}
        basePath="/offers"
        params={{ q: q || undefined, filter: params.filter }}
      />
    </div>
  );
}
