"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCloseableWeekAction } from "@/lib/slate/actions";
import { computeWeekResults } from "@/lib/results/compute";
import type { WeekResults } from "@/lib/results/types";

type LoadState = "loading" | "empty" | "loaded" | "error";

// PIC-24: read-only preview of this week's results and league standings, decoupled from
// the Close Week action — the commissioner needs this to decide on a tiebreaker and draft
// the close-week message *before* committing to close, not only after (Alex, Aug 30,
// 2026: "end of the current cycle's last game makes results/standings viewable, but the
// official close + week transition always waits on the commissioner's own post"). Reuses
// computeWeekResults (lib/results/compute.ts) directly — never calls week_close(), never
// creates a post, safe to load any number of times. No automated posting of any kind;
// this is purely something the commissioner looks at.
export function ResultsStandingsPreview() {
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
                <span>
                  {g.away} @ {g.home}
                </span>
                <Badge variant={g.winner === "push" ? "outline" : "secondary"}>
                  {g.winner === "push" ? "Push" : g.winner === "home" ? `${g.home} covered` : `${g.away} covered`}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Season Standings</p>
          {data.standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No standings yet.</p>
          ) : (
            <ol className="flex flex-col gap-0.5">
              {data.standings.map((s, i) => (
                <li key={s.rosterId} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <span className="text-muted-foreground">
                    {s.wins}-{s.losses}
                    {s.pushes > 0 ? `-${s.pushes}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
