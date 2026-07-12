"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, CheckCircle2, Download, MoreVertical, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Full-page install guide for the public `/install` landing. Detects the device
 * and shows the right path:
 *   • Android/Chromium → captures `beforeinstallprompt` for a one-tap install
 *     (falls back to menu instructions until the event arrives).
 *   • iOS Safari → the manual "Share → Add to Home Screen" steps (the only way
 *     Apple allows, and required before Web Push works on iOS).
 *   • desktop → nudge to scan the QR with a phone, or install in-browser.
 * Renders an "already installed" state once the app runs standalone.
 */
export function InstallGuide({ appHref }: { appHref: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Detect off the effect body (react-hooks/set-state-in-effect).
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setInstalled(isStandalone());
      setPlatform(detectPlatform());
    });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden />
        <p className="font-medium">التطبيق مثبّت على هذا الجهاز.</p>
        <Button asChild className="w-full">
          <Link href={appHref}>فتح التطبيق</Link>
        </Button>
      </div>
    );
  }

  const installNow = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="space-y-4">
      {/* Android / Chromium one-tap install when the browser offers it. */}
      {deferred ? (
        <Button type="button" className="w-full" size="lg" onClick={installNow}>
          <Download className="size-5" />
          ثبّت التطبيق الآن
        </Button>
      ) : null}

      {platform === "ios" ? (
        <Steps
          icon={<Apple className="size-5" aria-hidden />}
          title="على آيفون / آيباد (Safari)"
          steps={[
            <>افتح هذه الصفحة في متصفّح <b>Safari</b> (وليس داخل تطبيق آخر).</>,
            <>اضغط زر المشاركة <Share className="inline size-4 align-text-bottom" aria-hidden /> في شريط Safari.</>,
            <>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.</>,
            <>اضغط <b>«إضافة»</b>، ثم افتح التطبيق من الأيقونة الجديدة.</>,
          ]}
        />
      ) : null}

      {platform === "android" && !deferred ? (
        <Steps
          icon={<MoreVertical className="size-5" aria-hidden />}
          title="على أندرويد (Chrome)"
          steps={[
            <>افتح هذه الصفحة في متصفّح <b>Chrome</b>.</>,
            <>اضغط قائمة النقاط الثلاث <b>⋮</b> أعلى المتصفّح.</>,
            <>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</>,
            <>أكّد، ثم افتح التطبيق من الأيقونة الجديدة.</>,
          ]}
        />
      ) : null}

      {platform === "desktop" && !deferred ? (
        <div className="rounded-lg bg-muted/50 p-4 text-center text-sm">
          <p className="font-medium">أنت على جهاز مكتبي.</p>
          <p className="mt-1 text-muted-foreground">
            لتثبيته على جوالك، امسح رمز QR بالأعلى بكاميرا الجوال، أو افتح الرابط على الهاتف مباشرة.
          </p>
        </div>
      ) : null}

      <Button asChild variant="outline" className="w-full">
        <Link href={appHref}>فتح التطبيق في المتصفّح</Link>
      </Button>
    </div>
  );
}

function Steps({
  icon,
  title,
  steps,
}: {
  icon: React.ReactNode;
  title: string;
  steps: React.ReactNode[];
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </span>
            <span className="leading-6">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
