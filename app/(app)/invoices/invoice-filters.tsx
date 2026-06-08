import Link from "next/link";
import { cn } from "@/lib/utils";

export const INVOICE_FILTERS = ["all", "draft", "unpaid", "overdue", "paid", "void"] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

const LABELS: Record<InvoiceFilter, string> = {
  all: "الكل",
  draft: "مسودات",
  unpaid: "غير مدفوعة",
  overdue: "متأخرة",
  paid: "مدفوعة",
  void: "ملغاة",
};

export function parseInvoiceFilter(value: string | undefined): InvoiceFilter {
  return (INVOICE_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as InvoiceFilter)
    : "all";
}

export function InvoiceFilters({
  active,
  counts,
}: {
  active: InvoiceFilter;
  counts: Record<InvoiceFilter, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {INVOICE_FILTERS.map((key) => (
        <Link
          key={key}
          href={key === "all" ? "/invoices" : `/invoices?filter=${key}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            active === key
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {LABELS[key]}
          <span className="tabular-nums text-xs opacity-70">{counts[key]}</span>
        </Link>
      ))}
    </div>
  );
}
