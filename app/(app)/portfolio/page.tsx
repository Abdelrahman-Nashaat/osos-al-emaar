import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageIcon, Plus } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/supabase/fetch";
import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PortfolioFormDialog } from "./portfolio-form";

/**
 * «معرض الأعمال» — the office's completed-work gallery (Hamza's own pick).
 * Visible to all staff; curated by portfolio.edit (manager). No amounts ever.
 */
export default async function PortfolioPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "portfolio.view")) return <PermissionDenied />;
  const canEdit = can(perms, "portfolio.edit");

  const supabase = await createClient();
  const [items, projects] = await Promise.all([
    must(
      "portfolio.list",
      supabase
        .from("portfolio_items")
        .select("id, title, category, city, year, cover_path, is_published")
        .order("sort_order", { ascending: true })
        .order("year", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ),
    canEdit
      ? must(
          "portfolio.projects",
          supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
        )
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  // Signed cover URLs in one batch (private bucket — no public URLs anywhere).
  const coverPaths = items.map((i) => i.cover_path).filter((p): p is string => Boolean(p));
  const coverUrl = new Map<string, string>();
  if (coverPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrls(coverPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) coverUrl.set(s.path, s.signedUrl);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">معرض الأعمال</h1>
          <p className="text-sm text-muted-foreground">
            أعمال المكتب المنجزة — واجهة المكتب أمام عملائه الجدد.
          </p>
        </div>
        {canEdit ? (
          <PortfolioFormDialog
            projects={projects}
            trigger={
              <Button>
                <Plus className="size-4" />
                <span>إضافة عمل</span>
              </Button>
            }
          />
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          لا توجد أعمال في المعرض بعد.
          {canEdit ? " أضف أول عمل منجز مع صوره ليصبح سجلّ المكتب البصري." : ""}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const url = item.cover_path ? coverUrl.get(item.cover_path) : undefined;
            return (
              <li key={item.id}>
                <Link
                  href={`/portfolio/${item.id}`}
                  className="group block overflow-hidden rounded-xl border border-border transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL host varies; next/image needs static remotePatterns
                      <img
                        src={url}
                        alt={item.title}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-10" aria-hidden />
                      </div>
                    )}
                    {!item.is_published ? (
                      <Badge variant="secondary" className="absolute start-2 top-2">
                        مسودة
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.category, item.city, item.year].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
