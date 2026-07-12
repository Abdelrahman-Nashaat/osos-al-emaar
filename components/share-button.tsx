"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Native share for "send this to the client" — the #1 field ask. Uses the
 * device share sheet (`navigator.share`, so the user picks WhatsApp / email /
 * anything) and falls back to copying the link on desktop. Server-side sending
 * is deliberately out of scope. The share payload carries ONLY a title + app
 * link — never any financial figure — and the recipient still needs app access,
 * so this leaks nothing on its own.
 */
export function ShareButton({
  title,
  text,
  url,
  label = "مشاركة",
}: {
  title: string;
  text: string;
  url: string;
  label?: string;
}) {
  const onShare = async () => {
    const shareUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch {
        /* user dismissed the share sheet — not an error */
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
      {label}
    </Button>
  );
}
