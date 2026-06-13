/**
 * Demo office seed — a full fictional Dammam engineering consulting office that
 * has actively used the app Feb→Jun 2026. Drives the REAL SECURITY DEFINER RPCs
 * (signed in as each persona) so all state/events/audit are production-computed,
 * then backdates timestamps so it reads as months of history.
 *
 * Run ONLY against the demo project:  ENV_FILE=.env.demo.local npm run seed:demo
 * (engine.ts refuses to run against the protected clean/production ref.)
 *
 * Everything here is ENTIRELY FICTIONAL — names, CR/VAT numbers, phones, amounts.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  admin,
  ensurePersona,
  rpc,
  backdate,
  deactivate,
  resetDemo,
  iso,
  type Persona,
} from "./engine";

const DEMO_PW = process.env.DEMO_PASSWORD ?? "OsosDemo!2026";
const ASSETS = join("scripts", "demo", "assets");

// ───────────────────────────── Personas ─────────────────────────────
const PERSONAS = {
  khalid: { email: "manager@osos-demo.example", fullName: "م. خالد بن سعد القحطاني", role: "manager" as const },
  abdullah: { email: "eng.abdullah@osos-demo.example", fullName: "م. عبدالله بن فهد الدوسري", role: "engineer" as const },
  reem: { email: "eng.reem@osos-demo.example", fullName: "م. ريم بنت ناصر العتيبي", role: "engineer" as const },
  majed: { email: "eng.majed@osos-demo.example", fullName: "م. ماجد بن علي الشهري", role: "engineer" as const },
  salman: { email: "accountant@osos-demo.example", fullName: "أ. سلمان بن إبراهيم الزهراني", role: "accountant" as const },
  // Familiar logins so the operator + Hamza can sign into the demo directly.
  operator: { email: "emara01111@gmail.com", fullName: "عبدالرحمن نشأت (تجريبي)", role: "manager" as const },
  hamza: { email: "alhemyari003@gmail.com", fullName: "م. حمزة الحميري (تجريبي)", role: "manager" as const },
};

// ───────────────────────────── Clients ─────────────────────────────
type ClientSeed = {
  key: string; name: string; company?: string; phone: string; city: string;
  vat_number?: string; cr_number?: string; notes?: string; created: string;
};
const CLIENTS: ClientSeed[] = [
  { key: "rajhi", name: "شركة الراجحي للتطوير العقاري", company: "شركة الراجحي للتطوير العقاري", phone: "0551002030", city: "الدمام", vat_number: "300055002700003", cr_number: "2050118890", notes: "عميل مؤسسي — مشاريع فلل متعددة. التواصل عبر إدارة المشاريع.", created: "2026-02-03" },
  { key: "nukhba", name: "مؤسسة نخبة البناء للمقاولات", company: "مؤسسة نخبة البناء للمقاولات", phone: "0552003040", city: "الخبر", vat_number: "300066003800003", cr_number: "2051220034", notes: "مقاول تنفيذ — يطلب مخططات تنفيذية وإشراف.", created: "2026-02-10" },
  { key: "khaleej", name: "شركة الخليج للاستثمار العقاري", company: "شركة الخليج للاستثمار العقاري", phone: "0553004050", city: "الظهران", vat_number: "300077004900003", cr_number: "2052330099", notes: "مجمعات سكنية واستثمارية.", created: "2026-02-18" },
  { key: "fahad", name: "الأستاذ/ فهد بن عبدالعزيز القحطاني", phone: "0554005060", city: "الدمام", notes: "فيلا خاصة — حي الشاطئ.", created: "2026-02-22" },
  { key: "noura", name: "الدكتورة/ نورة بنت سعد العتيبي", phone: "0555006070", city: "الخبر", notes: "فيلا سكنية — حي العقربية.", created: "2026-03-02" },
  { key: "saud", name: "الأستاذ/ سعود بن محمد الدوسري", phone: "0556007080", city: "الجبيل", notes: "ملحق وإعادة تأهيل.", created: "2026-03-11" },
  { key: "badr", name: "الأستاذ/ بدر بن خالد الشمري", phone: "0557008090", city: "الدمام", notes: "فيلا دورين + شقة ملحقة.", created: "2026-03-20" },
  { key: "munira", name: "الأستاذة/ منيرة بنت علي الحربي", phone: "0558009010", city: "الخبر", notes: "استراحة عائلية.", created: "2026-04-05" },
  { key: "waha", name: "مجموعة الواحة التجارية", company: "مجموعة الواحة التجارية", phone: "0559010020", city: "الدمام", vat_number: "300088006100003", cr_number: "2053440055", notes: "مبنى تجاري — معارض ومكاتب.", created: "2026-04-14" },
];

// ───────────────────────────── Offers ─────────────────────────────
// outcome: 'converted' → becomes a project; others end in a terminal offer state.
type OfferSeed = {
  key: string; client: string; title: string; scope: string; subtotal: number;
  created: string; valid_until: string;
  outcome: "converted" | "sent" | "rejected" | "expired" | "draft";
  projectName?: string; start_date?: string; due_date?: string; rejectNote?: string;
};
const OFFERS: OfferSeed[] = [
  { key: "of_fahad_villa", client: "fahad", title: "تصميم معماري وإنشائي — فيلا سكنية", scope: "إعداد التصاميم المعمارية والإنشائية الكاملة لفيلا سكنية (دور أرضي + أول + ملحق علوي)، بمساحة أرض 600م²، تشمل المخططات التنفيذية واعتماد البلدية.", subtotal: 65000, created: "2026-02-24", valid_until: "2026-03-24", outcome: "converted", projectName: "فيلا الأستاذ فهد القحطاني", start_date: "2026-03-01", due_date: "2026-07-15" },
  { key: "of_noura_villa", client: "noura", title: "تصميم معماري — فيلا حي العقربية", scope: "تصميم معماري متكامل لفيلا سكنية حديثة، يشمل الواجهات والتصميم الداخلي المبدئي والمخططات التنفيذية.", subtotal: 48000, created: "2026-03-04", valid_until: "2026-04-04", outcome: "converted", projectName: "فيلا الدكتورة نورة العتيبي", start_date: "2026-03-10", due_date: "2026-08-01" },
  { key: "of_rajhi_super", client: "rajhi", title: "إشراف هندسي — مجمع ٦ فلل", scope: "الإشراف الهندسي الدوري على تنفيذ مجمع مكوّن من ٦ فلل سكنية، بمعدل زيارتين أسبوعياً وتقارير إشراف دورية لمدة ١٠ أشهر.", subtotal: 72000, created: "2026-03-14", valid_until: "2026-04-14", outcome: "converted", projectName: "إشراف مجمع الراجحي السكني (٦ فلل)", start_date: "2026-03-20", due_date: "2026-12-31" },
  { key: "of_waha_comm", client: "waha", title: "تصميم إنشائي — مبنى تجاري", scope: "التصميم الإنشائي الكامل لمبنى تجاري من ٤ أدوار (معارض أرضية + مكاتب)، يشمل حساب الأحمال والمخططات التنفيذية.", subtotal: 88000, created: "2026-04-16", valid_until: "2026-05-16", outcome: "converted", projectName: "مبنى الواحة التجاري", start_date: "2026-04-22", due_date: "2026-10-30" },
  { key: "of_badr_villa", client: "badr", title: "تصميم فيلا دورين + ملحق", scope: "تصميم معماري وإنشائي لفيلا دورين مع شقة ملحقة، وإعداد المخططات اللازمة للترخيص.", subtotal: 55000, created: "2026-03-22", valid_until: "2026-04-22", outcome: "converted", projectName: "فيلا الأستاذ بدر الشمري", start_date: "2026-03-28", due_date: "2026-09-15" },
  { key: "of_khaleej_compound", client: "khaleej", title: "تصميم مجمع سكني استثماري", scope: "تصميم معماري لمجمع سكني استثماري (١٢ وحدة)، دراسة الجدوى التصميمية والكتل المعمارية.", subtotal: 120000, created: "2026-05-02", valid_until: "2026-06-02", outcome: "sent" },
  { key: "of_munira_rest", client: "munira", title: "تصميم استراحة عائلية", scope: "تصميم معماري لاستراحة عائلية بمسطحات خضراء ومسبح، يشمل تصميم الموقع العام.", subtotal: 38000, created: "2026-05-12", valid_until: "2026-06-11", outcome: "sent" },
  { key: "of_saud_reno", client: "saud", title: "إعادة تأهيل وترميم ملحق", scope: "دراسة وإعادة تأهيل ملحق قائم وتصميم داخلي، مع تقرير فني بالحالة الإنشائية.", subtotal: 26000, created: "2026-04-08", valid_until: "2026-05-08", outcome: "rejected", rejectNote: "اعتذر العميل لتأجيل المشروع للعام القادم لأسباب مالية." },
  { key: "of_nukhba_pool", client: "nukhba", title: "تصميم مخطط مسبح وملاحق", scope: "تصميم مسبح خارجي وملاحق خدمية ضمن فيلا قائمة.", subtotal: 18000, created: "2026-03-09", valid_until: "2026-04-09", outcome: "expired" },
  { key: "of_waha_fitout", client: "waha", title: "تصميم داخلي للمعارض", scope: "تصميم داخلي لمعارض الدور الأرضي بمبنى الواحة التجاري.", subtotal: 42000, created: "2026-06-05", valid_until: "2026-07-05", outcome: "draft" },
];

// Direct (non-offer) projects to round out the portfolio + history.
type ProjectSeed = {
  key: string; client: string; name: string; code: string;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  progress: number; start_date: string; due_date: string | null; description: string;
  contract_value: number; cost: number; created: string;
};
const DIRECT_PROJECTS: ProjectSeed[] = [
  { key: "pr_rajhi_villa3", client: "rajhi", name: "فيلا نموذج (أ) — مشروع الراجحي", code: "RJ-A1", status: "completed", progress: 100, start_date: "2026-02-05", due_date: "2026-05-20", description: "تصميم وتنفيذ فيلا نموذجية ضمن مشروع الراجحي السكني.", contract_value: 70000, cost: 41000, created: "2026-02-05" },
  { key: "pr_khaleej_office", client: "khaleej", name: "مكتب إدارة مشاريع الخليج", code: "KH-OF", status: "completed", progress: 100, start_date: "2026-02-20", due_date: "2026-05-05", description: "تصميم وتجهيز مكتب إدارة المشاريع.", contract_value: 35000, cost: 19500, created: "2026-02-20" },
  { key: "pr_nukhba_villa", client: "nukhba", name: "فيلا حي الأمواج", code: "NK-AM", status: "active", progress: 55, start_date: "2026-03-15", due_date: "2026-08-20", description: "تصميم وإشراف فيلا سكنية بحي الأمواج.", contract_value: 58000, cost: 33000, created: "2026-03-15" },
  { key: "pr_badr_resthouse", client: "badr", name: "استراحة طريق الملك فهد", code: "BD-RH", status: "on_hold", progress: 30, start_date: "2026-04-01", due_date: "2026-05-30", description: "تصميم استراحة — متوقف بانتظار اعتماد العميل.", contract_value: 44000, cost: 12000, created: "2026-04-01" },
];

async function uploadAsset(
  entityType: "project" | "task" | "client" | "offer" | "invoice" | "portfolio",
  entityId: string,
  assetFile: string,
  displayName: string,
  uploadedBy: string,
  createdISO: string,
): Promise<void> {
  const path = join(ASSETS, assetFile);
  if (!existsSync(path)) return;
  const buf = readFileSync(path);
  const ext = assetFile.split(".").pop() ?? "bin";
  const mime =
    ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : ext === "pdf" ? "application/pdf" : ext === "webm" ? "audio/webm" : "application/octet-stream";
  const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}.${ext}`;
  const up = await admin.storage.from("attachments").upload(storagePath, buf, { contentType: mime, upsert: true });
  if (up.error) {
    console.warn(`  attachment upload skipped (${displayName}): ${up.error.message}`);
    return;
  }
  await admin.from("attachments").insert({
    entity_type: entityType,
    entity_id: entityId,
    storage_path: storagePath,
    file_name: displayName,
    mime_type: mime,
    size_bytes: buf.length,
    uploaded_by: uploadedBy,
    created_at: createdISO,
  });
}

async function main() {
  console.log("Resetting demo data…");
  await resetDemo();

  console.log("Creating personas…");
  const P: Record<string, Persona> = {};
  for (const [key, info] of Object.entries(PERSONAS)) {
    P[key] = await ensurePersona({ key, ...info, password: DEMO_PW });
    console.log(`  ${info.role}: ${info.fullName}`);
  }

  console.log("Office settings (VAT-registered)…");
  await admin.from("office_settings").upsert({
    id: true,
    office_name: "شركة أسس الإعمار المتقدمة",
    office_name_en: "Osos Al-Emaar Advanced Company",
    cr_number: "2050900900",
    vat_number: "300123456700003",
    city: "الدمام",
    address: "حي الفيصلية، شارع الملك فهد، الدمام، المنطقة الشرقية",
    phone: "0138123456",
    email: "info@osos-demo.example",
    invoice_footer: "شكراً لتعاملكم معنا. يُرجى السداد خلال ٣٠ يوماً من تاريخ الفاتورة على حساب الشركة البنكي.",
    updated_by: P.khalid.id,
  });

  console.log("Clients…");
  const clientId: Record<string, string> = {};
  for (const c of CLIENTS) {
    const { data, error } = await admin
      .from("clients")
      .insert({
        name: c.name,
        company: c.company ?? null,
        phone: c.phone,
        email: null,
        address: `${c.city}`,
        country: "SA",
        vat_number: c.vat_number ?? null,
        cr_number: c.cr_number ?? null,
        notes: c.notes ?? null,
        created_by: P.khalid.id,
        created_at: iso(c.created),
      })
      .select("id")
      .single();
    if (error) throw new Error(`client ${c.key}: ${error.message}`);
    clientId[c.key] = data.id;
  }

  console.log("Offers (every state) + conversions…");
  const projectId: Record<string, string> = {};
  for (const o of OFFERS) {
    const id = await rpc<string>(P.khalid, "offer_create", {
      p_client: clientId[o.client],
      p_title: o.title,
      p_subtotal: o.subtotal,
      p_vat_rate: 15,
      p_valid_until: o.valid_until,
      p_scope: o.scope,
    });
    if (o.outcome !== "draft") await rpc(P.khalid, "offer_transition", { p_offer: id, p_to: "sent" });
    if (o.outcome === "converted") {
      await rpc(P.khalid, "offer_transition", { p_offer: id, p_to: "accepted" });
      const pid = await rpc<string>(P.khalid, "offer_convert_to_project", {
        p_offer: id,
        p_name: o.projectName,
        p_start_date: o.start_date,
        p_due_date: o.due_date,
      });
      projectId[o.key] = pid;
    } else if (o.outcome === "rejected") {
      await rpc(P.khalid, "offer_transition", { p_offer: id, p_to: "rejected", p_note: o.rejectNote });
    } else if (o.outcome === "expired") {
      await rpc(P.khalid, "offer_transition", { p_offer: id, p_to: "expired" });
    }
    // Backdate the offer + its events to the offer's timeline.
    await backdate("offers", id, { created_at: iso(o.created), issue_date: o.created });
    await admin.from("offer_events").update({ created_at: iso(o.created) }).eq("offer_id", id);
    if (o.outcome === "converted") {
      // The converted project starts at its real start_date.
      await backdate("projects", projectId[o.key], { created_at: iso(o.start_date ?? o.created) });
    }
    // A signed quotation PDF on one accepted offer.
    if (o.key === "of_fahad_villa") {
      await uploadAsset("offer", id, "drawing-ground-floor.png", "عرض السعر الموقّع — فيلا القحطاني.png", P.khalid.id, iso(o.created));
    }
  }

  console.log("Direct projects + financials + members…");
  const allProjectKeys: string[] = [];
  for (const pr of DIRECT_PROJECTS) {
    const { data, error } = await admin
      .from("projects")
      .insert({
        name: pr.name, code: pr.code, status: pr.status, progress: pr.progress,
        start_date: pr.start_date, due_date: pr.due_date, description: pr.description,
        client_id: clientId[pr.client], created_by: P.khalid.id, created_at: iso(pr.created),
      })
      .select("id")
      .single();
    if (error) throw new Error(`project ${pr.key}: ${error.message}`);
    projectId[pr.key] = data.id;
    await admin.from("project_financials").insert({
      project_id: data.id, contract_value: pr.contract_value, cost: pr.cost,
      currency: "SAR", updated_by: P.khalid.id, created_at: iso(pr.created),
    });
  }
  allProjectKeys.push(...Object.keys(projectId));

  // Assign engineers as members (trigger requires active engineers — majed is
  // still active here; deactivated at the very end).
  const memberPlan: Record<string, Persona[]> = {
    of_fahad_villa: [P.abdullah, P.reem],
    of_noura_villa: [P.reem],
    of_rajhi_super: [P.abdullah, P.majed],
    of_waha_comm: [P.reem, P.majed],
    of_badr_villa: [P.abdullah],
    pr_rajhi_villa3: [P.abdullah, P.reem],
    pr_khaleej_office: [P.majed],
    pr_nukhba_villa: [P.reem, P.abdullah],
    pr_badr_resthouse: [P.majed],
  };
  for (const [pkey, members] of Object.entries(memberPlan)) {
    const pid = projectId[pkey];
    if (!pid) continue;
    for (const m of members) {
      await admin.from("project_members").insert({ project_id: pid, user_id: m.id, added_by: P.khalid.id });
    }
  }

  console.log("Tasks across all states…");
  // helper: run a full task lifecycle and backdate it.
  type TaskPlan = {
    project: string; title: string; desc?: string; assignee: Persona;
    priority?: "low" | "normal" | "high" | "urgent"; due: string | null;
    created: string; last: string;
    flow: "new" | "assigned" | "in_progress" | "submitted" | "closed" | "reopened";
    progress?: number; milestone?: string; note?: string;
  };
  const TASKS: TaskPlan[] = [
    // فيلا القحطاني (of_fahad_villa)
    { project: "of_fahad_villa", title: "رفع مساحي للموقع", assignee: P.abdullah, due: "2026-03-08", created: "2026-03-02", last: "2026-03-07", flow: "closed", priority: "high" },
    { project: "of_fahad_villa", title: "المخططات المعمارية الابتدائية", assignee: P.reem, due: "2026-03-25", created: "2026-03-09", last: "2026-03-24", flow: "closed", milestone: "اعتماد المخطط المعماري" },
    { project: "of_fahad_villa", title: "حساب الأحمال والتصميم الإنشائي", assignee: P.abdullah, due: "2026-04-20", created: "2026-03-26", last: "2026-04-18", flow: "closed" },
    { project: "of_fahad_villa", title: "تعديل ملاحظات البلدية", assignee: P.reem, due: "2026-06-18", created: "2026-05-28", last: "2026-06-10", flow: "in_progress", progress: 60, note: "وردت ملاحظات على الارتدادات، جارٍ التعديل." },
    { project: "of_fahad_villa", title: "إعداد المخططات التنفيذية", assignee: P.abdullah, due: "2026-06-30", created: "2026-06-01", last: "2026-06-08", flow: "in_progress", progress: 35 },
    // فيلا العتيبي (of_noura_villa)
    { project: "of_noura_villa", title: "زيارة الموقع والمعاينة", assignee: P.reem, due: "2026-03-16", created: "2026-03-11", last: "2026-03-15", flow: "closed" },
    { project: "of_noura_villa", title: "تصميم الواجهات", assignee: P.reem, due: "2026-04-30", created: "2026-04-01", last: "2026-04-28", flow: "closed", milestone: "اعتماد الواجهات" },
    { project: "of_noura_villa", title: "التصميم الداخلي المبدئي", assignee: P.reem, due: "2026-06-15", created: "2026-05-20", last: "2026-06-09", flow: "submitted", progress: 100, note: "تم رفع التصميم للمراجعة." },
    { project: "of_noura_villa", title: "تنسيق الموقع العام", assignee: P.abdullah, due: "2026-06-20", created: "2026-06-02", last: "2026-06-02", flow: "assigned" },
    // إشراف مجمع الراجحي (of_rajhi_super)
    { project: "of_rajhi_super", title: "تقرير إشراف أسبوعي — أبريل", assignee: P.majed, due: "2026-04-30", created: "2026-04-01", last: "2026-04-29", flow: "closed" },
    { project: "of_rajhi_super", title: "تقرير إشراف أسبوعي — مايو", assignee: P.abdullah, due: "2026-05-31", created: "2026-05-01", last: "2026-05-30", flow: "closed" },
    { project: "of_rajhi_super", title: "متابعة صب الأساسات — فيلا ٣", assignee: P.abdullah, due: "2026-06-05", created: "2026-05-25", last: "2026-06-04", flow: "closed", priority: "high" },
    { project: "of_rajhi_super", title: "تقرير إشراف أسبوعي — يونيو", assignee: P.abdullah, due: "2026-06-12", created: "2026-06-06", last: "2026-06-11", flow: "submitted", progress: 100 },
    { project: "of_rajhi_super", title: "اعتماد الدفاع المدني — المرحلة الأولى", assignee: P.reem, due: "2026-06-09", created: "2026-05-30", last: "2026-06-01", flow: "in_progress", progress: 40, priority: "urgent" },
    // مبنى الواحة التجاري (of_waha_comm)
    { project: "of_waha_comm", title: "دراسة التربة وتقرير الجسات", assignee: P.reem, due: "2026-05-05", created: "2026-04-22", last: "2026-05-03", flow: "closed" },
    { project: "of_waha_comm", title: "النظام الإنشائي وحساب الأحمال", assignee: P.reem, due: "2026-06-20", created: "2026-05-10", last: "2026-06-09", flow: "in_progress", progress: 70 },
    { project: "of_waha_comm", title: "مخططات السلامة والإطفاء", assignee: P.abdullah, due: "2026-07-01", created: "2026-06-03", last: "2026-06-03", flow: "assigned", priority: "high" },
    // فيلا الشمري (of_badr_villa)
    { project: "of_badr_villa", title: "المخطط المعماري", assignee: P.abdullah, due: "2026-04-25", created: "2026-03-29", last: "2026-04-22", flow: "closed" },
    { project: "of_badr_villa", title: "مخططات الترخيص", assignee: P.abdullah, due: "2026-05-30", created: "2026-05-01", last: "2026-05-28", flow: "reopened", progress: 80, note: "أُعيدت لإضافة مخطط السلامة المطلوب للترخيص." },
    // فيلا نموذج الراجحي (pr_rajhi_villa3) — completed
    { project: "pr_rajhi_villa3", title: "التصميم الكامل والمخططات التنفيذية", assignee: P.reem, due: "2026-03-30", created: "2026-02-06", last: "2026-03-28", flow: "closed", milestone: "تسليم الحزمة التصميمية" },
    { project: "pr_rajhi_villa3", title: "الإشراف على التنفيذ حتى التسليم", assignee: P.abdullah, due: "2026-05-18", created: "2026-04-01", last: "2026-05-18", flow: "closed", milestone: "تسليم المشروع للعميل" },
    // مكتب الخليج (pr_khaleej_office) — completed
    { project: "pr_khaleej_office", title: "التصميم الداخلي والتأثيث", assignee: P.majed, due: "2026-04-30", created: "2026-02-21", last: "2026-04-28", flow: "closed" },
    { project: "pr_khaleej_office", title: "الإشراف على التنفيذ", assignee: P.majed, due: "2026-05-04", created: "2026-04-10", last: "2026-05-03", flow: "closed" },
    // فيلا الأمواج (pr_nukhba_villa) — active
    { project: "pr_nukhba_villa", title: "المخططات المعمارية", assignee: P.reem, due: "2026-04-20", created: "2026-03-16", last: "2026-04-18", flow: "closed" },
    { project: "pr_nukhba_villa", title: "التصميم الإنشائي", assignee: P.abdullah, due: "2026-05-25", created: "2026-04-21", last: "2026-05-22", flow: "closed" },
    { project: "pr_nukhba_villa", title: "المخططات الكهربائية والميكانيكية", assignee: P.reem, due: "2026-06-25", created: "2026-05-26", last: "2026-06-07", flow: "in_progress", progress: 50 },
    { project: "pr_nukhba_villa", title: "مراجعة المخططات قبل الترخيص", assignee: P.abdullah, due: "2026-06-11", created: "2026-06-05", last: "2026-06-06", flow: "submitted", progress: 100 },
    // استراحة الشمري (pr_badr_resthouse) — on_hold (overdue tasks)
    { project: "pr_badr_resthouse", title: "التصميم المبدئي للموقع", assignee: P.majed, due: "2026-05-10", created: "2026-04-02", last: "2026-04-20", flow: "in_progress", progress: 30, note: "متوقف بانتظار اعتماد العميل على المخطط المبدئي." },
    { project: "pr_badr_resthouse", title: "تصميم المسبح والمناطق الخضراء", assignee: P.majed, due: "2026-05-20", created: "2026-04-15", last: "2026-04-15", flow: "assigned" },
  ];

  const taskAttachmentDone = { drawing: false, photo: false, voice: false };
  for (const t of TASKS) {
    const pid = projectId[t.project];
    if (!pid) { console.warn(`  task skipped (no project ${t.project}): ${t.title}`); continue; }
    const tid = await rpc<string>(P.khalid, "task_create", {
      p_title: t.title,
      p_project: pid,
      p_priority: t.priority ?? "normal",
      p_due_at: t.due ? iso(t.due) : undefined,
      p_assignee: t.assignee.id,
    });
    // Walk the lifecycle as the right persona.
    if (t.flow === "in_progress" || t.flow === "submitted" || t.flow === "closed" || t.flow === "reopened") {
      await rpc(t.assignee, "task_start", { p_task: tid });
      const prog = t.progress ?? (t.flow === "closed" ? 100 : 50);
      if (prog > 0 && prog < 100) await rpc(t.assignee, "task_set_progress", { p_task: tid, p_progress: prog });
    }
    if (t.milestone) await rpc(P.khalid, "task_milestone", { p_task: tid, p_label: t.milestone });
    if (t.note) await rpc(t.assignee, "task_add_note", { p_task: tid, p_note: t.note });
    if (t.flow === "submitted") await rpc(t.assignee, "task_submit", { p_task: tid });
    if (t.flow === "closed") {
      await rpc(t.assignee, "task_submit", { p_task: tid });
      await rpc(P.khalid, "task_close", { p_task: tid });
    }
    if (t.flow === "reopened") {
      await rpc(t.assignee, "task_submit", { p_task: tid });
      await rpc(P.khalid, "task_reopen", { p_task: tid, p_note: t.note });
    }
    // Backdate task + its events across [created..last].
    await backdate("tasks", tid, { created_at: iso(t.created), updated_at: iso(t.last) });
    const { data: evs } = await admin
      .from("task_events")
      .select("id")
      .eq("task_id", tid)
      .order("id", { ascending: true });
    const list = evs ?? [];
    const startMs = new Date(iso(t.created)).getTime();
    const endMs = new Date(iso(t.last)).getTime();
    for (let i = 0; i < list.length; i++) {
      const at = new Date(startMs + ((endMs - startMs) * i) / Math.max(1, list.length - 1)).toISOString();
      await backdate("task_events", list[i].id, { created_at: at });
    }
    // A few real-feeling attachments.
    if (!taskAttachmentDone.drawing && t.title.includes("المعماري")) {
      await uploadAsset("task", tid, "drawing-ground-floor.png", "المخطط المعماري — الدور الأرضي.png", t.assignee.id, iso(t.last));
      taskAttachmentDone.drawing = true;
    }
    if (!taskAttachmentDone.photo && t.title.includes("صب")) {
      await uploadAsset("task", tid, "site-photo.jpg", "صورة من الموقع — صب الأساسات.jpg", t.assignee.id, iso(t.last));
      taskAttachmentDone.photo = true;
    }
  }

  console.log("Invoices + payments (all states, aging, reversal, follow-ups)…");
  type InvoiceSeed = {
    project: string; subtotal: number; issue: string; due: string | null;
    desc: string;
    state: "draft" | "sent" | "partial" | "paid" | "void" | "overdue_unpaid" | "overdue_partial" | "reversed";
    payAmount?: number; payDate?: string; method?: "cash" | "bank_transfer" | "cheque" | "card" | "other";
    followUps?: { date: string; note: string }[];
  };
  const INVOICES: InvoiceSeed[] = [
    // Completed projects → mostly paid.
    { project: "pr_rajhi_villa3", subtotal: 35000, issue: "2026-03-01", due: "2026-03-31", desc: "الدفعة الأولى — حزمة التصميم الكامل (فيلا نموذج أ).", state: "paid", payAmount: 40250, payDate: "2026-03-20", method: "bank_transfer" },
    { project: "pr_rajhi_villa3", subtotal: 35000, issue: "2026-05-01", due: "2026-05-31", desc: "الدفعة الثانية — الإشراف حتى التسليم.", state: "paid", payAmount: 40250, payDate: "2026-05-22", method: "bank_transfer" },
    { project: "pr_khaleej_office", subtotal: 35000, issue: "2026-02-25", due: "2026-03-27", desc: "أتعاب التصميم الداخلي والإشراف — مكتب إدارة المشاريع.", state: "paid", payAmount: 40250, payDate: "2026-03-15", method: "cheque" },
    // Active projects → partial / sent.
    { project: "of_fahad_villa", subtotal: 32500, issue: "2026-03-05", due: "2026-04-04", desc: "الدفعة الأولى (50%) — تصميم فيلا القحطاني.", state: "paid", payAmount: 37375, payDate: "2026-03-28", method: "bank_transfer" },
    { project: "of_fahad_villa", subtotal: 32500, issue: "2026-05-20", due: "2026-06-19", desc: "الدفعة الثانية — المخططات التنفيذية والاعتماد.", state: "partial", payAmount: 20000, payDate: "2026-06-02", method: "bank_transfer", followUps: [{ date: "2026-06-10", note: "تم التواصل مع العميل، وعد بسداد المتبقي نهاية الشهر." }] },
    { project: "of_noura_villa", subtotal: 24000, issue: "2026-03-12", due: "2026-04-11", desc: "الدفعة الأولى — تصميم فيلا العتيبي.", state: "paid", payAmount: 27600, payDate: "2026-04-05", method: "card" },
    { project: "of_noura_villa", subtotal: 24000, issue: "2026-05-25", due: "2026-06-24", desc: "الدفعة الثانية — التصميم الداخلي والتنفيذي.", state: "sent" },
    { project: "of_rajhi_super", subtotal: 7200, issue: "2026-04-01", due: "2026-04-30", desc: "أتعاب الإشراف — أبريل ٢٠٢٦.", state: "paid", payAmount: 8280, payDate: "2026-04-20", method: "bank_transfer" },
    { project: "of_rajhi_super", subtotal: 7200, issue: "2026-05-01", due: "2026-05-31", desc: "أتعاب الإشراف — مايو ٢٠٢٦.", state: "paid", payAmount: 8280, payDate: "2026-05-25", method: "bank_transfer" },
    { project: "of_rajhi_super", subtotal: 7200, issue: "2026-06-01", due: "2026-06-30", desc: "أتعاب الإشراف — يونيو ٢٠٢٦.", state: "sent" },
    { project: "of_waha_comm", subtotal: 44000, issue: "2026-04-25", due: "2026-05-25", desc: "الدفعة الأولى — التصميم الإنشائي (مبنى الواحة).", state: "overdue_partial", payAmount: 25000, payDate: "2026-05-15", method: "bank_transfer", followUps: [{ date: "2026-05-28", note: "اتصلنا بإدارة الواحة، أفادوا بأن الدفعة قيد الاعتماد المالي." }, { date: "2026-06-08", note: "إعادة تذكير عبر البريد، وعدوا بالسداد خلال أسبوع." }] },
    { project: "of_badr_villa", subtotal: 27500, issue: "2026-04-01", due: "2026-05-01", desc: "الدفعة الأولى — تصميم فيلا الشمري.", state: "overdue_unpaid", followUps: [{ date: "2026-05-10", note: "تم التواصل، العميل يراجع المخططات قبل السداد." }] },
    { project: "pr_nukhba_villa", subtotal: 29000, issue: "2026-03-18", due: "2026-04-17", desc: "الدفعة الأولى — فيلا الأمواج.", state: "paid", payAmount: 33350, payDate: "2026-04-10", method: "bank_transfer" },
    { project: "pr_nukhba_villa", subtotal: 29000, issue: "2026-05-28", due: null, desc: "الدفعة الثانية — المخططات التنفيذية (بانتظار تحديد تاريخ الاستحقاق).", state: "sent" },
    // A correction story: a wrongly-recorded payment, later reversed.
    { project: "pr_khaleej_office", subtotal: 12000, issue: "2026-04-20", due: "2026-05-20", desc: "أعمال إضافية — تعديلات التصميم الداخلي.", state: "reversed", payAmount: 13800, payDate: "2026-05-02", method: "cheque" },
    // A draft not yet issued.
    { project: "of_waha_comm", subtotal: 44000, issue: "2026-06-10", due: "2026-07-10", desc: "الدفعة الثانية — مسودة بانتظار المراجعة.", state: "draft" },
    // A cancelled/void invoice.
    { project: "pr_badr_resthouse", subtotal: 8000, issue: "2026-05-01", due: "2026-05-31", desc: "فاتورة أُلغيت — تغيّر نطاق العمل.", state: "void" },
  ];

  for (const inv of INVOICES) {
    const pid = projectId[inv.project];
    if (!pid) { console.warn(`  invoice skipped (no project ${inv.project})`); continue; }
    const invId = await rpc<string>(P.salman, "invoice_create", {
      p_project: pid,
      p_subtotal: inv.subtotal,
      p_vat_rate: 15,
      p_issue_date: inv.issue,
      p_due_date: inv.due ?? undefined,
      p_description: inv.desc,
    });
    const issued = inv.state !== "draft";
    if (issued && inv.state !== "void") await rpc(P.salman, "invoice_send", { p_invoice: invId });
    if (inv.state === "void") {
      await rpc(P.salman, "invoice_send", { p_invoice: invId });
      await rpc(P.khalid, "invoice_void", { p_invoice: invId, p_note: "أُلغيت بناءً على تغيّر نطاق العمل." });
    }
    let payId: string | null = null;
    if (inv.payAmount && inv.payDate) {
      payId = await rpc<string>(P.salman, "invoice_record_payment", {
        p_invoice: invId,
        p_amount: inv.payAmount,
        p_paid_at: inv.payDate,
        p_method: inv.method ?? "bank_transfer",
        p_reference: `TRX-${inv.issue.replace(/-/g, "")}`,
      });
    }
    if (inv.state === "reversed" && payId) {
      await rpc(P.khalid, "payment_reverse", { p_payment: payId, p_note: "سُجِّلت الدفعة على فاتورة خاطئة — تم العكس والتصحيح." });
    }
    for (const fu of inv.followUps ?? []) {
      await rpc(P.salman, "invoice_add_note", { p_invoice: invId, p_note: fu.note });
    }
    // Backdate invoice + events + payments.
    await backdate("invoices", invId, { created_at: iso(inv.issue) });
    const { data: ievs } = await admin.from("invoice_events").select("id, event_type").eq("invoice_id", invId).order("id");
    const ilist = ievs ?? [];
    const s = new Date(iso(inv.issue)).getTime();
    const e = new Date(iso(inv.followUps?.at(-1)?.date ?? inv.payDate ?? inv.issue)).getTime();
    for (let i = 0; i < ilist.length; i++) {
      const at = new Date(s + ((e - s) * i) / Math.max(1, ilist.length - 1)).toISOString();
      await backdate("invoice_events", ilist[i].id, { created_at: at });
    }
    await admin.from("payments").update({ created_at: iso(inv.payDate ?? inv.issue) }).eq("invoice_id", invId);
    // A receipt PDF on one paid invoice; a scanned quotation on another.
    if (inv.state === "paid" && inv.project === "pr_rajhi_villa3" && inv.payDate === "2026-03-20") {
      await uploadAsset("invoice", invId, "drawing-ground-floor.png", "إيصال تحويل بنكي — الدفعة الأولى.png", P.salman.id, iso(inv.payDate));
    }
  }

  console.log("Portfolio (from completed projects)…");
  const PORTFOLIO: Array<{ title: string; category: string; city: string; year: number; project?: string; cover: string; desc: string; created: string }> = [
    { title: "فيلا سكنية حديثة — حي الأمواج", category: "سكني", city: "الخبر", year: 2026, project: "pr_nukhba_villa", cover: "portfolio-villa-modern.png", desc: "تصميم معماري حديث لفيلا سكنية بمساحات مفتوحة وإطلالات بحرية.", created: "2026-05-25" },
    { title: "فيلا نموذجية — مشروع الراجحي", category: "سكني", city: "الدمام", year: 2026, project: "pr_rajhi_villa3", cover: "portfolio-villa-classic.png", desc: "تصميم وتنفيذ فيلا نموذجية ضمن مجمع سكني متكامل.", created: "2026-05-21" },
    { title: "مكتب إدارة مشاريع — الخليج", category: "تجاري", city: "الظهران", year: 2026, project: "pr_khaleej_office", cover: "portfolio-commercial.png", desc: "تصميم داخلي عصري لمكتب إدارة مشاريع.", created: "2026-05-06" },
    { title: "إشراف هندسي — مجمع الراجحي", category: "إشراف", city: "الدمام", year: 2026, cover: "portfolio-compound.png", desc: "الإشراف الهندسي على تنفيذ مجمع سكني مكوّن من ٦ فلل.", created: "2026-06-01" },
    { title: "ترميم وإعادة تأهيل ملحق", category: "ترميم", city: "الجبيل", year: 2026, cover: "portfolio-renovation.png", desc: "إعادة تأهيل ملحق قائم وتطوير التصميم الداخلي.", created: "2026-04-20" },
    { title: "تصميم مسجد حي", category: "ديني", city: "الخبر", year: 2025, cover: "portfolio-mosque.png", desc: "تصميم معماري لمسجد حي يستوعب ٣٠٠ مصلٍّ.", created: "2026-03-15" },
  ];
  for (const item of PORTFOLIO) {
    const coverStorage = `portfolio/covers/${crypto.randomUUID()}.png`;
    const buf = readFileSync(join(ASSETS, item.cover));
    await admin.storage.from("attachments").upload(coverStorage, buf, { contentType: "image/png", upsert: true });
    const { data, error } = await admin
      .from("portfolio_items")
      .insert({
        title: item.title, description: item.desc, category: item.category, city: item.city,
        year: item.year, project_id: item.project ? projectId[item.project] ?? null : null,
        is_published: true, cover_path: coverStorage, created_by: P.khalid.id, created_at: iso(item.created),
      })
      .select("id")
      .single();
    if (error) throw new Error(`portfolio ${item.title}: ${error.message}`);
    // Also attach the cover as a portfolio attachment (gallery).
    await admin.from("attachments").insert({
      entity_type: "portfolio", entity_id: data.id, storage_path: coverStorage,
      file_name: `${item.title}.png`, mime_type: "image/png", size_bytes: buf.length,
      uploaded_by: P.khalid.id, created_at: iso(item.created),
    });
  }

  console.log("Deactivating one engineer (inactive-user flow)…");
  await deactivate(P.majed);

  console.log("Curating notifications (small realistic unread set)…");
  // The lifecycle generated many notifications all dated now() — purge and lay
  // down a tidy, backdated, mostly-recent set so the bell looks real.
  await admin.from("notifications").delete().gte("created_at", "1900-01-01");
  const notif = async (userId: string, type: string, title: string, body: string, href: string, when: string, read: boolean) => {
    await admin.from("notifications").insert({
      user_id: userId, type, title, body, href,
      created_at: iso(when), read_at: read ? iso(when) : null,
    });
  };
  // Manager: a couple unread (submitted work + overdue), some read.
  await notif(P.khalid.id, "task_submitted", "مهمة بانتظار مراجعتك", "تقرير إشراف أسبوعي — يونيو", "/tasks", "2026-06-11", false);
  await notif(P.khalid.id, "invoice_overdue", "فاتورة متأخرة", "تأخّر سداد فاتورة مبنى الواحة التجاري", "/invoices", "2026-06-12", false);
  await notif(P.khalid.id, "task_submitted", "مهمة بانتظار مراجعتك", "مراجعة المخططات قبل الترخيص", "/tasks", "2026-06-06", true);
  // Accountant: overdue + a payment.
  await notif(P.salman.id, "invoice_overdue", "فاتورة متأخرة", "تأخّر سداد فاتورة فيلا الشمري", "/invoices", "2026-06-12", false);
  await notif(P.salman.id, "invoice_payment", "دفعة جديدة", "استلام دفعة على فيلا القحطاني", "/invoices", "2026-06-02", true);
  // Engineers: assigned tasks.
  await notif(P.abdullah.id, "task_assigned", "أُسندت إليك مهمة", "مخططات السلامة والإطفاء", "/tasks", "2026-06-03", false);
  await notif(P.reem.id, "task_reopened", "أُعيدت مهمتك للتعديل", "اعتماد الدفاع المدني — المرحلة الأولى", "/tasks", "2026-06-01", false);

  // Summary.
  const counts: Record<string, number> = {};
  for (const t of ["clients", "offers", "projects", "tasks", "invoices", "payments", "portfolio_items", "attachments", "notifications"]) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true });
    counts[t] = count ?? 0;
  }
  console.log("\nDemo seeded:");
  console.table(counts);
  console.log("\nLogins (password = DEMO_PASSWORD env, default OsosDemo!2026):");
  for (const info of Object.values(PERSONAS)) console.log(`  ${info.role.padEnd(10)} ${info.email}  (${info.fullName})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
