/** Role-safe push payload. The notification row already respects role scoping
 * (financial rows exist only for finance recipients), so its title/body are
 * safe to send to the row's owner. We forward ONLY these fields. */
export function buildPushPayload(n: {
  title: string;
  body: string | null;
  href: string | null;
  type: string;
}): string {
  return JSON.stringify({
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? "/dashboard",
    tag: n.type,
  });
}

/** Push services return 404/410 for a subscription that no longer exists. */
export function isStaleStatus(status: number): boolean {
  return status === 404 || status === 410;
}
