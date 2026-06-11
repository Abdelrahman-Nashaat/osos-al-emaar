import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// The proxy matcher excludes /api/* — this route MUST self-authenticate.
// MANAGER-ONLY (Phase 4.5 C3): the office's Free-plan recovery story is this
// export + the manual pg_dump runbook (docs/OPERATIONS.md) until the
// Pre-Launch Production Gate upgrades the org to Pro.

const ENTITIES = {
  clients: "id, name, company, phone, email, address, country, notes, created_at",
  projects: "id, name, code, client_id, status, progress, start_date, due_date, description, created_at",
  project_financials: "project_id, budget, contract_value, cost, currency, notes, updated_at",
  project_members: "project_id, user_id, added_by, added_at",
  tasks: "id, title, description, project_id, status, priority, progress, due_at, current_assignee_id, created_at",
  task_events: "id, task_id, actor_id, event_type, from_status, to_status, from_assignee, to_assignee, note, metadata, created_at",
  invoices: "id, invoice_number, project_id, client_id, status, issue_date, due_date, subtotal, vat_rate, vat_amount, total, amount_paid, currency, description, created_at",
  payments: "id, invoice_id, amount, paid_at, method, reference, notes, is_reversed, reversed_at, reversal_note, created_at",
  invoice_events: "id, invoice_id, actor_id, event_type, amount, from_status, to_status, note, created_at",
  offers: "id, offer_number, client_id, title, scope, status, issue_date, valid_until, subtotal, vat_rate, vat_amount, total, currency, notes, project_id, created_at",
  offer_events: "id, offer_id, actor_id, event_type, amount, from_status, to_status, note, created_at",
  attachments: "id, entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at",
  portfolio_items: "id, title, description, category, city, year, project_id, cover_path, is_published, created_at",
  office_settings: "id, office_name, office_name_en, cr_number, vat_number, address, city, phone, email, website, invoice_footer, created_at",
  profiles: "id, full_name, email, role, is_active, created_at",
  audit_log: "id, actor_id, action, target_type, target_id, metadata, created_at",
} as const;

type Entity = keyof typeof ENTITIES;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // CSV formula-injection guard: Excel executes cells starting with = + - @
    // (or tab/CR). User-entered names/notes land in these files — neutralize.
    if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "manager") {
    return NextResponse.json(
      { error: "التصدير للمدير العام فقط." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient(); // user-scoped: manager RLS sees everything
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const entityParam = url.searchParams.get("entity");
  const stamp = new Date().toISOString().slice(0, 10);

  // Dynamic table names blow up the generated union types — use a minimal
  // structural client type (RLS still applies; this is type-level only).
  type LooseClient = {
    from(table: string): {
      select(cols: string): {
        order(
          col: string,
          opts: { ascending: boolean },
        ): {
          limit(
            n: number,
          ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const loose = supabase as unknown as LooseClient;
  const ORDER_COL: Partial<Record<Entity, string>> = {
    project_financials: "updated_at",
    project_members: "added_at",
  };

  const fetchEntity = async (entity: Entity) => {
    const { data, error } = await loose
      .from(entity)
      .select(ENTITIES[entity])
      .order(ORDER_COL[entity] ?? "created_at", { ascending: true })
      .limit(10000);
    if (error) throw new Error(`${entity}: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };

  try {
    if (format === "csv") {
      if (!entityParam || !(entityParam in ENTITIES)) {
        return NextResponse.json(
          { error: "كيان غير معروف." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const entity = entityParam as Entity;
      const rows = await fetchEntity(entity);
      await supabase.from("audit_log").insert({
        actor_id: session.userId,
        action: "export.run",
        target_type: "export",
        target_id: entity,
        metadata: { format: "csv", rows: rows.length },
      });
      // BOM so Excel opens Arabic text correctly.
      return new NextResponse(`﻿${toCsv(rows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="osos-${entity}-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const snapshot: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const entity of Object.keys(ENTITIES) as Entity[]) {
      snapshot[entity] = await fetchEntity(entity);
    }
    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "export.run",
      target_type: "export",
      target_id: "full",
      metadata: { format: "json" },
    });
    return new NextResponse(JSON.stringify(snapshot, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="osos-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export.run] failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "تعذّر إنشاء النسخة — حاول مرة أخرى." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
