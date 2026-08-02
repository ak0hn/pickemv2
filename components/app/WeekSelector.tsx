"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function WeekSelector({
  weekOffset,
  onChange,
  label,
}: {
  weekOffset: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onChange(weekOffset - 1)}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="font-display text-sm text-foreground">{label}</span>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onChange(weekOffset + 1)}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
