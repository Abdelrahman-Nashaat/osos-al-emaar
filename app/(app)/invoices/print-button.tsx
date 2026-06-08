"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser print dialog (→ save as PDF). Hidden in the printout itself. */
export function PrintButton({ label = "طباعة / PDF" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="no-print"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
