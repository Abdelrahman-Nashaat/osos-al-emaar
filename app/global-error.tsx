"use client";

/**
 * Root fallback (Phase 4.5 B4). Replaces the root layout entirely, so it must
 * render its own <html dir="rtl">. Kept dependency-free on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[global-error]", { digest: error.digest, message: error.message });
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          display: "flex",
          minHeight: "100svh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ color: "#666", marginBottom: "1rem" }}>أعد تحميل الصفحة أو حاول مرة أخرى.</p>
          <button
            onClick={() => reset()}
            style={{
              border: "1px solid #ccc",
              borderRadius: "0.5rem",
              padding: "0.5rem 1.25rem",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
