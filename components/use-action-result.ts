"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ActionResult = { error?: string; success?: string };

/**
 * The house mutation-result handler (Phase 4.5 B5). Server actions invoked
 * imperatively (inside useTransition) do NOT re-render the current route on
 * their own — revalidatePath only freshens future navigations. So on success we
 * toast AND router.refresh() so lists/detail/timelines update in place without
 * a manual reload. Returns true on success (callers close their dialog).
 */
export function useActionResult() {
  const router = useRouter();
  return (res: ActionResult): boolean => {
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success(res.success ?? "تم");
    router.refresh();
    return true;
  };
}
