"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDev } from "@/lib/dev/DevProvider";
import { createClient } from "@/lib/supabase/client";
import { getPickTrackerAction } from "@/lib/tracker/actions";
import type { TrackerData, TrackerPick } from "@/lib/tracker/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type LoadState = "loading" | "loaded" | "empty-draft" | "empty-no-picks" | "error";
type RealtimeStatus = "connecting" | "connected" | "reconnecting";

function pickKey(gameId: string, rosterId: string) {
  return `${gameId}:${rosterId}`;
}

// CT5: pick tracker grid. Frozen 80px name column + horizontally scrollable 48px game
// columns — same layout unchanged from beta (5–15 GMs) through full-launch (101 GMs),
// per the Design System spec; only the number of rows/columns changes.
export function PickTracker() {
  const { now } = useDev();
  const [data, setData] = useState<TrackerData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  // Live pick updates land here, keyed by "gameId:rosterId" — merged over the initial
  // snapshot's picks rather than replacing them, so a dropped/late event never regresses
  // a cell that's already correct.
  const [liveOverrides, setLiveOverrides] = useState<Map<string, TrackerPick>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const tracker = await getPickTrackerAction();
      if (!tracker) {
        setState("error");
        return;
      }
      setData(tracker);
      setLiveOverrides(new Map());
      if (tracker.week.state === "draft") {
        setState("empty-draft");
      } else if (tracker.picks.length === 0) {
        setState("empty-no-picks");
      } else {
        setState("loaded");
      }
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription: no per-game filter (postgres_changes filters only support a
  // single equality, not "game_id in (...)"), so this subscribes to all picks table
  // changes and filters client-side against this week's game ids. Not a privacy concern —
  // RLS (picks_select_own_or_commissioner) already scopes the payload to what a
  // commissioner can see before it ever reaches this client.
  useEffect(() => {
    if (!data) return;
    const weekGameIds = new Set(data.games.map((g) => g.id));
    const supabase = createClient();
    const channel = supabase
      .channel(`picks-tracker-${data.week.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picks" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { game_id: string; roster_id: string; pick_value: string | null; pick_status: TrackerPick["pick_status"] }
            | undefined;
          if (!row || !weekGameIds.has(row.game_id)) return;
          setLiveOverrides((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(pickKey(row.game_id, row.roster_id));
            } else {
              next.set(pickKey(row.game_id, row.roster_id), {
                game_id: row.game_id,
                roster_id: row.roster_id,
                pick_value: row.pick_value,
                pick_status: row.pick_status,
              });
            }
            return next;
          });
          // A live event proves the tracker has real data now, even if the initial
          // snapshot loaded before anything had been submitted.
          setState((s) => (s === "empty-no-picks" ? "loaded" : s));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus("reconnecting");
        }
      });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [data]);

  if (state === "loading") {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-1" style={{ gridTemplateColumns: "80px repeat(6, 48px)" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`h-${i}`} className="h-8 w-10 justify-self-center" style={{ gridColumn: i + 2 }} />
            ))}
            {Array.from({ length: 4 }).map((_, row) => (
              <Fragment key={row}>
                <Skeleton className="h-8 w-16" style={{ gridColumn: 1, gridRow: row + 2 }} />
                {Array.from({ length: 6 }).map((_, col) => (
                  <Skeleton
                    key={col}
                    className="h-8 w-10 justify-self-center"
                    style={{ gridColumn: col + 2, gridRow: row + 2 }}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <p className="text-sm font-medium">Pick tracker</p>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">
            Couldn&apos;t load the pick tracker. Check your connection and try again.
          </p>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "empty-draft") {
    return (
      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Pick tracker</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Week {data?.week.week_number} hasn&apos;t been published yet — the tracker starts
            once the slate is live and GMs can submit picks.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state === "empty-no-picks") {
    return (
      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Pick tracker</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Week {data?.week.week_number} is live, but no picks have come in yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isLocked = (kickoffAt: string, status: string) =>
    status !== "voided" && now.getTime() >= new Date(kickoffAt).getTime();

  const pickFor = (gameId: string, rosterId: string): TrackerPick | undefined =>
    liveOverrides.get(pickKey(gameId, rosterId)) ??
    data.picks.find((p) => p.game_id === gameId && p.roster_id === rosterId);

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">Pick tracker</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {realtimeStatus === "reconnecting" && (
          <p
            role="status"
            className="rounded-md bg-warning px-2 py-1 text-xs text-warning-foreground"
          >
            Live updates paused — reconnecting…
          </p>
        )}

        <div className="overflow-x-auto">
          <div
            className="grid w-max"
            style={{ gridTemplateColumns: `80px repeat(${data.games.length}, 48px)` }}
          >
            {/* Sticky top-left corner */}
            <div className="sticky top-0 left-0 z-20 h-12 bg-card" />

            {data.games.map((g) => {
              const locked = isLocked(g.kickoff_at, g.status);
              return (
                <div
                  key={g.id}
                  className="sticky top-0 z-10 flex h-12 flex-col items-center justify-center bg-card px-0.5 text-center"
                >
                  <span className="text-[10px] leading-tight">{g.away_team}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">@{g.home_team}</span>
                  {locked && <Lock className="mt-0.5 h-2.5 w-2.5 text-muted-foreground" aria-label="Locked" />}
                </div>
              );
            })}

            {data.roster.map((r) => (
              <Fragment key={r.id}>
                <div
                  className="sticky left-0 z-10 flex h-12 w-20 items-center truncate bg-card pr-2 text-sm"
                  title={r.display_name ?? r.email}
                >
                  {r.display_name ?? r.email}
                </div>
                {data.games.map((g) => {
                  const locked = isLocked(g.kickoff_at, g.status);
                  const pick = pickFor(g.id, r.id);
                  const hasValue = pick && pick.pick_status !== "voided" && pick.pick_value;
                  return (
                    <button
                      key={`${g.id}-${r.id}`}
                      type="button"
                      disabled
                      title="Pick correction arrives in PIC-15"
                      className={`relative flex h-12 w-12 items-center justify-center text-xs disabled:cursor-default ${
                        locked ? "bg-muted" : ""
                      }`}
                    >
                      {hasValue ? pick!.pick_value : "–"}
                      {locked && (
                        <Lock className="absolute right-0.5 top-0.5 h-2 w-2 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
