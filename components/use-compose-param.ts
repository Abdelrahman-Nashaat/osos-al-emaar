"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Auto-opens a "new …" composer when the URL carries `?compose=1`. Powers the
 * manifest app shortcuts and the mobile quick-add FAB, which deep link into the
 * existing create dialogs. Pass `enabled=false` on edit instances so only the
 * create dialog reacts.
 *
 * Fires once per page load (a ref guards re-renders); the open is deferred out of
 * the effect body (react-hooks/set-state-in-effect). We intentionally do NOT
 * rewrite the URL to drop the param: a client router.replace here races the
 * just-settled deep-link navigation and gets reverted, and a raw history edit is
 * restored by the App Router. Leaving `?compose=1` in place only means a manual
 * refresh reopens the composer — acceptable for a "new" deep link.
 */
export function useComposeParam(open: (value: boolean) => void, enabled = true) {
  const params = useSearchParams();
  const active = enabled && params.get("compose") === "1";
  const handled = useRef(false);

  useEffect(() => {
    if (!active || handled.current) return;
    handled.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) open(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, open]);
}
