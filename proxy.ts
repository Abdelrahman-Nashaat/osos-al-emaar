import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

/**
 * Runs before every matched request: refreshes the Supabase session cookie and gates access.
 * Unauthenticated users are sent to /login; authenticated users on /login go to /dashboard.
 * /account-disabled and /account/password are normal authenticated routes (each self-guards).
 * Also issues the per-request ENFORCED CSP nonce (Phase 4.5 C7): the nonce travels on the
 * request headers so Next applies it to its inline scripts, and the policy is set on the
 * response. Real authorization is enforced by RLS + per-page permission checks.
 * (Next 16 "proxy" convention, formerly "middleware".)
 */
export async function proxy(request: NextRequest) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

  // ── Enforced CSP (C7; graduated from the Slice A Report-Only soak) ─────────
  // style-src keeps 'unsafe-inline' (RSC/Tailwind inline style attributes can't
  // take nonces); worker-src 'self' keeps the PWA service worker registrable.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseWss = NEXT_PUBLIC_SUPABASE_URL.replace(/^https:/, "wss:");
  // Dev-only: Turbopack evaluates code via eval() for HMR/source maps — without
  // 'unsafe-eval' the dev runtime throws CSP violations (and the error overlay
  // breaks the UI). Production stays strict.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // Portfolio covers (and any inline image attachment) render from a signed
    // Supabase Storage URL — without the project origin here, CSP blocks them
    // and only the placeholder shows.
    `img-src 'self' data: blob: ${NEXT_PUBLIC_SUPABASE_URL}`,
    "font-src 'self'",
    // media-src: voice notes play from a recording blob: preview and from a
    // signed Supabase Storage URL; both are blocked by the default-src fallback.
    `media-src 'self' blob: ${NEXT_PUBLIC_SUPABASE_URL}`,
    `connect-src 'self' ${NEXT_PUBLIC_SUPABASE_URL} ${supabaseWss}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|apple-touch-icon.png|manifest.webmanifest|sw.js|offline.html|robots.txt|api/).*)",
  ],
};
