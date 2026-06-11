import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions, getSessionProfile } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permission-keys";

export const dynamic = "force-dynamic";

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Download one task as a calendar event (.ics) — the zero-OAuth answer to
 * «وابغاه يرتبط بالتقويم»: opens directly in Google/Apple/Outlook calendars.
 * Self-authenticated (the /api matcher bypasses the proxy): session + tasks.view,
 * and RLS naturally hides tasks the caller cannot read.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  const perms = await getEffectivePermissions();
  if (!can(perms, "tasks.view")) return new NextResponse("forbidden", { status: 403 });

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return new NextResponse("bad request", { status: 400 });

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, description, due_at, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!task || !task.due_at) return new NextResponse("not found", { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", task.project_id)
    .maybeSingle();

  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dueDate = task.due_at.slice(0, 10).replace(/-/g, "");
  const url = `${request.nextUrl.origin}/tasks/${task.id}`;

  const summary = project?.name ? `${task.title} — ${project.name}` : task.title;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Osos Al-Emaar//Tasks//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:task-${task.id}@osos-al-emaar`,
    `DTSTAMP:${stamp(new Date())}`,
    // All-day event on the due date (dates are what the office tracks).
    `DTSTART;VALUE=DATE:${dueDate}`,
    `SUMMARY:${icsEscape(summary)}`,
    ...(task.description ? [`DESCRIPTION:${icsEscape(task.description)}`] : []),
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT9H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(task.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="task-${task.id.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
