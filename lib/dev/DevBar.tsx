"use client";

import { useDev } from "./DevProvider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wrench } from "lucide-react";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function DevBar() {
  const { now, nowOverride, resetNow, fastForward, persona, setPersonaId, personas } =
    useDev();

  return (
    <div
      className="fixed left-3 z-50"
      style={{
        bottom: "calc(var(--nav-height) + env(safe-area-inset-bottom) + 0.75rem)",
      }}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full opacity-50 shadow-lg transition-opacity hover:opacity-100 focus-visible:opacity-100"
            aria-label="Dev tools"
          >
            <Wrench className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 text-xs">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 font-medium text-foreground">Clock</p>
              <p className="mb-2 font-mono text-muted-foreground">
                {now.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {nowOverride ? " · overridden" : " · real time"}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => fastForward(HOUR)}>
                  +1h
                </Button>
                <Button size="sm" variant="secondary" onClick={() => fastForward(DAY)}>
                  +1d
                </Button>
                <Button size="sm" variant="secondary" onClick={() => fastForward(7 * DAY)}>
                  +1wk
                </Button>
                {nowOverride && (
                  <Button size="sm" variant="ghost" onClick={resetNow}>
                    Reset
                  </Button>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium text-foreground">Viewing as</p>
              <Select value={persona.id} onValueChange={setPersonaId}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.role === "commissioner" ? "(Commish)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
