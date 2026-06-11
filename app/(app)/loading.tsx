/** Shared in-app loading skeleton (Phase 4.5 B4). */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
    </div>
  );
}
