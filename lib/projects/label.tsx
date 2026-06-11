/**
 * Canonical project name⟷code rendering (Phase 4.5 B7). Project codes are often
 * Latin/digit strings (e.g. "C-104") sitting inside RTL text — without bidi
 * isolation the order scrambles. <bdi dir="ltr"> isolates the code the same way
 * invoice numbers are isolated elsewhere.
 */
export function ProjectCode({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return (
    <bdi dir="ltr" className="ms-2 text-xs text-muted-foreground tabular-nums">
      {code}
    </bdi>
  );
}

/** Plain-text variant for contexts that cannot nest elements (e.g. <option>). */
export function projectLabel(name: string, code?: string | null): string {
  return code ? `${name} — ${code}` : name;
}
