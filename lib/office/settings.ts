import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/lib/config/brand";
import type { Database } from "@/lib/supabase/database.types";

export type OfficeSettings = Database["public"]["Tables"]["office_settings"]["Row"];

/**
 * The singleton office identity row («إعدادات المكتب»). RLS lets every active
 * staff member read it; a missing row (never expected — 0018 seeds it) falls
 * back to the static brand so prints and headers never break.
 */
export const getOfficeSettings = cache(async (): Promise<OfficeSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("office_settings").select("*").eq("id", true).maybeSingle();
  if (data) return data;
  return {
    id: true,
    office_name: brand.nameAr,
    office_name_en: brand.nameEn,
    cr_number: null,
    vat_number: null,
    address: null,
    city: null,
    phone: null,
    email: null,
    website: null,
    invoice_footer: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
});
