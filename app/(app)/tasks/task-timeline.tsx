import { TASK_EVENT_LABELS, type TaskEventType, type TaskStatus } from "@/lib/tasks/status";

export type TimelineItem = {
  id: number;
  event_type: TaskEventType;
  created_at: string;
  note: string | null;
  actor_name: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  from_assignee_name: string | null;
  to_assignee_name: string | null;
  progress: number | null;
  label: string | null;
};

// Arabic month names with Latin digits (matches the Latin-digit dates used
// elsewhere in the app, e.g. due dates) and a Gregorian calendar.
const dateFmt = new Intl.DateTimeFormat("ar-u-nu-latn", {
  calendar: "gregory",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Append-only task history (newest first). Operational only — never any amount. */
export function TaskTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">لا يوجد سجل بعد.</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((e) => (
        <li key={e.id} className="relative ps-5">
          <span
            className="absolute start-0 top-1.5 size-2 rounded-full bg-primary"
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{TASK_EVENT_LABELS[e.event_type]}</span>
            {e.actor_name ? (
              <span className="text-xs text-muted-foreground">بواسطة {e.actor_name}</span>
            ) : null}
            <span className="text-xs text-muted-foreground" dir="ltr">
              {dateFmt.format(new Date(e.created_at))}
            </span>
          </div>
          {detail(e) ? <div className="mt-0.5 text-sm">{detail(e)}</div> : null}
          {e.note ? (
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{e.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function detail(e: TimelineItem): string | null {
  switch (e.event_type) {
    case "reassigned":
      return `من ${e.from_assignee_name ?? "—"} إلى ${e.to_assignee_name ?? "—"}`;
    case "assigned":
      return e.to_assignee_name ? `إلى ${e.to_assignee_name}` : null;
    case "progress":
      return e.progress != null ? `أصبحت ${e.progress}%` : null;
    case "milestone":
      return e.label;
    default:
      return null;
  }
}
