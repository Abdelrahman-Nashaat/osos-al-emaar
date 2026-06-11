import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";
import { createClient } from "@/lib/supabase/server";
import { fetchAttachments } from "@/lib/attachments/list";
import { isImageAttachment } from "@/lib/attachments/shared";
import { PermissionDenied } from "@/components/permission-denied";
import { AttachmentsCard } from "@/components/attachments-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortfolioFormDialog } from "../portfolio-form";
import { PortfolioGallery, type GalleryImage } from "../portfolio-gallery";
import { DeletePortfolioItemButton } from "../delete-item-button";
import { must } from "@/lib/supabase/fetch";

/** Portfolio item detail: info, gallery, cover pick, attachments upload. */
export default async function PortfolioItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions();
  if (!can(perms, "portfolio.view")) return <PermissionDenied />;
  const canEdit = can(perms, "portfolio.edit");

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("fetch_failed: portfolio.detail");
  if (!item) notFound();

  const [attachments, projects] = await Promise.all([
    fetchAttachments("portfolio", id),
    canEdit
      ? must(
          "portfolio.projects",
          supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
        )
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const imageAttachments = attachments.filter(isImageAttachment);
  const urlByPath = new Map<string, string>();
  if (imageAttachments.length > 0) {
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrls(imageAttachments.map((a) => a.storage_path), 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
    }
  }
  const gallery: GalleryImage[] = imageAttachments
    .map((a) => ({
      attachmentId: a.id,
      url: urlByPath.get(a.storage_path) ?? "",
      fileName: a.file_name,
      isCover: a.storage_path === item.cover_path,
    }))
    .filter((g) => g.url);

  const meta = [item.category, item.city, item.year].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/portfolio" className="text-sm text-muted-foreground hover:underline">
            → معرض الأعمال
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>
            {!item.is_published ? <Badge variant="secondary">مسودة</Badge> : null}
          </div>
          {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <PortfolioFormDialog
              projects={projects}
              item={{
                id: item.id,
                title: item.title,
                description: item.description,
                category: item.category,
                city: item.city,
                year: item.year,
                project_id: item.project_id,
                is_published: item.is_published,
              }}
              trigger={
                <Button size="sm" variant="outline">
                  <Pencil className="size-4" /> تعديل
                </Button>
              }
            />
            <DeletePortfolioItemButton id={item.id} title={item.title} />
          </div>
        ) : null}
      </div>

      {item.description ? (
        <Card>
          <CardContent className="pt-0">
            <p className="whitespace-pre-wrap text-sm leading-7" dir="auto">
              {item.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الصور</CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioGallery itemId={item.id} images={gallery} canEdit={canEdit} />
        </CardContent>
      </Card>

      {item.project_id ? (
        <p className="text-sm text-muted-foreground">
          مرتبط بمشروع:{" "}
          <Link href={`/projects/${item.project_id}`} className="font-medium hover:underline">
            فتح المشروع
          </Link>
        </p>
      ) : null}

      <AttachmentsCard
        entityType="portfolio"
        entityId={item.id}
        items={attachments}
        canUpload={canEdit}
        currentUserId={session.userId}
        isManager={session.profile.role === "manager"}
        title="المرفقات والصور"
      />
    </div>
  );
}
