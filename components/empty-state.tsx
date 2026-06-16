import type { LucideIcon } from "lucide-react";

/**
 * Shared empty-state for lists — one consistent look across projects, clients,
 * tasks, offers, and invoices (they each had a slightly different ad-hoc line).
 * Icon is decorative; the title carries the meaning for screen readers.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      {Icon ? (
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="size-6" aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
