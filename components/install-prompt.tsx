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

/**
 * «ثبّت التطبيق» — a dismissible Arabic install affordance.
 * Android/Chromium: captures `beforeinstallprompt` and offers a one-tap install.
 * iOS Safari (no programmatic install): shows the "Share → Add to Home Screen"
 * instruction. Hidden entirely once the app runs standalone (already installed).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS has no beforeinstallprompt — show the "Add to Home Screen" hint.
    // Deferred into a microtask so we never setState synchronously in the
    // effect body (react-hooks/set-state-in-effect, same as notifications-bell).
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled && isIos()) setShowIos(true);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const close = () => {
    setClosed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  if (closed || (!deferred && !showIos)) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-4 md:bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 shadow-lg">
        <Download className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          {deferred ? (
            <p className="font-medium">ثبّت التطبيق على جهازك للوصول السريع والإشعارات.</p>
          ) : (
            <p className="font-medium">
              لتثبيت التطبيق: اضغط زر المشاركة{" "}
              <Share className="inline size-4 align-text-bottom" aria-hidden /> ثم «أضف إلى الشاشة
              الرئيسية».
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="إغلاق"
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
