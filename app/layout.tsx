import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { brand } from "@/lib/config/brand";
import { HeadSplash } from "@/app/head-splash";
import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "@/components/ui/sonner";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

// The proxy issues a per-request CSP nonce. Statically prerendered HTML (e.g.
// /login, the 404 page) is built without any request, so its <script> tags carry
// no nonce and the browser blocks ALL JS on those pages in production (found
// live: 20 blocked chunks on /login; SW registration dead on the entry page).
// Forcing dynamic rendering at the root keeps every page's nonce in sync with
// the response header. The (app) group was already dynamic via cookies.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: brand.nameAr, template: `%s · ${brand.shortNameAr}` },
  description: brand.taglineAr,
  applicationName: brand.shortNameAr,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: brand.shortNameAr },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <HeadSplash />
        {children}
        <PwaRegister />
        <Toaster
          richColors
          position="bottom-center"
          mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        />
      </body>
    </html>
  );
}
