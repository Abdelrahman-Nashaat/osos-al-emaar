"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setProjectProgress } from "./actions";
import { useActionResult } from "@/components/use-action-result";
import { ProgressBar } from "./progress-bar";
import { Button } from "@/components/ui/button";

/**
 * Inline «نسبة الإنجاز» control for project members (and editors). Slider +
 * quick steps; the server action forwards to project_set_progress (DEFINER)
 * which re-checks membership/authority. Read-only viewers get the bar only.
 */
export function ProgressEditor({
  projectId,
  value,
  canEdit,
}: {
  projectId: string;
  value: number;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const onResult = useActionResult();

  if (!canEdit) return <ProgressBar value={value} />;

  const dirty = draft !== value;
  const save = () =>
    startTransition(async () => {
      onResult(await setProjectProgress(projectId, draft));
    });

  return (
    <div className="space-y-2">
      <ProgressBar value={draft} />
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          aria-label="نسبة الإنجاز"
          className="h-2 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-12 text-end text-sm tabular-nums">{draft}%</span>
        <Button
          type="button"
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || pending}
          onClick={save}
        >
          <Check className="size-4" />
          حفظ
        </Button>
      </div>
    </div>
  );
}
