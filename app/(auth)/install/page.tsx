import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Building2 } from "lucide-react";
import { brand } from "@/lib/config/brand";
import { InstallGuide } from "@/components/install-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "تثبيت التطبيق",
  description: "ثبّت تطبيق أسس الإعمار على جوالك للوصول السريع والإشعارات الفورية.",
};

/**
 * Public install landing (`/install`) — a shareable link for onboarding staff onto
 * the mobile app. Shows a QR (scan to open this page on a phone) plus a device-aware
 * guide: a one-tap install button where the browser allows it (Android/desktop
 * Chromium), and the manual Home-Screen steps on iOS (Apple permits no other way).
 * Whitelisted as public in proxy.ts.
 */
export default async function InstallPage() {
  const h = await headers();
  const host = h.get("host") ?? "osos-al-emaar.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const installUrl = `${proto}://${host}/install`;
  const qrDataUrl = await QRCode.toDataURL(installUrl, { margin: 1, width: 240 });

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center space-y-2 text-center">
        <Building2 className="size-8 text-primary" aria-hidden />
        <CardTitle className="text-xl">{brand.nameAr}</CardTitle>
        <p className="text-sm text-muted-foreground">ثبّت التطبيق على جوالك للوصول السريع والإشعارات</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data-URL QR */}
          <img
            src={qrDataUrl}
            alt="رمز QR لفتح صفحة التثبيت على الجوال"
            width={240}
            height={240}
            className="mx-auto rounded-lg border border-border"
          />
          <p className="text-center text-xs text-muted-foreground">
            امسح الرمز بكاميرا جوالك لفتح هذه الصفحة على الهاتف
          </p>
        </div>

        <InstallGuide appHref="/dashboard" />
      </CardContent>
    </Card>
  );
}
