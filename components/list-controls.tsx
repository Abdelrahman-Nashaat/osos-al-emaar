import Link from "next/link";
import { Search } from "lucide-react";

/**
 * Server-side search + pagination primitives for the growing lists
 * (Phase 4.5 C4). Plain GET form + links — no client JS needed.
 */
export const LIST_PAGE_SIZE = 25;

export function parseListParams(params: { q?: string; page?: string }) {
  // Strip PostgREST .or()/ilike metacharacters so user input can't break the
  // filter expression (it is a filter, not SQL — but keep it clean anyway).
  const q = (params.q ?? "").trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 80).trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  return { q, page, from: (page - 1) * LIST_PAGE_SIZE, to: page * LIST_PAGE_SIZE };
}

export function SearchBox({
  placeholder,
  q,
  hidden = {},
}: {
  placeholder: string;
  q: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" role="search" className="no-print flex items-center gap-2">
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        dir="auto"
        className="h-10 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <button
        type="submit"
        aria-label="بحث"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}

export function Pager({
  page,
  hasMore,
  basePath,
  params = {},
}: {
  page: number;
  hasMore: boolean;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  if (page === 1 && !hasMore) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const linkCls =
    "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted";
  return (
    <nav aria-label="تنقّل الصفحات" className="no-print flex items-center justify-between">
      {page > 1 ? (
        <Link className={linkCls} href={href(page - 1)}>
          السابق
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs tabular-nums text-muted-foreground">صفحة {page}</span>
      {hasMore ? (
        <Link className={linkCls} href={href(page + 1)}>
          التالي
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
