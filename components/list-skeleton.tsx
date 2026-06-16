/**
 * Route-shaped loading skeleton for the list pages (projects/tasks/clients/
 * invoices/offers). Replaces the generic dashboard-shaped skeleton on those
 * routes so the placeholder matches what loads — less layout shift, better
 * perceived speed. Decorative only (the real content announces itself).
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-muted/50" />
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
          >
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="hidden h-4 w-32 animate-pulse rounded bg-muted/70 sm:block" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
