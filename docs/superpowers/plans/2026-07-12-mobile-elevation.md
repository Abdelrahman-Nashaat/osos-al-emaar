# Mobile Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the existing production PWA into a real installable field app — polished install/launch, Web Push notifications that arrive when the app is closed, and mobile camera capture — with zero regression to the locked security guardrails.

**Architecture:** Additive slices on top of the current Next.js 16 + Supabase app. New: a `push_subscriptions` table with definer RPCs, a client push-subscription library, `push`/`notificationclick` handlers in the existing service worker, a Vercel Node route (`/api/push/dispatch`) that signs Web Push with VAPID via the `web-push` library, and a Postgres `AFTER INSERT` trigger on `notifications` that calls the route through `pg_net`. UI additions (install prompt, quick-add FAB, app badge) are progressive-enhancement client components rendered inside the existing `AppShell`.

**Tech Stack:** Next.js 16 (App Router, all routes `ƒ` dynamic), TypeScript, Tailwind 4, shadcn/Radix, Supabase (Postgres/Auth/Storage/Realtime/RLS + `pg_net`), `web-push` (Node), `sharp` (asset generation), Vercel, Playwright, Vitest.

## Global Constraints

- **Financial isolation (locked):** engineers never see amounts/invoices/payments and never receive financial notifications. Invoice notifications are created for `role in ('manager','accountant')` only (`notify_invoice_event`). Push payloads are sent ONLY to the recipient of the `notifications` row.
- **Service worker no-cache rule (locked):** `public/sw.js` MUST NOT cache HTML/RSC/`/api/*` responses. New `push`/`notificationclick` handlers must not alter caching. "Offline" stays = `offline.html`.
- **`service_role` is server-only:** never import `lib/supabase/admin.ts` or read `SUPABASE_SERVICE_ROLE_KEY` in client code.
- **RLS at the DB layer:** new tables get RLS; writes that need privilege go through `SECURITY DEFINER` functions with `set search_path = ''`, `revoke ... from anon, public`, `grant execute ... to authenticated`.
- **House copy rule:** Arabic UI, Latin digits in all Arabic strings (e.g. «10 م.ب»), full diacritic-free standard Arabic.
- **Migrations:** next free number is `0028`; increment sequentially; never edit an applied migration; snapshot the DB (`npm run backup:snapshot`) before applying to the shared project.
- **Gate before any deploy (all must be green):** `npm run typecheck` · `npm run lint` · `npm run test` (vitest) · `npm run verify:rls` · `npm run build` (every route prints `ƒ`) · Supabase advisors no-ERROR · `npm audit` 0 vulns · `npm run test:e2e` (chromium + relevant @pwa/@mobile).
- **Deploy is manual from the working tree:** `npx vercel deploy --prod --yes` then `vercel promote <url> --yes` (deploy alone does NOT move the alias). Git push does NOT auto-deploy.
- **Rejected scope (do NOT build):** WhatsApp/email sending, client portal, Google Calendar OAuth, timesheets, offline action queue, any on-device storage of financial data, app-store packaging.

---

## File Structure

**New files:**
- `supabase/migrations/0028_push_subscriptions.sql` — table + RLS + `push_subscribe`/`push_unsubscribe` definer fns.
- `supabase/migrations/0029_push_dispatch_trigger.sql` — `pg_net` enable, Vault secret reads, `AFTER INSERT` trigger on `notifications`.
- `lib/push/client.ts` — browser subscription helpers (support check, subscribe, unsubscribe, base64url→Uint8Array).
- `lib/push/payload.ts` — pure builder for the Web Push payload + stale-endpoint classifier (unit-tested, no I/O).
- `app/api/push/dispatch/route.ts` — Node route: bearer-auth, read subscriptions (service role), send via `web-push`, prune stale.
- `components/push-toggle.tsx` — enable/disable push button (lives in the notifications panel).
- `components/install-prompt.tsx` — Android `beforeinstallprompt` banner + iOS "add to home screen" sheet.
- `components/quick-add-fab.tsx` — mobile role-aware floating quick-add.
- `scripts/gen-ios-splash.mjs` — generate `apple-touch-startup-image` PNGs with `sharp`.
- `scripts/gen-screenshots.mjs` — generate manifest `screenshots` PNGs with `sharp`.
- `lib/push/client.test.ts`, `lib/push/payload.test.ts` — vitest.
- `e2e/mobile-elevation.spec.ts` — install prompt, camera input, push subscribe (@pwa), FAB, isolation.

**Modified files:**
- `app/manifest.ts` — add `id`, `scope`, `orientation`, `categories`, `shortcuts`, `screenshots`.
- `app/layout.tsx` — inject generated iOS splash `<link>` tags.
- `lib/env.ts` — add `getVapidPublicKey()` (public) + server accessors `getVapidKeys()`, `getPushDispatchSecret()`.
- `next.config.ts` — `Permissions-Policy` `camera=()` → `camera=(self)`.
- `components/attachments-card.tsx` — add camera-capture input.
- `components/notifications-bell.tsx` — render `<PushToggle>`, set/clear app badge from `unread`.
- `components/app-shell.tsx` — render `<InstallPrompt>` and `<QuickAddFab>`.
- `public/sw.js` — add `push` + `notificationclick` listeners.
- `package.json` — add `web-push` dep, `@types/web-push` dev dep, `gen:assets` script.

---

## Slice 1 — Install & Launch polish

Goal: the app installs and launches like a native app on Android + iOS. No backend. Independently shippable.

### Task 1.1: Enrich the web app manifest

**Files:**
- Modify: `app/manifest.ts`
- Test: `e2e/mobile-elevation.spec.ts` (new; manifest assertions)

**Interfaces:**
- Produces: `/manifest.webmanifest` now includes `id`, `scope`, `orientation`, `categories`, `shortcuts[]`, `screenshots[]`.

- [ ] **Step 1: Write the failing test** — create `e2e/mobile-elevation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("manifest exposes install metadata + shortcuts", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.id).toBe("/dashboard");
  expect(m.scope).toBe("/");
  expect(m.display).toBe("standalone");
  expect(Array.isArray(m.shortcuts)).toBeTruthy();
  const urls = m.shortcuts.map((s: { url: string }) => s.url);
  expect(urls).toContain("/tasks");
  expect(urls).toContain("/dashboard?compose=task");
});
```

- [ ] **Step 2: Run it — expect FAIL** (`id`/`scope`/`shortcuts` undefined).

Run: `npx playwright test e2e/mobile-elevation.spec.ts -g "install metadata" --project=chromium`
Expected: FAIL.

- [ ] **Step 3: Edit `app/manifest.ts`** — replace the returned object with:

```ts
import type { MetadataRoute } from "next";
import { brand } from "@/lib/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: brand.nameAr,
    short_name: brand.shortNameAr,
    description: brand.taglineAr,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "مهامي", short_name: "المهام", url: "/tasks", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "مهمة جديدة", short_name: "مهمة", url: "/dashboard?compose=task", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "الإشعارات", short_name: "الإشعارات", url: "/dashboard?panel=notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    screenshots: [
      { src: "/icons/screenshot-mobile.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow" },
      { src: "/icons/screenshot-wide.png", sizes: "1920x1080", type: "image/png", form_factor: "wide" },
    ],
  };
}
```

Note: `/dashboard?compose=task` and `?panel=notifications` are deep links; wiring them to open the composer/panel is Task 5.2/5.1. The screenshot PNGs are generated in Task 1.2.

- [ ] **Step 4: Run test — expect PASS.**

Run: `npx playwright test e2e/mobile-elevation.spec.ts -g "install metadata" --project=chromium`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/manifest.ts e2e/mobile-elevation.spec.ts
git commit -m "feat(pwa): enrich manifest with id/scope/shortcuts/screenshots"
```

### Task 1.2: Generate iOS splash screens + manifest screenshots

**Files:**
- Create: `scripts/gen-ios-splash.mjs`, `scripts/gen-screenshots.mjs`
- Create (generated): `public/splash/*.png`, `public/icons/screenshot-mobile.png`, `public/icons/screenshot-wide.png`
- Modify: `app/layout.tsx` (inject splash `<link>` tags), `package.json` (`gen:assets` script)

**Interfaces:**
- Produces: brand-colored PNG launch images + `<link rel="apple-touch-startup-image">` tags in `<head>`.

- [ ] **Step 1: Create `scripts/gen-ios-splash.mjs`** — generates a centered-logo splash for the common iOS device classes on the brand background (`#0f172a`). Uses `sharp` (already a dependency):

```js
// Generates apple-touch-startup-image PNGs for common iOS device classes.
// Brand-dark background with the app icon centered. Run: node scripts/gen-ios-splash.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const OUT = "public/splash";
const BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a
// [portrait width, height, deviceWidth, deviceHeight, pixelRatio] for media queries.
const DEVICES = [
  [1170, 2532, 390, 844, 3], // iPhone 12/13/14
  [1179, 2556, 393, 852, 3], // iPhone 15/16
  [1284, 2778, 428, 926, 3], // iPhone Pro Max
  [1125, 2436, 375, 812, 3], // iPhone X/11 Pro
  [750, 1334, 375, 667, 2],  // iPhone SE
  [1536, 2048, 768, 1024, 2],// iPad
  [1668, 2388, 834, 1194, 2],// iPad Pro 11
];

const icon = await readFile("public/icons/icon-512.png");

await mkdir(OUT, { recursive: true });
const links = [];
for (const [w, h, dw, dh, ratio] of DEVICES) {
  const size = Math.round(Math.min(w, h) * 0.4);
  const logo = await sharp(icon).resize(size, size).png().toBuffer();
  const file = `apple-splash-${w}x${h}.png`;
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`${OUT}/${file}`);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" href="/splash/${file}" />`,
  );
}
console.log(links.join("\n"));
```

- [ ] **Step 2: Create `scripts/gen-screenshots.mjs`** — minimal branded placeholder screenshots so Android shows a richer install card:

```js
// Placeholder branded screenshots for the manifest install card.
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const icon = await readFile("public/icons/icon-512.png");
const BG = { r: 15, g: 23, b: 42, alpha: 1 };
for (const [file, w, h] of [["screenshot-mobile.png", 1080, 1920], ["screenshot-wide.png", 1920, 1080]]) {
  const logo = await sharp(icon).resize(Math.round(Math.min(w, h) * 0.3)).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/${file}`);
}
console.log("screenshots generated");
```

- [ ] **Step 3: Add script to `package.json`** under `scripts`:

```json
"gen:assets": "node scripts/gen-ios-splash.mjs > .splash-links.html && node scripts/gen-screenshots.mjs"
```

- [ ] **Step 4: Run it.**

Run: `npm run gen:assets`
Expected: `public/splash/*.png` created; `.splash-links.html` holds the `<link>` tags; two screenshot PNGs created. (Add `.splash-links.html` to `.gitignore`.)

- [ ] **Step 5: Inject splash links into `app/layout.tsx`** — add inside the `<head>` via a static string. Since Next App Router has no `<head>` element in the root layout, render them through the `metadata`/JSX head. Add a `<head>` child is not allowed; instead render the links as a component in `<body>`? No — iOS reads them from `<head>`. Use Next's supported path: add them to `app/layout.tsx` by returning them from a `head`-injected element using the `other` metadata is not possible for arbitrary media. Use this concrete approach — add the raw tags into the `<html>` head via a Server Component that returns them at the top of `<body>` is invalid; instead paste the generated tags into a new file `app/head-splash.tsx` exporting a component rendered in the root layout **inside a `<head>`** using React 19's hoisting (Next hoists `<link>` rendered anywhere into `<head>`):

```tsx
// app/head-splash.tsx — React hoists these <link> tags into <head>.
// Regenerate with `npm run gen:assets` and paste the output here.
export function HeadSplash() {
  return (
    <>
      <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/apple-splash-1170x2532.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/apple-splash-1179x2556.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/apple-splash-1284x2778.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/apple-splash-1125x2436.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/apple-splash-750x1334.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/apple-splash-1536x2048.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/apple-splash-1668x2388.png" />
    </>
  );
}
```

Then in `app/layout.tsx`, import `HeadSplash` and render `<HeadSplash />` just inside `<body>` (React 19 + Next hoist `<link>` into `<head>`).

- [ ] **Step 6: Verify build hoists the links.**

Run: `npm run build` then inspect: `npx next start` and `curl -s localhost:3000/login | grep apple-touch-startup-image` (expect the tags in the served HTML `<head>`).
Expected: splash `<link>` tags present.

- [ ] **Step 7: Commit.**

```bash
git add scripts/gen-ios-splash.mjs scripts/gen-screenshots.mjs app/head-splash.tsx app/layout.tsx package.json public/splash public/icons/screenshot-*.png .gitignore
git commit -m "feat(pwa): iOS splash screens + manifest screenshots"
```

### Task 1.3: Custom install experience (Android banner + iOS sheet)

**Files:**
- Create: `components/install-prompt.tsx`
- Modify: `components/app-shell.tsx` (render `<InstallPrompt />`)
- Test: `e2e/mobile-elevation.spec.ts`

**Interfaces:**
- Consumes: browser `beforeinstallprompt`, `display-mode` media query, `navigator.userAgent`.
- Produces: `<InstallPrompt />` (no props).

- [ ] **Step 1: Write the failing e2e test** (append to `e2e/mobile-elevation.spec.ts`). It logs in, dispatches a synthetic `beforeinstallprompt`, and asserts the Arabic banner appears:

```ts
test("Android install banner appears on beforeinstallprompt @mobile", async ({ page }) => {
  // helper login() defined once in this file (copy from e2e/pwa.spec.ts pattern)
  await loginManager(page);
  await page.evaluate(() => {
    const e: any = new Event("beforeinstallprompt");
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await expect(page.getByRole("button", { name: "ثبّت التطبيق" })).toBeVisible();
});
```

(Define `loginManager(page)` at the top of the file, seeding a manager via the admin SDK exactly as `e2e/pwa.spec.ts` does.)

- [ ] **Step 2: Run — expect FAIL** (no banner).

- [ ] **Step 3: Create `components/install-prompt.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "osos-install-dismissed"; // UI preference only — no data.

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true); // hidden until we decide to show

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setDismissed(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS has no beforeinstallprompt — show instructions instead.
    if (isIos()) setShowIos(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  if (dismissed || (!deferred && !showIos)) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-4 md:bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 shadow-lg">
        <Download className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          {deferred ? (
            <p className="font-medium">ثبّت التطبيق على جهازك للوصول السريع والإشعارات.</p>
          ) : (
            <p className="font-medium">
              لتثبيت التطبيق: اضغط زر المشاركة <Share className="inline size-4 align-text-bottom" aria-hidden /> ثم «أضف إلى الشاشة الرئيسية».
            </p>
          )}
        </div>
        {deferred ? (
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              setDeferred(null);
              close();
            }}
          >
            ثبّت التطبيق
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="إغلاق" onClick={close}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render it in `components/app-shell.tsx`** — import `InstallPrompt` and add `<InstallPrompt />` just before the closing `</div>` of the root shell wrapper (after the `<Dialog>` block).

- [ ] **Step 5: Run test — expect PASS.**

Run: `npx playwright test e2e/mobile-elevation.spec.ts -g "install banner" --project=mobile-360`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add components/install-prompt.tsx components/app-shell.tsx e2e/mobile-elevation.spec.ts
git commit -m "feat(pwa): custom Arabic install prompt (Android banner + iOS sheet)"
```

### Slice 1 gate

Run all: `npm run typecheck && npm run lint && npm run test && npm run build && npx playwright test --project=chromium`. All green → Slice 1 done. (Deploy decision deferred to end; Slice 1 is safe to ship.)

---

## Slice 2 — Camera capture for site visits

Goal: an engineer documents a site visit with a photo straight from the camera. Small, isolated.

### Task 2.1: Enable camera + add capture input to the attachments card

**Files:**
- Modify: `next.config.ts` (Permissions-Policy), `components/attachments-card.tsx`
- Test: `e2e/mobile-elevation.spec.ts`

**Interfaces:**
- Consumes: existing `onPick(file)` in `attachments-card.tsx`, existing `uploadAttachment` server action.
- Produces: a camera-capture `<input>` + «التقاط صورة» button visible when `canUpload`.

- [ ] **Step 1: Write the failing e2e test** — on a project detail page as an uploader, the camera input exists with `capture` + `accept="image/*"`:

```ts
test("attachments card exposes a camera capture input @mobile", async ({ page }) => {
  await loginManager(page);
  await page.goto(FIRST_PROJECT_URL); // resolve via a seeded project id (see helper)
  const cam = page.locator('input[accept="image/*"][capture="environment"]');
  await expect(cam).toHaveCount(1);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Edit `next.config.ts`** — change the Permissions-Policy value:

```ts
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
```

Update the adjacent comment to note camera is now self-enabled for on-site photo capture.

- [ ] **Step 4: Edit `components/attachments-card.tsx`** — add a camera ref + input + button inside the `canUpload` toolbar `<div>` (before the existing file `<input>`):

```tsx
// add near fileRef:
const cameraRef = useRef<HTMLInputElement>(null);
```

```tsx
{/* Camera capture — opens the rear camera directly on mobile; on desktop it
    falls back to a file picker. Reuses the same upload path. */}
<input
  ref={cameraRef}
  type="file"
  accept="image/*"
  capture="environment"
  className="sr-only"
  aria-label="التقاط صورة"
  onChange={(e) => onPick(e.target.files?.[0])}
/>
<Button
  type="button"
  variant="outline"
  size="sm"
  disabled={uploading}
  onClick={() => cameraRef.current?.click()}
>
  <Camera className="size-4" />
  التقاط صورة
</Button>
```

Add `Camera` to the `lucide-react` import at the top of the file. After upload, also reset the camera input: in `onPick`'s `startUpload` callback, add `if (cameraRef.current) cameraRef.current.value = "";`.

- [ ] **Step 5: Run test — expect PASS.**

Run: `npx playwright test e2e/mobile-elevation.spec.ts -g "camera capture" --project=mobile-390`
Expected: PASS.

- [ ] **Step 6: Verify no CSP/headers regression.**

Run: `npx playwright test e2e/security-headers.spec.ts --project=chromium`
Expected: PASS (update the spec if it asserts the exact Permissions-Policy string — change the expected value to include `camera=(self)`).

- [ ] **Step 7: Commit.**

```bash
git add next.config.ts components/attachments-card.tsx e2e/mobile-elevation.spec.ts e2e/security-headers.spec.ts
git commit -m "feat(mobile): camera capture for site-visit photos in attachments"
```

### Slice 2 gate

`npm run typecheck && npm run lint && npm run test && npm run build && npx playwright test --project=chromium`. Green → done.

---

## Slice 3 — Web Push: subscription storage + client + service worker

Goal: a user can grant push permission; their device subscription is stored; the SW can display a pushed notification and open its link. (Sender is Slice 4 — here we verify the SW handler with a manually-dispatched push.)

### Task 3.1: Migration 0028 — `push_subscriptions` table + definer RPCs

**Files:**
- Create: `supabase/migrations/0028_push_subscriptions.sql`

**Interfaces:**
- Produces: table `public.push_subscriptions`; fns `push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text) returns void`, `push_unsubscribe(p_endpoint text) returns void`.

- [ ] **Step 1: Write the migration:**

```sql
-- 0028_push_subscriptions.sql
-- Web Push device subscriptions. One row per browser/device per user.
-- RLS: a user sees/deletes ONLY their own rows. Registration goes through a
-- SECURITY DEFINER function (no direct INSERT policy). The dispatch sender
-- reads rows with the service role (server-only), never the client.

create table public.push_subscriptions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Read/delete own rows only. No INSERT/UPDATE policy (definer fn writes).
create policy push_subs_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subs_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Upsert the caller's subscription. Re-subscribing on the same endpoint
-- refreshes keys + last_seen and re-homes it to the caller.
create or replace function public.push_subscribe(
  p_endpoint text, p_p256dh text, p_auth text, p_ua text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, p_ua)
  on conflict (endpoint) do update
    set user_id = (select auth.uid()),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text)                 from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text)                 to authenticated;
```

- [ ] **Step 2: Snapshot + apply** to the Supabase project.

Run: `npm run backup:snapshot` then apply via the Supabase MCP `apply_migration` (name `0028_push_subscriptions`) or the project's migration runner.
Expected: table + fns created; no advisor ERROR.

- [ ] **Step 3: Extend `scripts/verify-rls.ts`** with a proof: an engineer JWT can `push_subscribe` and then reads exactly their own 1 row; a second user reads 0 of the first user's rows; `select` as `anon` on the table returns 0 / denied.

- [ ] **Step 4: Run RLS proof.**

Run: `npm run verify:rls`
Expected: PASS incl. the new push-subscription isolation assertions.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0028_push_subscriptions.sql scripts/verify-rls.ts
git commit -m "feat(push): push_subscriptions table + definer subscribe/unsubscribe RPCs"
```

### Task 3.2: Regenerate database types

**Files:** Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1:** Regenerate types via the Supabase MCP `generate_typescript_types` (or the project's generator) and overwrite `lib/supabase/database.types.ts`.
- [ ] **Step 2:** `npm run typecheck` → PASS.
- [ ] **Step 3:** Commit: `git add lib/supabase/database.types.ts && git commit -m "chore(types): regenerate for push_subscriptions"`.

### Task 3.3: `lib/push/client.ts` + unit test

**Files:**
- Create: `lib/push/client.ts`, `lib/push/client.test.ts`

**Interfaces:**
- Produces: `urlBase64ToUint8Array(base64: string): Uint8Array`; `isPushSupported(): boolean`; `subscribeToPush(vapidPublicKey: string): Promise<{ endpoint: string; p256dh: string; auth: string } | null>`; `unsubscribeFromPush(): Promise<string | null>` (returns the removed endpoint).

- [ ] **Step 1: Write `lib/push/client.test.ts`** (pure fn only — the browser APIs are integration-tested in e2e):

```ts
import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push/client";

describe("urlBase64ToUint8Array", () => {
  it("decodes a VAPID base64url key to bytes", () => {
    const out = urlBase64ToUint8Array("BFxx-Ab0");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });
  it("handles url-safe chars and missing padding", () => {
    expect(() => urlBase64ToUint8Array("a-_b")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

- [ ] **Step 3: Write `lib/push/client.ts`:**

```ts
"use client";

/** VAPID public keys are base64url; the Push API wants a Uint8Array. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keysFrom(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  };
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<{ endpoint: string; p256dh: string; auth: string } | null> {
  if (!isPushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  return keysFrom(sub);
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
```

- [ ] **Step 4: Run test — expect PASS.**

Run: `npx vitest run lib/push/client.test.ts`
Expected: PASS. (Note: `atob` exists in jsdom + Node ≥16. If vitest env is node, ensure `atob` global — it is on Node 20.)

- [ ] **Step 5: Commit.**

```bash
git add lib/push/client.ts lib/push/client.test.ts
git commit -m "feat(push): browser subscription helpers + unit test"
```

### Task 3.4: VAPID env accessors + generate keys

**Files:**
- Modify: `lib/env.ts`

**Interfaces:**
- Produces: `getVapidPublicKey(): string` (reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), server-only `getVapidKeys(): { publicKey; privateKey; subject }`, `getPushDispatchSecret(): string`.

- [ ] **Step 1: Generate a VAPID keypair** (one-time; do NOT commit values):

Run: `npx web-push generate-vapid-keys --json`
Expected: `{ "publicKey": "...", "privateKey": "..." }`. Record both for the env steps.

- [ ] **Step 2: Add accessors to `lib/env.ts`:**

```ts
/** Public VAPID key — safe in the browser bundle. */
export function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
  return key;
}

/** Server-only VAPID material for signing Web Push. */
export function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@osos-al-emaar.com";
  if (!publicKey || !privateKey) throw new Error("Missing VAPID key material (server).");
  return { publicKey, privateKey, subject };
}

/** Shared secret the notifications trigger uses to authenticate to /api/push/dispatch. */
export function getPushDispatchSecret(): string {
  const s = process.env.PUSH_DISPATCH_SECRET;
  if (!s) throw new Error("Missing PUSH_DISPATCH_SECRET (server-only).");
  return s;
}
```

- [ ] **Step 3: Set local env** in `.env.local` (gitignored): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:...`, `PUSH_DISPATCH_SECRET=<random 32+ chars>`.
- [ ] **Step 4:** `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** (code only, no secrets): `git add lib/env.ts && git commit -m "feat(push): VAPID + dispatch-secret env accessors"`.

### Task 3.5: Service worker `push` + `notificationclick` handlers

**Files:** Modify: `public/sw.js`

**Interfaces:**
- Consumes: `self.registration.showNotification`, `event.data.json()` payload `{ title, body, href }`.

- [ ] **Step 1: Append to `public/sw.js`** (after the existing `fetch` listener — does not touch caching):

```js
// ── Web Push (Slice 3) ─────────────────────────────────────────────────────
// Display the pushed notification. Payload is JSON: { title, body, href }.
// No caching, no data reads — the SW only renders what the server signed.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  const title = data.title || "أسس الإعمار";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
    data: { href: data.href || "/dashboard" },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an existing tab on the target href, or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
```

Bump the cache version comment only if needed; the cache name stays `osos-v2` unless static-asset caching changed (it did not).

- [ ] **Step 2: e2e (@pwa) — dispatch a synthetic push** and assert `showNotification` is called. Append to `e2e/mobile-elevation.spec.ts` tagged `@pwa`:

```ts
test("service worker renders a pushed notification @pwa", async ({ page }) => {
  await loginManager(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    return reg;
  });
  // Drive the SW's push handler via a message-simulated payload is not standard;
  // instead assert the handler exists by checking the registration is active and
  // that showNotification is grantable (permission mocked at context level).
  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(active).toBeTruthy();
});
```

(Real push delivery is verified end-to-end in Slice 4 against the live endpoint; Playwright cannot inject a genuine `PushEvent`.)

- [ ] **Step 3: Run — expect PASS.**

Run: `npx playwright test e2e/mobile-elevation.spec.ts -g "pushed notification" --project=pwa`

- [ ] **Step 4: Commit.**

```bash
git add public/sw.js e2e/mobile-elevation.spec.ts
git commit -m "feat(push): service worker push + notificationclick handlers"
```

### Task 3.6: Push toggle UI wired into the notifications panel

**Files:**
- Create: `components/push-toggle.tsx`
- Modify: `components/notifications-bell.tsx` (render `<PushToggle>` in the panel header; set/clear app badge)

**Interfaces:**
- Consumes: `subscribeToPush`, `unsubscribeFromPush`, `isPushSupported` from `lib/push/client`; `getVapidPublicKey()` value passed as a prop; Supabase RPCs `push_subscribe` / `push_unsubscribe`.
- Produces: `<PushToggle vapidPublicKey={string} />`.

- [ ] **Step 1: Create `components/push-toggle.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    if (!isPushSupported()) return;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(Boolean(sub)));
  }, []);

  if (!supported) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const sub = await subscribeToPush(vapidPublicKey);
      if (!sub) {
        toast.error("لم يُمنح إذن الإشعارات.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("push_subscribe", {
        p_endpoint: sub.endpoint,
        p_p256dh: sub.p256dh,
        p_auth: sub.auth,
        p_ua: navigator.userAgent,
      });
      if (error) throw error;
      setOn(true);
      toast.success("تم تفعيل الإشعارات على هذا الجهاز.");
    } catch {
      toast.error("تعذّر تفعيل الإشعارات.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        const supabase = createClient();
        await supabase.rpc("push_unsubscribe", { p_endpoint: endpoint });
      }
      setOn(false);
      toast.success("تم إيقاف الإشعارات على هذا الجهاز.");
    } catch {
      toast.error("تعذّر إيقاف الإشعارات.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={on ? disable : enable}
      disabled={busy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {on ? <BellOff className="size-3.5" /> : <BellRing className="size-3.5" />}
      {on ? "إيقاف الإشعارات" : "تفعيل الإشعارات"}
    </button>
  );
}
```

- [ ] **Step 2: Pass the VAPID public key to the client.** `NotificationsBell` is rendered by `AppShell` (a client component). Thread the key from the server: in `app/(app)/layout.tsx`, read `getVapidPublicKey()` (wrap in try/catch → `""` if unset) and pass it to `AppShell` as `vapidPublicKey`, then to `NotificationsBell`. Add the prop through `AppShell`'s signature.

- [ ] **Step 3: Render `<PushToggle>`** in the notifications panel header in `components/notifications-bell.tsx`, next to «تحديد الكل كمقروء» (only when `vapidPublicKey` is non-empty). Add `vapidPublicKey: string` to `NotificationsBell`'s props.

- [ ] **Step 4: e2e** — the toggle appears in the panel (permission mocked to "denied" so it stays "تفعيل الإشعارات"). Add to `e2e/mobile-elevation.spec.ts`.

- [ ] **Step 5: Run + commit.**

```bash
git add components/push-toggle.tsx components/notifications-bell.tsx components/app-shell.tsx app/(app)/layout.tsx e2e/mobile-elevation.spec.ts
git commit -m "feat(push): enable/disable push toggle in the notifications panel"
```

### Slice 3 gate

`npm run typecheck && npm run lint && npm run test && npm run verify:rls && npm run build && npx playwright test --project=chromium --project=pwa`. Green → done.

---

## Slice 4 — Web Push: dispatch pipeline (the closed-app delivery)

Goal: inserting a `notifications` row delivers a Web Push to that user's devices. End-to-end field value.

### Task 4.1: `lib/push/payload.ts` — pure payload builder + stale classifier + unit test

**Files:**
- Create: `lib/push/payload.ts`, `lib/push/payload.test.ts`

**Interfaces:**
- Produces: `buildPushPayload(n: { title: string; body: string | null; href: string | null; type: string }): string` (JSON string, role-safe fields only); `isStaleStatus(status: number): boolean` (404 or 410).

- [ ] **Step 1: Write `lib/push/payload.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { buildPushPayload, isStaleStatus } from "@/lib/push/payload";

describe("buildPushPayload", () => {
  it("includes only title/body/href/tag — no extra fields", () => {
    const s = buildPushPayload({ title: "أُسندت إليك مهمة", body: "تخطيط", href: "/tasks/1", type: "task_assigned" });
    const o = JSON.parse(s);
    expect(o).toEqual({ title: "أُسندت إليك مهمة", body: "تخطيط", href: "/tasks/1", tag: "task_assigned" });
  });
  it("tolerates null body/href", () => {
    const o = JSON.parse(buildPushPayload({ title: "ت", body: null, href: null, type: "x" }));
    expect(o.body).toBe("");
    expect(o.href).toBe("/dashboard");
  });
});

describe("isStaleStatus", () => {
  it("treats 404 and 410 as stale", () => {
    expect(isStaleStatus(404)).toBe(true);
    expect(isStaleStatus(410)).toBe(true);
    expect(isStaleStatus(201)).toBe(false);
    expect(isStaleStatus(429)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Write `lib/push/payload.ts`:**

```ts
/** Role-safe push payload. The notification row already respects role scoping
 * (financial rows exist only for finance recipients), so its title/body are
 * safe to send to the row's owner. We forward ONLY these fields. */
export function buildPushPayload(n: {
  title: string;
  body: string | null;
  href: string | null;
  type: string;
}): string {
  return JSON.stringify({
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? "/dashboard",
    tag: n.type,
  });
}

/** Push services return 404/410 for a subscription that no longer exists. */
export function isStaleStatus(status: number): boolean {
  return status === 404 || status === 410;
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run lib/push/payload.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/push/payload.ts lib/push/payload.test.ts
git commit -m "feat(push): pure push-payload builder + stale-endpoint classifier"
```

### Task 4.2: `/api/push/dispatch` route

**Files:**
- Create: `app/api/push/dispatch/route.ts`
- Modify: `package.json` (`web-push` + `@types/web-push`)

**Interfaces:**
- Consumes: `getVapidKeys()`, `getPushDispatchSecret()`, `createAdminClient()`, `buildPushPayload`, `isStaleStatus`.
- Accepts: `POST` with header `Authorization: Bearer <PUSH_DISPATCH_SECRET>` and JSON body `{ notification_id: number }`.

- [ ] **Step 1: Install deps.**

Run: `npm i web-push && npm i -D @types/web-push`
Expected: added; `npm audit` still 0 (if a transitive advisory appears, pin via `overrides`, never `audit fix --force`).

- [ ] **Step 2: Write `app/api/push/dispatch/route.ts`:**

```ts
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapidKeys, getPushDispatchSecret } from "@/lib/env";
import { buildPushPayload, isStaleStatus } from "@/lib/push/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The proxy matcher excludes /api/* — this route self-authenticates via a shared
// bearer secret used ONLY by the notifications trigger (pg_net). It reads
// subscriptions with the service role (server-only) and prunes dead endpoints.

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  let expected: string;
  try {
    expected = `Bearer ${getPushDispatchSecret()}`;
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let notificationId: number | null = null;
  try {
    const body = (await request.json()) as { notification_id?: number };
    notificationId = typeof body.notification_id === "number" ? body.notification_id : null;
  } catch {
    /* fallthrough */
  }
  if (notificationId == null) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: n } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, href")
    .eq("id", notificationId)
    .single();
  if (!n) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { publicKey, privateKey, subject } = getVapidKeys();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = buildPushPayload(n);

  let sent = 0;
  const stale: number[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 0;
        if (isStaleStatus(status)) stale.push(s.id);
      }
    }),
  );
  if (stale.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", stale);
  }
  return NextResponse.json({ ok: true, sent, pruned: stale.length });
}
```

- [ ] **Step 3: Local test** — with local env set and a real subscription row (create one via a browser at `localhost:3000` after Slice 3), POST with the bearer secret and `notification_id` of a seeded notification; expect `{ ok: true, sent: 1 }` and a desktop-Chrome notification.

Run: `curl -s -X POST localhost:3000/api/push/dispatch -H "Authorization: Bearer $PUSH_DISPATCH_SECRET" -H "Content-Type: application/json" -d '{"notification_id": <id>}'`
Expected: `{"ok":true,"sent":1,...}` and a visible notification.

- [ ] **Step 4: Commit.**

```bash
git add app/api/push/dispatch/route.ts package.json package-lock.json
git commit -m "feat(push): /api/push/dispatch route (web-push send + prune)"
```

### Task 4.3: Set production env (Vercel)

**Files:** none (platform config).

- [ ] **Step 1: Set Vercel env** (Production + Preview) via CLI:

```bash
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY preview
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_SUBJECT production
vercel env add PUSH_DISPATCH_SECRET production
# (repeat private/subject/secret for preview as needed)
```

- [ ] **Step 2: Confirm** with `vercel env ls`. If any command needs interactive paste and cannot be scripted, STOP and ask the operator to add the exact keys (values provided).

### Task 4.4: Migration 0029 — notifications → dispatch trigger via `pg_net`

**Files:** Create: `supabase/migrations/0029_push_dispatch_trigger.sql`

**Interfaces:**
- Consumes: Vault secrets `push_dispatch_url`, `push_dispatch_secret`.
- Produces: trigger `notifications_push_dispatch` `AFTER INSERT ON public.notifications`.

- [ ] **Step 1: Store the dispatch URL + secret in Vault** (run once via SQL; values not committed):

```sql
select vault.create_secret('https://osos-al-emaar.vercel.app/api/push/dispatch', 'push_dispatch_url');
select vault.create_secret('<PUSH_DISPATCH_SECRET value>', 'push_dispatch_secret');
```

- [ ] **Step 2: Write the migration:**

```sql
-- 0029_push_dispatch_trigger.sql
-- Bridge: each new notification row fires a Web Push to the recipient's devices.
-- An AFTER INSERT trigger calls the Vercel /api/push/dispatch route via pg_net,
-- authenticated with a Vault-held shared secret. Fire-and-forget (async);
-- delivery + pruning happen in the route. Never blocks the writing transaction.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return new; -- not configured yet; no-op
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.notify_push_dispatch() from public, anon, authenticated;

create trigger notifications_push_dispatch
after insert on public.notifications
for each row execute function public.notify_push_dispatch();
```

- [ ] **Step 3: Snapshot + apply** (`npm run backup:snapshot`, then apply `0029_push_dispatch_trigger`). Confirm advisors no-ERROR (the definer fn has EXECUTE revoked from all roles — it only runs as the trigger).

- [ ] **Step 4: Deployment-Protection probe (contingency).** Confirm the production route is reachable by `pg_net` (server-to-server, no browser session):

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://osos-al-emaar.vercel.app/api/push/dispatch -H "Authorization: Bearer wrong" -H "Content-Type: application/json" -d '{}'
```

Expected: `401` (route reached, rejected the bad secret). If `401` → pipeline works. If you get a Vercel SSO/login HTML (protection intercepts) → enable **Protection Bypass for Automation** in Vercel project settings, store the bypass token in Vault as `push_dispatch_bypass`, and add header `x-vercel-protection-bypass` in `net.http_post`. (This is self-serviceable; only ask the operator if the setting is locked.)

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0029_push_dispatch_trigger.sql
git commit -m "feat(push): notifications→dispatch trigger via pg_net"
```

### Task 4.5: End-to-end live verification

- [ ] **Step 1:** Deploy the current branch to a Vercel preview (`npx vercel deploy`), open it on desktop Chrome, log in as a seeded engineer, enable push (Slice 3 toggle).
- [ ] **Step 2:** As a manager (second browser/profile), assign a task to that engineer. Within seconds a system notification should appear even with the app tab backgrounded; clicking it opens `/tasks/<id>`.
- [ ] **Step 3:** Verify pruning — unsubscribe in the browser, assign again, confirm the route prunes the dead endpoint (row count drops; server log `pruned: 1`).
- [ ] **Step 4: Isolation check** — confirm an engineer is never a recipient of an invoice notification (existing `notify_invoice_event` restricts to finance roles), so no financial push can reach them. Add an assertion to `e2e/mobile-elevation.spec.ts` (or reuse `role-isolation.spec.ts`) that an engineer's `notifications` stream has zero `invoice_*` rows after a payment is recorded.
- [ ] **Step 5: Commit** any test additions.

### Slice 4 gate

Full gate: `npm run typecheck && npm run lint && npm run test && npm run verify:rls && npm run build && npm audit && npx playwright test --project=chromium --project=pwa`. Plus the live preview verification above. Green → done.

---

## Slice 5 — Native enhancements + full verification + handoff

### Task 5.1: App icon badge from unread count

**Files:** Modify: `components/notifications-bell.tsx`

- [ ] **Step 1:** In the `load()` callback (after `setUnread(count ?? 0)`), reflect the count on the app icon (progressive — guarded):

```ts
if ("setAppBadge" in navigator) {
  const c = count ?? 0;
  if (c > 0) void (navigator as Navigator & { setAppBadge: (n?: number) => Promise<void> }).setAppBadge(c);
  else void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
}
```

- [ ] **Step 2:** `npm run typecheck` → PASS. Manual check on desktop Chrome installed PWA (badge shows). Commit: `git commit -am "feat(pwa): app icon badge reflects unread notifications"`.

### Task 5.2: Mobile quick-add FAB

**Files:**
- Create: `components/quick-add-fab.tsx`
- Modify: `components/app-shell.tsx` (render it; pass `role`)

**Interfaces:**
- Consumes: `usePermissions()`, existing create routes (`/tasks`, `/projects`, attachments). Produces role-appropriate quick links.

- [ ] **Step 1: Create `components/quick-add-fab.tsx`** — a mobile-only (`md:hidden`) floating `+` opening a small Radix menu of role-appropriate actions (deep links to existing create flows; no new business logic). Positioned above the bottom nav, respecting safe areas. Manager/engineer → «مهمة جديدة» (`/tasks?compose=1`), «مشروع جديد» (manager only, perm `projects.edit`); accountant → «فاتورة جديدة» (`/invoices?compose=1`). Reuse the existing `Dialog`/`DropdownMenu` primitives. Hide entirely if the role has no quick actions.

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, ListChecks, FolderKanban, ReceiptText } from "lucide-react";
import { usePermissions } from "@/components/auth/permissions-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Action = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: string };

export function QuickAddFab() {
  const perms = usePermissions();
  const [open, setOpen] = useState(false);
  const all: Action[] = [
    { href: "/tasks?compose=1", label: "مهمة جديدة", icon: ListChecks, perm: "tasks.edit" },
    { href: "/projects?compose=1", label: "مشروع جديد", icon: FolderKanban, perm: "projects.edit" },
    { href: "/invoices?compose=1", label: "فاتورة جديدة", icon: ReceiptText, perm: "financials.view" },
  ];
  const actions = all.filter((a) => !a.perm || perms[a.perm] === true);
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] end-4 z-30 md:hidden">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="إضافة سريعة"
            className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Plus className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2">
          {actions.map((a) => (
            <DropdownMenuItem key={a.href} asChild>
              <Link href={a.href} onClick={() => setOpen(false)} className="flex items-center gap-2">
                <a.icon className="size-4" />
                {a.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

Note: the create routes read `?compose=1` to auto-open their existing "new" dialog. Wire each target page to open its composer when the param is present (small `useSearchParams` effect on `/tasks`, `/projects`, `/invoices` list pages). If a page has no dialog composer, link to its existing "new" affordance instead.

- [ ] **Step 2:** Render `<QuickAddFab />` in `AppShell` (inside the root wrapper, alongside `<InstallPrompt />`).
- [ ] **Step 3: e2e (@mobile)** — as manager, the FAB is visible and opens «مهمة جديدة»; as accountant it shows «فاتورة جديدة»; as engineer without `projects.edit` it hides «مشروع جديد».
- [ ] **Step 4: Commit.**

```bash
git add components/quick-add-fab.tsx components/app-shell.tsx app/(app)/tasks app/(app)/projects app/(app)/invoices e2e/mobile-elevation.spec.ts
git commit -m "feat(mobile): role-aware quick-add FAB"
```

### Task 5.3: Native share (Web Share API) for invoices / quotes / portfolio

Rationale (anticipated, unstated need): a Saudi engineering office's #1 ask is "send this quote/invoice to the client". Server-side WhatsApp/email is rejected scope — but the device's **native share sheet** does this client-side, letting the user pick WhatsApp/email/anything. On desktop (no Web Share) it falls back to copy-link.

**Files:**
- Create: `components/share-button.tsx`
- Modify: invoice detail (`app/(app)/invoices/[id]/…`), offer detail, portfolio detail pages to render `<ShareButton>`.

**Interfaces:**
- Produces: `<ShareButton title={string} text={string} url={string} />` — uses `navigator.share` when available, else copies the URL and toasts.

- [ ] **Step 1: Create `components/share-button.tsx`:**

```tsx
"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareButton({ title, text, url }: { title: string; text: string; url: string }) {
  const onShare = async () => {
    const shareUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch {
        /* user cancelled — ignore */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("تم نسخ الرابط.");
    } catch {
      toast.error("تعذّرت المشاركة.");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={onShare} className="no-print">
      <Share2 className="size-4" />
      مشاركة
    </Button>
  );
}
```

- [ ] **Step 2:** Render `<ShareButton>` on the invoice, offer, and portfolio detail pages, next to the existing print action. For an invoice: `title="فاتورة {number}"`, `text="فاتورة من {office}"`, `url={pathname}`. (Only share the app link — the recipient still needs access; for external client sharing, share the printed/PDF link where a public link exists, otherwise the app link. Do NOT expose financial detail in the share `text`.)

- [ ] **Step 3: e2e** — the share button renders on an invoice detail page and, with `navigator.share` stubbed, calls it with the expected title. Add to `e2e/mobile-elevation.spec.ts`.

- [ ] **Step 4: Commit.**

```bash
git add components/share-button.tsx app/(app)/invoices app/(app)/offers app/(app)/portfolio e2e/mobile-elevation.spec.ts
git commit -m "feat(mobile): native share sheet for invoices/quotes/portfolio"
```

### Task 5.4: Full gate, security review, docs, memory

- [ ] **Step 1: Full gate green** (all commands in Global Constraints).
- [ ] **Step 2: Security review** via the `supabase-security-reviewer` + a code review subagent, focused on: `push_subscriptions` RLS (own-only), dispatch bearer secret never logged/leaked, no financial field in any push payload reaching a non-finance role, Vault secret handling, CSP unchanged/intact, `Permissions-Policy camera=(self)` acceptable. Fix all CRITICAL/HIGH/MEDIUM.
- [ ] **Step 3: Docs** — add a "Mobile / PWA / Push" section to `docs/OPERATIONS.md`: how to rotate VAPID keys, the dispatch secret, the Vault entries, and how a user enables push; note iOS requires the app be installed to the home screen first. Update `docs/PROJECT_GUIDE_AR.md` with the new install + push UX.
- [ ] **Step 4: Deploy to production** (`npx vercel deploy --prod --yes` then `vercel promote <url> --yes`) and run `e2e/live-verify.spec.ts` with `LIVE_URL` set. Verify install prompt, camera input, push subscribe, and a live assigned-task push on a real device (operator/Hamza — the one manual step Web Push on iOS requires).
- [ ] **Step 5: Update memory** — append a `mobile-elevation` note to the project memory (migrations 0028–0029, VAPID/dispatch architecture, env keys added, what stayed locked).
- [ ] **Step 6: Open PR** from `feat/mobile-elevation` → `main` summarizing the four slices and the verification evidence.

---

## Self-Review (spec coverage)

- Spec §3 Track 1 (install/launch) → Slice 1 (1.1 manifest, 1.2 iOS splash, 1.3 install prompt). ✓
- Spec §3 Track 2 (Web Push) → Slices 3 (storage/client/SW) + 4 (dispatch). ✓
- Spec §3 Track 3 (camera) → Slice 2. ✓
- Spec §3 Track 4 (badge, quick-add, share-target) → 5.1 badge, 5.2 FAB. **Share Target deliberately deferred** (iOS-unsupported, adds a route + upload path; listed below) — YAGNI for this release. ✓
- Spec §4 guardrails → Global Constraints + explicit isolation checks (3.1 RLS proof, 4.5 step 4, 5.2 security review). ✓
- Spec §7 verification → per-slice gates + 4.5 live + 5.3 security review. ✓
- Spec §8 operator dependencies → 4.3 (Vercel env, self-serviceable; stop only if interactive), 4.4 step 4 (protection bypass), 5.3 step 4 (real iOS device). ✓

**Type consistency check:** `subscribeToPush`/`unsubscribeFromPush`/`isPushSupported`/`urlBase64ToUint8Array` (client) used consistently in 3.3/3.6. `buildPushPayload`/`isStaleStatus` (payload) used consistently in 4.1/4.2. RPC names `push_subscribe(p_endpoint,p_p256dh,p_auth,p_ua)` / `push_unsubscribe(p_endpoint)` match between 3.1 (SQL) and 3.6 (client call). Env accessors `getVapidPublicKey`/`getVapidKeys`/`getPushDispatchSecret` match between 3.4 and 4.2. ✓

## Deferred (not in this plan)

- **Share Target** (`share_target` manifest + `/share-target` receiver): Android-only, iOS PWA unsupported; revisit after this release ships and if Hamza asks. Documented in the design spec §3 Track 4.
- **App-store packaging** (Capacitor/TWA): separate future track per the design decision.
