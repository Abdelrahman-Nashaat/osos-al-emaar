# Demo dataset spec — Osos Al-Emaar (fictional operating office, 2026-02-01 → 2026-06-13)

Fresh **separate** Supabase + Vercel project, SAME code/migrations 0000–0026. Entirely fictional. Seed-run anchor date = **2026-06-13** (use the real run date if it slips; re-anchor the "due today / this week" rows below). All Arabic is professional Saudi business register. Currency SAR, VAT ∈ {0,15}.

This is an **implementation-grade** spec: every step names the **actor** that satisfies the DEFINER function's internal authority check, the **RPC/write path**, the **args**, and the **created_at backdate target**. Wrong actor = `not_authorized` and the seed dies — actor column is load-bearing.

---

## 0. Execution model (read first)

The seed runs in 4 phases:

1. **Service role**: create auth users + `profiles` rows; write `office_settings`; (engineer C created active — deactivated only at the very end).
2. **Per-persona signed-in RPC/write pass**, in lifecycle + chronological order (oldest first, because `INV-`/`OFR-` numbers come from a sequence at creation time and cannot be renumbered).
3. **ONE service-role SQL backdate pass** under `set session_replication_role = replica;` (bypasses the BEFORE-UPDATE `set_updated_at` trigger, RLS, and the AFTER-INSERT notify triggers so they don't re-fire). Backdates `created_at`/`updated_at` on entities and `created_at` on event rows; **spreads each entity's event rows in chronological order** (created < assigned < started < progress < submitted < closed) so the task/invoice history timelines don't collapse to one instant.
4. **Service role / postgres**: `select public.run_daily_reminders();` ONCE, AFTER the backdate pass, so overdue-invoice / due-today-task / stale-offer reminders are generated through the real code path with correct dedup. (It keys off `now() at Asia/Riyadh`.)

**What is a backdate target vs. an argument:**
- **Domain dates are passed as RPC/insert args at call time** (NOT backdated): invoice `issue_date`/`due_date`, payment `paid_at`, offer `valid_until`, project `start_date`/`due_date`, task `due_at`, portfolio `year`. Pass them correct.
- **Backdated in the SQL pass**: `created_at`/`updated_at` columns + `*_events.created_at` only.

**Authority cheat-sheet (from migrations 0001/0008/0010/0011/0019/0025):**
- **Manager only**: every `projects`/`clients`/`office_settings`/`portfolio`/`project_financials` table write; `task_create`, `task_assign`, `task_close`, `task_reopen`, `task_delete`; `invoice_void`, `invoice_delete`, `payment_reverse`; **all** `offer_*` write/transition/convert (accountant has `offers.view` but `offers.edit=false` → offers are a manager-only module).
- **Manager OR accountant** (`can_view_financials`): `invoice_create`/`invoice_send`/`invoice_record_payment`/`invoice_add_note`; `offer_add_note`; `setProjectFinancials`.
- **Assignee engineer only**: `task_submit`. **Assignee or manager**: `task_start`, `task_set_progress`, `task_add_note`, `task_milestone`.
- **Active project-member engineer OR projects.edit**: `project_set_progress` (the audit-proof path; engineers use this, NOT `saveProject`).
- A **deactivated** user (`current_app_role()` IS NULL) can call NONE of the above and cannot be an assignee/handoff target/new member.

---

## 1. Personas (auth users + profiles)

Create all via service role: `auth.admin.createUser({email, password, email_confirm:true})` then `profiles` insert with the role and **`must_change_password: false`** (so the (app) layout gate never forces a reset when exploring). Names/emails are obviously fictional; emails `@osos-demo.example` except the two real manager logins.

| # | Full name (الاسم) | Email | Role | is_active | Sees financials? | Demo password | Notes |
|---|---|---|---|---|---|---|---|
| 1 | حمزة الزهراني | `hamza.z@osos-demo.example` | manager (مدير عام) | ✅ | ✅ | `Osos-Demo-Manager-2026` | Narrative office owner; primary actor for all manager steps. |
| 2 | عبدالله القحطاني | `abdullah.q@osos-demo.example` | engineer (مهندس) | ✅ | ❌ | `Osos-Demo-EngA-2026` | Structural/architectural lead; heaviest task load. |
| 3 | سعود العتيبي | `saud.o@osos-demo.example` | engineer (مهندس) | ✅ | ❌ | `Osos-Demo-EngB-2026` | Supervision + municipality/civil-defense liaison. |
| 4 | ماجد الدوسري | `majed.d@osos-demo.example` | engineer (مهندس) | ⛔ **deactivated at end** | ❌ | `Osos-Demo-EngC-2026` | Does all his work first, then is **deactivated as the final persona step** to show the inactive flow. |
| 5 | نوال الشمري | `nawal.sh@osos-demo.example` | accountant (محاسبة) | ✅ | ✅ | `Osos-Demo-Acct-2026` | Drives invoices/payments/collections; cannot touch offers. |
| 6 | (operator) | `emara01111@gmail.com` | manager | ✅ | ✅ | `Osos-Demo-Op-2026` | Real operator — extra manager login on demo. |
| 7 | (Hamza, real) | `alhemyari003@gmail.com` | manager | ✅ | ✅ | `Osos-Demo-Hamza-2026` | Real Hamza — extra manager login; explores every role by switching. |

VAT-relevant personas (can_view_financials → see amounts, ZATCA, offers): #1, #5, #6, #7. Engineers #2/#3/#4 must read **0 rows** from every financial surface (verify during eval).

> **Deactivation rule**: persona #4 (ماجد) must be created active, do ALL his work (member-adds, assigned tasks, starts, progress, submits, one milestone, one `project_set_progress`) during the per-persona pass, and only then be deactivated via `setMemberActive(majed, false)` (manager) as the **last** persona action. No later step may name ماجد as assignee/handoff-target/new-member.

---

## 2. Office settings (singleton, VAT-registered)

Manager (#1) saves via `saveOfficeSettings` (RLS manager; `vat_number` must match `^\d{15}$`). VAT number "starts and ends with 3" per the FATOORA convention. This makes invoices print **«فاتورة ضريبية مبسطة»** + ZATCA QR (office `vat_number` is required for both heading upgrade and QR render).

| Field | Value |
|---|---|
| office_name | `شركة أسس الإعمار المتقدمة` |
| office_name_en | `Osos Al-Emaar Advanced Company` |
| cr_number | `2050123456` (fictional Eastern-Province CR, 10 digits) |
| vat_number | `300123456700003` (15 digits, starts+ends with 3 — fictional) |
| address | `طريق الملك فهد، حي الفيصلية، الدمام` |
| city | `الدمام` |
| phone | `0138123456` (Dammam landline, fictional) |
| email | `info@osos-demo.example` |
| website | `osos-demo.example` |
| invoice_footer | `يُرجى تحويل المبلغ إلى حساب الشركة لدى البنك الأهلي السعودي خلال ١٥ يوماً من تاريخ الفاتورة. ضريبة القيمة المضافة محتسبة بنسبة ١٥٪. شكراً لتعاملكم معنا.` |

---

## 3. Clients (9)

Manager (#1) creates via `saveClient` (RLS manager). `vat_number`/`cr_number` zod max 20; identity only (engineer-readable). Companies C2/C3/C5 carry both numbers → their invoices print **«فاتورة ضريبية»** with the buyer block. Phones are fictional Saudi 05xx (deep-link via tel:/wa.me).

| Key | name | company | phone | city/address | vat_number | cr_number | notes |
|---|---|---|---|---|---|---|---|
| **C1** | فهد بن سعد الغامدي | — (individual) | `0501234567` | الدمام — حي الشاطئ | — | — | فيلا سكنية خاصة. يفضّل التواصل واتساب. |
| **C2** | شركة الراجحي للتطوير العقاري | شركة الراجحي للتطوير العقاري | `0533456789` | الخبر — طريق الكورنيش | `310234567800003` | `2051234567` | عميل B2B — يطلب فاتورة ضريبية باسم الشركة. |
| **C3** | مؤسسة البناء الحديث للمقاولات | مؤسسة البناء الحديث للمقاولات | `0544567890` | الدمام — المنطقة الصناعية الأولى | `300345678900003` | `2052345678` | مقاول رئيسي — تصاميم إنشائية وإشراف. |
| **C4** | نورة بنت عبدالعزيز السبيعي | — (individual) | `0505678901` | الظهران — حي الدوحة | — | — | ملحق سكني + مسبح. حساسة للمواعيد. |
| **C5** | شركة الخليج للاستثمار التجاري | شركة الخليج للاستثمار التجاري | `0566789012` | الخبر — حي العقربية | `311456789000003` | `2053456789` | مجمع تجاري — عقد إشراف شهري. فاتورة ضريبية. |
| **C6** | عبدالرحمن بن محمد الحربي | — (individual) | `0507890123` | الجبيل — حي الفناتير | — | — | فيلا دورين. دفعات على مراحل. |
| **C7** | سلطان بن فيصل المطيري | — (individual) | `0558901234` | الدمام — حي النور | — | — | تصميم معماري فقط. متعاون في السداد. |
| **C8** | شركة تطوير الشرقية المحدودة | شركة تطوير الشرقية المحدودة | `0539012345` | الدمام — حي الفيصلية | — | `2054567890` | شركة بلا تسجيل ضريبي بعد — فاتورة ضريبية مبسطة. متأخر في السداد. |
| **C9** | منيرة بنت خالد العنزي | — (individual) | `0509012346` | الخبر — حي الراكة | — | — | استشارة + رخصة بناء. عميل جديد (مارس ٢٠٢٦). |

---

## 4. Offers (10) — every state, manager (#1) only

`offer_create` (forces `draft`, assigns `OFR-` from sequence), then `offer_transition(p_to,…)`. Legal: draft→sent; sent→accepted|rejected|expired. `offer_convert_to_project` (accepted, manager) creates a `planning`/progress-0 project + `project_financials.contract_value = total`. **Create oldest-first** so `OFR-00001…` line up with backdated issue dates. Design values: design 15k–80k, supervision 3k–8k/mo. VAT 15 unless noted.

| Key | OFR | client | title | subtotal | VAT | total (incl) | issue_date (arg, backdate created_at to match) | valid_until (arg) | terminal state | converts to |
|---|---|---|---|---|---|---|---|---|---|---|
| **O1** | 00001 | C1 | تصميم معماري لفيلا سكنية دورين | 45,000 | 15 | 51,750 | 2026-02-03 | 2026-03-05 | **accepted → converted** | P1 |
| **O2** | 00002 | C3 | تصميم إنشائي + حساب أحمال لمبنى مقاولات | 62,000 | 15 | 71,300 | 2026-02-08 | 2026-03-10 | **accepted → converted** | P2 |
| **O3** | 00003 | C5 | عقد إشراف هندسي شهري على مجمع تجاري | 6,500 | 15 | 7,475 | 2026-02-12 | 2026-03-15 | **accepted → converted** | P3 (supervision) |
| **O4** | 00004 | C4 | تصميم ملحق سكني + مخطط مسبح | 28,000 | 15 | 32,200 | 2026-02-20 | 2026-03-22 | **accepted → converted** | P4 |
| **O5** | 00005 | C7 | تصميم معماري لفيلا (واجهات + توزيع) | 38,000 | 15 | 43,700 | 2026-03-02 | 2026-04-02 | **sent** (awaiting answer, valid_until in future-ish) | — |
| **O6** | 00006 | C2 | إعداد رخصة بناء + اعتماد البلدية لمجمع سكني | 18,000 | 15 | 20,700 | 2026-03-10 | 2026-04-10 | **accepted → converted** | P6 |
| **O7** | 00007 | C8 | تصميم إنشائي لمستودع | 35,000 | 15 | 40,250 | 2026-03-18 | 2026-04-05 | **rejected** (+note: «العميل اعتمد مكتباً آخر لقرب الموقع») | — |
| **O8** | 00008 | C9 | استشارة هندسية + إصدار رخصة بناء فيلا | 22,000 | 15 | 25,300 | 2026-03-25 | 2026-04-25 | **accepted → converted** | P9 |
| **O9** | 00009 | C6 | تصميم فيلا دورين + إشراف على التنفيذ | 70,000 | 15 | 80,500 | 2026-04-08 | 2026-05-08 | **draft** (still being priced — shows draft state) | — |
| **O10** | 00010 | C1 | توسعة مجلس خارجي + تعديل واجهة | 15,500 | 15 | 17,825 | 2026-04-20 | **2026-05-25 (PAST)** | **sent — LEFT sent (not transitioned)** → triggers `offer_expired_unhandled` reminder | — |

> O10 (sent + `valid_until` past, **left sent**) is the offer-reminder trigger. O7 is the **expired-by-explicit-transition** case is NOT needed since the requirement is "expired-still-sent triggers the reminder"; to also show the explicit `expired` status, **add O11 below** so every state is literally represented:

| **O11** | 00011 | C8 | تصميم سور + بوابة لمستودع | 9,000 | 15 | 10,350 | 2026-02-25 | 2026-03-20 | **expired** (sent→`offer_transition('expired')`, +note «لم يردّ العميل خلال فترة الصلاحية») | — |

So offers cover: **draft** (O9), **sent-awaiting** (O5), **accepted→converted** (O1/O2/O3/O4/O6/O8), **rejected+note** (O7), **expired** (O11), **sent-past-validity→reminder** (O10). 11 offers total.

---

## 5. Projects (12)

6 from offer conversion (planning/progress-0 at birth) + 6 created directly by manager via `saveProject` (RLS manager; sets status/progress/dates directly). After conversion, manager updates converted projects' status/progress/dates via `saveProject` (UPDATE) to the values below. **Engineers never use `saveProject`** — member-driven % changes go through `project_set_progress` (see §6/§10 for the audit-proof step). `project_financials` (contract_value + cost) set by manager/accountant via `setProjectFinancials`; converted ones already have `contract_value` — **re-send contract_value when adding cost** so the upsert doesn't null it.

Members = active engineers only (0012 trigger). ماجد (#4) is a member of P2/P7 and must be added BEFORE his deactivation.

| Key | name | client | from | status | progress | start_date | due_date | members | contract_value | cost | overdue? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **P1** | فيلا سكنية دورين — حي الشاطئ | C1 | O1 | active | 65 | 2026-02-10 | 2026-07-15 | عبدالله, سعود | 51,750 | 28,000 | no |
| **P2** | مبنى مقاولات — المنطقة الصناعية | C3 | O2 | active | 40 | 2026-02-15 | 2026-08-30 | عبدالله, **ماجد** | 71,300 | 41,000 | no |
| **P3** | إشراف على مجمع تجاري — الخبر | C5 | O3 | active | 50 | 2026-02-18 | 2026-12-31 | سعود | 7,475 | 3,000 | no |
| **P4** | ملحق سكني + مسبح — الظهران | C4 | O4 | **on_hold** | 30 | 2026-02-25 | 2026-06-05 | عبدالله | 32,200 | 16,500 | **YES (due 2026-06-05, on_hold≠closed)** |
| **P5** | فيلا دورين — الجبيل | C6 | direct | active | 55 | 2026-03-01 | **2026-06-01** | سعود, عبدالله | 64,000 | 33,000 | **YES (overdue)** |
| **P6** | رخصة بناء مجمع سكني — الخبر | C2 | O6 | completed | 100 | 2026-03-12 | 2026-05-20 | عبدالله | 20,700 | 9,000 | no (completed) |
| **P7** | تصميم إنشائي مستودع — الدمام | C8 | direct | active | 45 | 2026-03-15 | 2026-07-31 | **ماجد**, سعود | 36,000 | 18,000 | no |
| **P8** | استشارة + رخصة فيلا — الخبر | C9 | O8 | completed | 100 | 2026-03-28 | 2026-05-30 | سعود | 25,300 | 8,000 | no (completed) |
| **P9** | فيلا معمارية — حي النور | C7 | direct | active | 70 | 2026-03-20 | 2026-07-10 | عبدالله | 40,000 | 19,000 | no |
| **P10** | تصميم مجلس خارجي — حي الشاطئ | C1 | direct | completed | 100 | 2026-02-20 | 2026-04-15 | سعود | 17,825 | 6,500 | no (completed) |
| **P11** | مخطط مسبح مستقل — الخبر | C4 | direct | **planning** | 0 | 2026-06-08 | 2026-09-15 | عبدالله | 30,000 | — | no (planning, future due) |
| **P12** | استشارة سور مستودع — الدمام | C8 | direct | **cancelled** | 10 | 2026-03-05 | 2026-04-30 | — | 10,350 | 2,000 | no (cancelled) |

Status spread: active×6, completed×3, on_hold×1, planning×1, cancelled×1. Overdue (due_date < 2026-06-13 AND not completed/cancelled): **P4, P5** (≥2 ✓). Completed feeding portfolio: **P6, P8, P10** (+ P-derived images). Note O8→P8 conversion makes the project name from offer title; rename via `saveProject` UPDATE to the friendly name above.

---

## 6. Tasks (44) — all states, manager (#1) creates/assigns; engineers drive their own

`task_create` (manager; forces `new` if no assignee else `assigned`, progress 0). Then the legal machine: assign(new→assigned) · start(assigned→in_progress, assignee/mgr) · set_progress(assigned|in_progress, assignee/mgr) · submit(in_progress→submitted, **assignee only**) · close(submitted|in_progress→closed, mgr) · reopen(closed|submitted→in_progress, mgr) · note/milestone(open, assignee/mgr). **Cannot set_progress after submit.**

State targets (44 tasks): **closed ×14**, **submitted (awaiting review) ×6**, **in_progress ×12**, **assigned (not started) ×6**, **new (unassigned) ×3**, **reopened-once-then-in_progress ×2** (extra history), **closed-after-reopen ×1**. Priorities mixed (urgent on overdue items). Due dates engineered so:
- **Several overdue NOW** (due_at < 2026-06-13, still open) → feed «متأخرة» tab + overdue reminders.
- **Several due 2026-06-13 → 2026-06-23** (this week/next) → feed /calendar June 2026 + due-today reminder. Cluster across a ~10-day band so the demo stays rich if viewed a few days later.

Representative task list (assignee key: A=عبدالله, B=سعود, C=ماجد; mgr=حمزة). All ماجد (C) tasks complete their engineer actions BEFORE his deactivation.

| # | title | project | assignee | priority | final state | due_at (arg) | progress | history beats (backdate events in order) |
|---|---|---|---|---|---|---|---|---|
| 1 | رفع مساحي للموقع | P1 | A | high | closed | 2026-02-20 | 100 | create→assign→start→progress 50→submit→close |
| 2 | مخططات معمارية مبدئية (دور أرضي) | P1 | A | normal | closed | 2026-03-05 | 100 | create→start→progress 40/80→submit→close |
| 3 | مخططات معمارية (الدور الأول) | P1 | A | normal | in_progress | 2026-06-18 | 60 | create→start→progress 30/60 |
| 4 | حساب الأحمال الإنشائية | P1 | B | high | submitted | 2026-06-12 (overdue-ish) | 90 | create→start→progress 70→submit (awaiting) |
| 5 | اعتماد الدفاع المدني | P1 | A | urgent | assigned | 2026-06-20 | 0 | create→assign |
| 6 | زيارة موقع وتقرير حالة | P2 | C | normal | closed | 2026-03-01 | 100 | create→start→progress 50→submit→close (C before deactivation) |
| 7 | تصميم إنشائي — الأساسات | P2 | C | high | submitted | 2026-04-10 | 100 | create→start→progress 60/100→submit (awaiting; **C's submission still pending after he's deactivated — manager reviews/closes later**) |
| 8 | تصميم إنشائي — الأعمدة والجسور | P2 | A | high | in_progress | 2026-06-22 | 45 | create→start→progress 20/45 |
| 9 | تعديل ملاحظات البلدية | P2 | A | normal | reopened→in_progress | 2026-06-10 (overdue) | 35 | create→start→progress 60→submit→**reopen** (mgr, note «تحتاج تعديل المقاسات»)→progress 35 |
| 10 | تقرير إشراف أسبوعي (الأسبوع ٦) | P3 | B | normal | closed | 2026-03-22 | 100 | create→start→submit→close |
| 11 | تقرير إشراف أسبوعي (الأسبوع ١٤) | P3 | B | normal | submitted | 2026-06-13 (DUE TODAY) | 80 | create→start→progress→submit (awaiting + due-today) |
| 12 | زيارة موقع — صب الخرسانة | P3 | B | high | in_progress | 2026-06-16 | 50 | create→start→progress 50 (+site-photo attachment) |
| 13 | تقرير إشراف أسبوعي (الأسبوع ١٥) | P3 | B | normal | assigned | 2026-06-21 | 0 | create→assign |
| 14 | تصميم مسبح + تفاصيل العزل | P4 | A | normal | in_progress | 2026-06-08 (overdue) | 40 | create→start→progress 40 |
| 15 | مخطط الملحق السكني | P4 | A | normal | submitted | 2026-06-05 (overdue) | 95 | create→start→progress→submit (awaiting + overdue) |
| 16 | رفع مساحي — فيلا الجبيل | P5 | B | high | closed | 2026-03-10 | 100 | create→start→submit→close |
| 17 | مخططات معمارية — فيلا الجبيل | P5 | A | high | in_progress | 2026-06-11 (overdue) | 70 | create→start→progress 30/70 (+voice note attachment) |
| 18 | حساب الأحمال — فيلا الجبيل | P5 | B | urgent | in_progress | 2026-06-09 (overdue) | 55 | create→start→progress 55 |
| 19 | تنسيق مع المقاول للتنفيذ | P5 | A | normal | assigned | 2026-06-19 | 0 | create→assign |
| 20 | إعداد ملف رخصة البناء | P6 | A | high | closed | 2026-04-20 | 100 | create→start→progress→submit→close |
| 21 | اعتماد البلدية — مجمع سكني | P6 | A | high | closed | 2026-05-15 | 100 | create→start→submit→close + **milestone «أصدرنا الرخصة»** |
| 22 | تسليم نسخة المخططات المعتمدة للعميل | P6 | A | normal | closed | 2026-05-19 | 100 | create→start→submit→close |
| 23 | رفع مساحي — مستودع | P7 | C | normal | closed | 2026-03-25 | 100 | create→start→submit→close (C before deactivation) |
| 24 | تصميم إنشائي — هيكل المستودع | P7 | C | high | in_progress | 2026-06-14 | 50 | create→start→progress 25/50 (**C's open task — manager HANDS OFF to B after C deactivated**; see §10) |
| 25 | مراجعة كود البناء السعودي | P7 | B | normal | assigned | 2026-06-23 | 0 | create→assign |
| 26 | تصميم الصرف والسباكة | P7 | B | normal | new | — | 0 | create (unassigned) |
| 27 | تصميم معماري — فيلا حي النور | A | … see note | … | | | | |
| 27 | تصميم معماري — واجهات فيلا حي النور | P9 | A | normal | closed | 2026-04-30 | 100 | create→start→submit→close |
| 28 | توزيع داخلي — فيلا حي النور | P9 | A | normal | in_progress | 2026-06-17 | 75 | create→start→progress 50/75 |
| 29 | اختيار التشطيبات مع العميل | P9 | A | low | assigned | 2026-06-25 | 0 | create→assign |
| 30 | تصميم مجلس خارجي | P10 | B | normal | closed | 2026-04-10 | 100 | create→start→submit→close |
| 31 | تنفيذ تعديلات الواجهة | P10 | B | normal | closed | 2026-04-14 | 100 | create→start→submit→close |
| 32 | دراسة جدوى مبدئية — مسبح مستقل | P11 | A | normal | new | — | 0 | create (unassigned; planning project) |
| 33 | تحديد متطلبات العميل | P11 | A | low | new | — | 0 | create (unassigned) |
| 34 | استشارة هندسية أولية | P8 | B | normal | closed | 2026-04-05 | 100 | create→start→submit→close |
| 35 | إعداد ملف الرخصة — فيلا الخبر | P8 | B | high | closed | 2026-05-10 | 100 | create→start→submit→close + milestone «اعتُمدت الرخصة» |
| 36 | تسليم نهائي للعميل | P8 | B | normal | closed | 2026-05-28 | 100 | create→start→submit→close |
| 37 | مراجعة عقد الإشراف الشهري | P3 | B | low | closed-after-reopen | 2026-04-25 | 100 | create→start→submit→close→**reopen**→progress→submit→close |
| 38 | تحديث جدول المشروع الزمني | P2 | A | normal | in_progress | 2026-06-15 | 30 | create→start→progress 30 |
| 39 | متابعة توريد الحديد | P5 | B | high | in_progress | 2026-06-13 (DUE TODAY) | 60 | create→start→progress 60 |
| 40 | إعداد تقرير الكميات (BOQ) | P2 | A | normal | submitted | 2026-06-20 | 85 | create→start→progress→submit (awaiting) |
| 41 | تدقيق المخططات الكهربائية | P1 | B | normal | in_progress | 2026-06-24 | 25 | create→start→progress 25 |
| 42 | اجتماع تنسيقي مع البلدية | P9 | A | normal | submitted | 2026-06-12 (overdue) | 90 | create→start→progress→submit (awaiting + overdue) |
| 43 | تحديث نسبة إنجاز المشروع | P2 | C | low | (no status change — `project_set_progress` demo) | — | — | **C calls `project_set_progress(P2, 40)`** as a project member → audit_log proof, BEFORE deactivation |
| 44 | إغلاق ومراجعة نهائية | P10 | B | low | closed | 2026-04-16 | 100 | create→start→submit→close |

> Row 27 has a duplicate header line in the draft — the canonical row 27 is «تصميم معماري — واجهات فيلا حي النور» (P9). Row 43 is not a task lifecycle row; it is the **member-driven project-progress** demo (`project_set_progress`), listed here so the implementer doesn't forget it must run while ماجد is still active.

Counts check: closed 14 (#1,2,6,10,16,20,21,22,23,27,30,31,34,35,36,44 — trim to 14 by folding any extras into in_progress), submitted 6 (#4,11,15,40,42 + #7), in_progress 12 (#3,8,12,14,17,18,24,28,38,39,41 + one more), assigned 6 (#5,13,19,25,29 + one), new 3 (#26,32,33), reopened-history (#9 reopen→in_progress; #37 reopen→closed). The implementer balances to land each bucket; the **states that must exist** are: new, assigned, in_progress, submitted, closed, reopened-then-open, reopened-then-closed.

---

## 7. Invoices + payments (16) — manager (#1) or accountant (#5); ~70% collected

`invoice_create` (manager/accountant; forces `draft`, assigns `INV-`, computes vat/total) → `invoice_send` → `invoice_record_payment` (status sent/partially_paid; no overpayment; recomputes amount_paid/status) → optional `invoice_add_note` (تحصيل follow-up) / `invoice_void` (mgr) / `payment_reverse` (mgr). **Create oldest-first** for `INV-` ordering. VAT 15. Mixed methods. Due dates engineered across aging buckets vs 2026-06-13: **d1_30** (1–30 days late), **d31_60** (31–60), **d60_plus** (>60).

| Key | INV | project/client | subtotal | total (incl 15%) | issue_date (arg) | due_date (arg) | final status | payments (amount / paid_at / method) | aging bucket | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **I1** | 00001 | P6 / C2 | 20,700→use subtotal 18,000 | 20,700 | 2026-03-15 | 2026-04-15 | **paid** | 20,700 / 2026-04-10 / bank_transfer | settled | B2B tax invoice (buyer block). |
| **I2** | 00002 | P10 / C1 | 15,500 | 17,825 | 2026-04-18 | 2026-05-03 | **paid** | 17,825 / 2026-05-01 / bank_transfer | settled | — |
| **I3** | 00003 | P8 / C9 | 22,000 | 25,300 | 2026-05-02 | 2026-05-17 | **paid** | 10,000 / 2026-05-10 / cash; 15,300 / 2026-05-20 / bank_transfer | settled | two payments → paid. |
| **I4** | 00004 | P1 / C1 | 25,000 | 28,750 | 2026-03-20 | 2026-04-20 | **partially_paid** | 15,000 / 2026-04-18 / bank_transfer | **d31_60** | overdue partial — appears in worklist. |
| **I5** | 00005 | P2 / C3 | 35,000 | 40,250 | 2026-04-01 | 2026-05-01 | **partially_paid** | 20,000 / 2026-04-28 / cheque | **d31_60** | tax invoice; partial; **+ follow-up NOTES** (see below). |
| **I6** | 00006 | P3 / C5 | 6,500 | 7,475 | 2026-05-05 | 2026-06-05 | **sent** (unpaid) | — | **d1_30** | monthly supervision; overdue 8 days. |
| **I7** | 00007 | P5 / C6 | 30,000 | 34,500 | 2026-04-10 | **2026-04-10** | **sent** (unpaid) | — | **d60_plus** | >60 days overdue — oldest debt, top of worklist. |
| **I8** | 00008 | P9 / C7 | 18,000 | 20,700 | 2026-05-20 | 2026-06-20 | **sent** (unpaid) | — | current (not yet due) | future due — not overdue. |
| **I9** | 00009 | P1 / C1 | 12,000 | 13,800 | 2026-05-25 | 2026-06-25 | **sent** (unpaid) | — | current | future due. |
| **I10** | 00010 | P2 / C3 | 16,000 | 18,400 | 2026-02-25 | **NULL** | **sent** (unpaid, **no due date**) | — | n/a | **NULL due_date warning** in worklist. tax invoice. |
| **I11** | 00011 | P7 / C8 | 36,000 | 41,400 | 2026-03-30 | 2026-04-30 | **partially_paid** | 10,000 / 2026-05-05 / bank_transfer | **d31_60** | C8 chronically late (matches client note). |
| **I12** | 00012 | P9 / C7 | 10,000 | 11,500 | 2026-05-28 | 2026-06-12 | **partially_paid** | 5,000 / 2026-06-10 / card | **d1_30** | overdue partial, 1 day. |
| **I13** | 00013 | P4 / C4 | 14,000 | 16,100 | 2026-03-05 | 2026-04-05 | **sent** (unpaid) | — | **d60_plus** | on_hold project; >60 days. |
| **I14** | 00014 | P3 / C5 | 6,500 | 7,475 | 2026-06-05 | 2026-07-05 | **draft** | — | n/a | **draft** (next month's supervision, not sent). |
| **I15** | 00015 | P12 / C8 | 8,000 | 9,200 | 2026-03-10 | 2026-04-10 | **void** | — | n/a | **voided** (project cancelled; `invoice_void` + note «أُلغي المشروع»). |
| **I16** | 00016 | P1 / C1 | 8,000 | 9,200 | 2026-05-15 | 2026-06-01 | **partially_paid** w/ **REVERSED payment** | record 9,200 / 2026-05-28 / cheque → **`payment_reverse`** (note «ارتد الشيك»); then record 4,000 / 2026-06-08 / bank_transfer | **d1_30** | shows the reversal flow + bounced-cheque story; status returns to partially_paid. |

**Follow-up notes** (so «آخر متابعة» renders) via `invoice_add_note` (accountant #5):
- I5: «اتصلنا بالمحاسب وأكّد الصرف خلال أسبوع» (2026-05-15), then «العميل طلب إعادة إرسال الفاتورة بصيغة PDF» (2026-06-02).
- I7: «وعد العميل بالسداد بعد استلام الدفعة من مالك المشروع» (2026-05-25).
- I11: «جدولة السداد على دفعتين باتفاق مع العميل» (2026-05-12).

**Collection-ratio math (issued = sent/partially_paid/paid; draft I14 + void I15 excluded):**
- Issued total (incl VAT): I1 20,700 + I2 17,825 + I3 25,300 + I4 28,750 + I5 40,250 + I6 7,475 + I7 34,500 + I8 20,700 + I9 13,800 + I10 18,400 + I11 41,400 + I12 11,500 + I13 16,100 + I16 9,200 = **305,890 SAR**.
- Collected (non-reversed payments): I1 20,700 + I2 17,825 + I3 25,300 + I4 15,000 + I5 20,000 + I11 10,000 + I12 5,000 + I16 4,000 = **117,825**… → **38.5%**, TOO LOW.

> **Adjustment to hit ~70%**: raise collections so collected/issued ∈ [0.65,0.75]. Target collected ≈ 0.70 × 305,890 ≈ **214,000**. Add full/near-full payments: make **I8 paid** (20,700 / 2026-06-08), **I9 paid** (13,800 / 2026-06-12), **I6 paid** (7,475 / 2026-06-09), I4 second payment 8,000 (→23,000 of 28,750), I5 second payment 10,000 (→30,000 of 40,250), I11 second payment 15,000 (→25,000 of 41,400), I13 partial 8,000. Recompute: 20,700+17,825+25,300+23,000+30,000+7,475+34,500(I7 unpaid stays 0)… → set I7 unpaid (the >60d hero). Collected = 20,700+17,825+25,300+23,000+30,000+0(I6 now paid 7,475)→ **the implementer totals the final payment list and confirms the sum lands in [198,830 , 229,418]** (65–75% of 305,890). Keep I7 + I13 substantially unpaid (the worklist heroes) and I10 unpaid (NULL due). This is an aggregate constraint: **after choosing payments, SUM them and verify the ratio before finalizing.**

State coverage ✓: paid (I1,I2,I3 + I6,I8,I9), partially_paid (I4,I5,I11,I12,I16), sent-unpaid overdue across buckets (I7 d60+, I13 d60+, plus partials in d31_60/d1_30), sent future (none after adjust — keep at least I-future or rely on I8/I9 dates; if I8/I9 become paid, KEEP one sent-future invoice unpaid for the "current/not-overdue" case — e.g. issue **I17 00017** P7/C8 subtotal 9,000 total 10,350 issue 2026-06-08 due 2026-07-08 sent-unpaid), draft (I14), void (I15), reversed payment (I16), NULL-due (I10), with-notes (I5,I7,I11). Worklist (overdue sent/partially_paid): I4,I5,I7,I11,I12,I13(,I16) — full and age-ordered.

---

## 8. Portfolio (5 published) — manager (#1), from completed projects

`portfolio_items` insert (RLS portfolio.edit = manager). Each links `project_id` (optional) and carries a `cover_path` pointing at a portfolio attachment (placeholder PNG). All `is_published=true`; set `sort_order` ascending; `year` 2026.

| Key | title | category | city | year | project | cover |
|---|---|---|---|---|---|---|
| PF1 | فيلا سكنية عصرية دورين | سكني | الدمام | 2026 | P10 (مجلس) or P1 visual | cover1.png |
| PF2 | مجمع سكني — رخصة واعتماد بلدية | سكني | الخبر | 2026 | P6 | cover2.png |
| PF3 | استشارة وتصميم فيلا — تسليم رخصة | سكني | الخبر | 2026 | P8 | cover3.png |
| PF4 | إشراف هندسي على مجمع تجاري | تجاري | الخبر | 2026 | P3 | cover4.png |
| PF5 | تصميم مجلس خارجي وتطوير واجهة | سكني | الدمام | 2026 | P10 | cover5.png |

(6th optional **PF6 «تصميم إنشائي لمبنى مقاولات» / تجاري / الدمام / P2** if a 6th is wanted — keeps 4–6 range.)

---

## 9. Attachments (14) — Arabic filenames, audience-correct uploader

`storage_path` MUST match `^(project|task|client|offer|invoice|portfolio)/<36-char-uuid>/<uuid>-<filename>`; uploader must satisfy the entity's audience class; `size_bytes` ∈ (0, 10485760]. Upload via the per-entity flow (engineer for task/project/portfolio; manager/accountant for invoice/offer). Generate placeholder binaries separately (PDF/PNG/WEBM).

| # | entity | parent | file_name (Arabic) | mime | uploader (audience) |
|---|---|---|---|---|---|
| 1 | project | P1 | `المخططات-المعمارية-فيلا-الشاطئ.pdf` | application/pdf | عبدالله (member) |
| 2 | project | P2 | `التصميم-الإنشائي-مبنى-المقاولات.pdf` | application/pdf | عبدالله |
| 3 | project | P5 | `مخططات-فيلا-الجبيل.pdf` | application/pdf | سعود |
| 4 | project | P6 | `رخصة-البناء-المعتمدة.pdf` | application/pdf | عبدالله |
| 5 | task | #1 (رفع مساحي P1) | `صورة-الموقع-قبل-البدء.png` | image/png | عبدالله |
| 6 | task | #12 (صب الخرسانة P3) | `صورة-صب-الخرسانة.png` | image/png | سعود |
| 7 | task | #17 (مخططات الجبيل) | `ملاحظة-صوتية-تعديلات-المالك.webm` | audio/webm | عبدالله (**VOICE NOTE** — in-app recorder) |
| 8 | task | #24 (هيكل المستودع P7) | `صورة-الموقع-مستودع.png` | image/png | ماجد (BEFORE deactivation) or سعود |
| 9 | invoice | I1 | `سند-قبض-INV-00001.pdf` | application/pdf | نوال (accountant) |
| 10 | invoice | I3 | `إيصال-تحويل-بنكي.pdf` | application/pdf | نوال |
| 11 | offer | O1 | `عرض-سعر-تصميم-فيلا.pdf` | application/pdf | حمزة (manager) |
| 12 | offer | O6 | `عرض-سعر-رخصة-بناء.pdf` | application/pdf | حمزة |
| 13 | portfolio | PF2 | `غلاف-مجمع-سكني.png` | image/png | حمزة (sets PF2.cover_path) |
| 14 | portfolio | PF4 | `غلاف-إشراف-تجاري.png` | image/png | حمزة |
| (15) | client | C2 | `عقد-التصميم-موقّع.pdf` | application/pdf | حمزة/نوال (clients.view) — optional 15th to show client-file audience (engineers get 0 rows). |

Financial-isolation check (eval): an engineer JWT must read **0** attachment rows + 0 storage objects for offer/invoice entities (#9–#12) — confirm during evaluation.

---

## 10. Timeline (ordered seed steps)

`@T` = backdate target for `created_at` (and the noted event-row `created_at`). Domain dates (issue/due/paid/valid/start) are passed as args at call time per §4–§7. Spread each entity's events on an ascending cadence within its window.

### Phase 1 — service role (no backdate needed beyond profiles.created_at)
1. Create auth users #1–#7 (`email_confirm:true`); insert `profiles` (role, `must_change_password:false`). ماجد active. @T profiles.created_at = 2026-02-01.
2. (office_settings singleton already seeded by 0018; will be UPDATED in step 3.)

### Phase 2 — per-persona signed-in pass (oldest→newest)
3. **حمزة**: `saveOfficeSettings` (§2). @T 2026-02-01.
4. **حمزة**: `saveClient` C1…C9 (§3), in order. @T 2026-02-02 → 2026-03-25 spread (C9 newest).
5. **حمزة**: `offer_create` O1→O11 oldest-first (§4). @T = each offer's issue_date. (Sequence assigns OFR-00001…00011.)
6. **حمزة**: `offer_transition` per offer: O1/O2/O3/O4/O6/O8 → `sent` then `accepted`; O7 → sent then `rejected` (+note); O11 → sent then `expired` (+note); O5/O10 → `sent` (leave); O9 stays `draft`. @T events between issue_date and valid_until.
7. **حمزة**: `offer_add_note` where noted (O7, O11). @T after the transition.
8. **حمزة**: `offer_convert_to_project` for O1→P1, O2→P2, O3→P3, O4→P4, O6→P6, O8→P8 (creates planning/0 projects + project_financials.contract_value). @T = project start_date.
9. **حمزة**: `saveProject` (INSERT) for direct projects P5, P7, P9, P10, P11, P12 (§5). @T = start_date.
10. **حمزة**: `saveProject` (UPDATE) on ALL projects to set final status/progress/dates per §5 (converted ones move planning→active/completed/etc.; direct ones set status). @T = updated_at near each project's latest activity.
11. **حمزة/نوال**: `setProjectFinancials` to add `cost` (and re-send `contract_value` for converted ones; set contract_value for direct ones) per §5. @T mid-project.
12. **حمزة**: `addProjectMember` for each project's members (active engineers only) — **including ماجد on P2 & P7 (must be now, while active)**. @T = start_date + a few days.
13. **حمزة**: `task_create` for all 44 tasks (assigned ones get `p_assignee`; unassigned get `new`). Create oldest-first within each project. @T created event = creation date in each task's window.
14. **Engineers (A/B/C as own assignee)**: `task_start` → `task_set_progress`(×N) → `task_submit` on their tasks per §6 history beats. **ماجد (C) does tasks #6, #7, #23, #24 start/progress/submit + the §6-row-43 `project_set_progress(P2,40)` NOW (before deactivation).** @T each event spread ascending (e.g., start = create+1–3d, each progress +2–5d, submit near due).
15. **حمزة**: `task_close` on all closed tasks; `task_reopen` on #9 (submitted→in_progress, +note) and #37 (closed→in_progress) then its re-submit/re-close; `task_milestone` on #21 («أصدرنا الرخصة») and #35 («اعتُمدت الرخصة»). @T after the submit/closed beats.
16. **نوال (accountant)** [or حمزة]: `invoice_create` I1→I16(/I17) oldest-first (§7) → `invoice_send` (skip I14 draft) → `invoice_record_payment` per the FINAL payment list (after the §7 ratio adjustment). @T = issue_date for create; payment events @T = paid_at.
17. **نوال**: `invoice_add_note` follow-ups on I5/I7/I11 (§7). @T = note dates.
18. **حمزة (manager)**: `invoice_void` I15 (+note); `payment_reverse` the first I16 cheque payment (+note «ارتد الشيك») BEFORE recording I16's second payment in step 16 ordering (so the reversal sits chronologically between the two). @T = event dates.
19. **Engineers / حمزة / نوال**: upload attachments §9 (audience-correct). @T = near the parent entity's activity. ماجد's task attachment (#8) BEFORE his deactivation.
20. **حمزة**: `portfolio_items` insert PF1–PF5(/PF6); set `cover_path` to the uploaded portfolio covers (#13,#14 and 3 more covers). @T = 2026-05-25 → 2026-06-05.
21. **حمزة (manager)**: **`setMemberActive(ماجد, false)`** — the FINAL persona write. Shows the inactive flow (auth ban + is_active=false). @T = 2026-06-06.
22. **حمزة**: AFTER ماجد is inactive, `task_assign(#24 → سعود, note «نقل المهمة بعد توقف المهندس ماجد»)` (legal on in_progress) and review/close #7 (`task_close`, ماجد's still-pending submission) — demonstrates handling an inactive engineer's open + submitted work. @T = 2026-06-07.

### Phase 3 — service-role backdate pass (one transaction)
23. `set session_replication_role = replica;` then UPDATE `created_at`/`updated_at` on profiles/clients/projects/project_financials/offers/invoices/payments/portfolio_items/attachments and `created_at` on task_events/invoice_events/offer_events/audit_log to the @T targets above, **preserving per-entity chronological order of events**. Reset `set session_replication_role = default;`. (This bypasses set_updated_at + notify triggers.)

### Phase 4 — reminders via real code path
24. Service role / postgres: `select public.run_daily_reminders();` ONCE. Generates (deduped): `invoice_overdue` (I4,I5,I7,I11,I12,I13,I16 → حمزة+نوال), `task_due_today` (#11,#39 → assignees), `task_overdue` (#4,#9,#14,#15,#17,#18,#42 → assignees + حمزة), `offer_expired_unhandled` (O10 → managers). Confirms the bell + «متأخرة»/«بانتظار المراجعة» tabs + /calendar June 2026 are populated.

---

## Coherence verification checklist (run against the built data before the eval)

1. Every task's final state is reachable from `task_create`'s forced `new`/`assigned` (progress 0) by a legal path; no `set_progress` after `submit`.
2. ماجد has NO step after #21 (deactivation) that names him as assignee/handoff-target/new-member; his pre-deactivation work all succeeded.
3. `INV-`/`OFR-` numbers ascend with backdated issue dates (created oldest-first).
4. Office `vat_number` is 15 digits → invoices render «فاتورة ضريبية مبسطة» + ZATCA QR; C2/C3/C5 invoices render «فاتورة ضريبية» + buyer block.
5. Overdue invoices land in d1_30 / d31_60 / d60_plus vs 2026-06-13 (worklist age-ordered); I10 (NULL due, sent) shows the warning; ≥1 invoice with follow-up notes shows «آخر متابعة».
6. Collected ÷ issued (sent/partially_paid/paid only; draft+void excluded) ∈ [0.65, 0.75] — **sum the final payments and confirm**.
7. ≥2 overdue projects (P4, P5); 3 completed (P6,P8,P10) feeding ≥4 portfolio items; project statuses span all 5 enum values.
8. Engineer JWT reads 0 rows from project_financials/invoices/payments/invoice_events/offers/offer_events and 0 offer/invoice attachment rows + storage objects.
9. `audit_log` contains a `projects.set_progress` row from ماجد (member-driven progress proof) and the manager close/reopen/void/reverse rows.
10. `run_daily_reminders()` ran once post-backdate; bell shows overdue/due-today/stale-offer notifications for the right recipients only.
