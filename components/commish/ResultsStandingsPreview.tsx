"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useDev } from "@/lib/dev/DevProvider";
import { getWeekPhase } from "@/lib/mock/data";
import { getCloseableWeekAction } from "@/lib/slate/actions";
import { computeWeekResults } from "@/lib/results/compute";
import { formatHomeSpread } from "@/lib/slate/format";
import { WeekCloseControl } from "@/components/commish/WeekCloseControl";
import type { WeekResults } from "@/lib/results/types";

type LoadState = "loading" | "empty" | "loaded" | "error";

// PIC-24: read-only preview of this week's results, decoupled from the Close Week action —
// the commissioner needs this to decide on a tiebreaker and draft the close-week message
// *before* committing to close, not only after (Alex, Aug 30, 2026: "end of the current
// cycle's last game makes results/standings viewable, but the official close + week
// transition always waits on the commissioner's own post"). Reuses computeWeekResults
// (lib/results/compute.ts) directly — never calls week_close(), never creates a post, safe
// to load any number of times. No automated posting of any kind; this is purely something
// the commissioner looks at.
//
// Revised Aug 31, 2026 (Alex's live spot-check on PR #7): season standings removed from
// this card — that's the League page's job (PIC-27), not a per-week commish tool. The
// Monday Night Tiebreaker toggle and the Close Week action now render inside this same
// card, below the results, instead of as separate cards further down the page — "that's
// the object you're closing." Each result row now also shows the actual spread, not just
// which side covered, so the commish can sanity-check the call against a real number.
export function ResultsStandingsPreview() {
  const { now, tiebreakerInvoked, setTiebreakerInvoked } = useDev();
  const phase = getWeekPhase(0, now, tiebreakerInvoked);
  const readyForTiebreaker = phase === "awaiting-tiebreaker" || phase === "tiebreaker-open";
  const [results, setResults] = useState<WeekResults | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const week = await getCloseableWeekAction();
      // No active week yet, or the slate hasn't been published — nothing meaningful to
      // preview. Same "nothing to render yet" convention as WeekCloseControl.
      if (!week || week.state === "draft") {
        setState("empty");
        return;
      }
      const data = await computeWeekResults(week.id);
      setResults(data);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") {
    return (
      <Card>
        <CardHeader>
          <p className="text-sm font-medium">This Week&apos;s Results</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (state === "empty") return null;

  if (state === "error") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive" role="alert">
            Couldn&apos;t load this week&apos;s results. Check your connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Defensive: state === "loaded" only ever gets set right after results are set (see
  // load() above), but guard rather than assert non-null — a future edit that inserts an
  // await between those two setState calls would otherwise silently render this branch
  // with results still null (E4 second-pass finding).
  if (!results) return null;
  const data = results;
  const finalGames = data.games.filter((g) => g.winner !== null);

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">This Week&apos;s Results — Week {data.weekNumber}</p>
        <p className="text-xs text-muted-foreground">
          Reload to see the latest as games go final — independent of Close Week. Nothing
          here is posted or official until you close the week yourself.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {finalGames.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games final yet this week.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {finalGames.map((g) => (
              <div key={`${g.away}-${g.home}`} className="flex items-center justify-between text-sm">
                <div className="flex flex-col">
                  <span>
                    {g.away} @ {g.home}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatHomeSpread(g.spread)}</span>
                </div>
                <Badge variant={g.winner === "push" ? "outline" : "secondary"}>
                  {g.winner === "push" ? "Push" : g.winner === "home" ? `${g.home} covered` : `${g.away} covered`}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Invoke tiebreaker for this week</p>
            <p className="text-xs text-muted-foreground">
              {readyForTiebreaker
                ? "Sunday's games are final — you can open this now."
                : "Available once Sunday's games are final."}
            </p>
          </div>
          <Switch
            checked={tiebreakerInvoked}
            disabled={!readyForTiebreaker}
            onCheckedChange={setTiebreakerInvoked}
          />
        </div>
        {!tiebreakerInvoked && phase === "week-complete" && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Not invoked this week — all 6/6 GMs stay co-winners.
          </p>
        )}

        <WeekCloseControl />
      </CardContent>
    </Card>
  );
}
