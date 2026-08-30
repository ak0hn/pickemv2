"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useDev } from "@/lib/dev/DevProvider";
import { createClient } from "@/lib/supabase/client";
import { getPickTrackerAction, applyPickCorrection } from "@/lib/tracker/actions";
import type { TrackerData, TrackerPick, TrackerRoster } from "@/lib/tracker/types";
import type { SlateGame } from "@/lib/slate/types";
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
  // Tracks whether this is the channel's first successful connect (no refetch needed —
  // load() just ran) vs. a reconnect after a drop (refetch needed — picks submitted
  // during the outage were never delivered and would otherwise stay silently stale once
  // the reconnect banner clears). Ref, not state, so the subscribe callback's closure
  // doesn't need to re-read potentially stale React state.
  const hasConnectedOnceRef = useRef(false);
  // CT6: which cell's correction sheet is open, if any. Always available regardless of
  // lock state — "Commish can manually edit any GM's picks for any week, always
  // available" (Confirmed Mechanics) — no time gating on this, unlike a GM's own
  // self-serve edit window.
  const [correcting, setCorrecting] = useState<{ game: SlateGame; roster: TrackerRoster } | null>(
    null
  );
  const [correctionValue, setCorrectionValue] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    hasConnectedOnceRef.current = false;
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
          // snapshot loaded before anything had been submitted or before it was published.
          setState((s) => (s === "empty-no-picks" || s === "empty-draft" ? "loaded" : s));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Only refetch on a *reconnect* (second-or-later SUBSCRIBED) — the very first
          // connect follows load()'s own fetch, so refetching there would be redundant.
          // A reconnect may have missed events entirely while disconnected, so the banner
          // clearing must not imply the grid is caught up unless it actually re-syncs.
          if (hasConnectedOnceRef.current) load();
          hasConnectedOnceRef.current = true;
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus("reconnecting");
        }
      });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [data, load]);

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

  function openCorrection(game: SlateGame, roster: TrackerRoster) {
    // E4 fix: without this guard, opening a second cell while the first correction's
    // save is still in flight lets that first save's resolution (setCorrecting(null))
    // close the SECOND cell's sheet out from under the commish — the grid buttons are
    // also disabled during saving (belt-and-suspenders) but this guard covers any other
    // path that could call openCorrection mid-save.
    if (saving) return;
    const existing = pickFor(game.id, roster.id);
    setCorrectionError(null);
    setCorrectionValue(existing && existing.pick_status !== "voided" ? existing.pick_value : null);
    setCorrecting({ game, roster });
  }

  async function confirmCorrection() {
    if (!correcting || !correctionValue) return;
    setSaving(true);
    setCorrectionError(null);
    try {
      const result = await applyPickCorrection({
        gameId: correcting.game.id,
        rosterId: correcting.roster.id,
        pickValue: correctionValue,
      });
      if (!result.ok) {
        setCorrectionError(result.error);
        return;
      }
      setCorrecting(null);
      // The Realtime subscription (PIC-14) will also deliver this same update, but not
      // waiting on that round-trip keeps the sheet's own close feeling immediate.
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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

        {/*
          Both scroll axes must live on the SAME element for `sticky` to work: setting
          overflow-x alone (per the CSS spec) computes overflow-y to `auto` too, but
          without a bounded height that axis never actually scrolls, so the browser has
          no scrollport to stick the header against during page scroll — the header would
          silently stop sticking at full-launch's ~101 rows (E4 finding; invisible at
          beta's 5–15 rows since a bare page scroll never got far enough to reveal it).
          max-h-[70vh] + overflow-auto makes this container the real scroll context for
          both axes so sticky top/left resolve against it correctly at any roster size.
        */}
        <div className="max-h-[70vh] overflow-auto">
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
                      disabled={saving}
                      onClick={() => openCorrection(g, r)}
                      title={`Correct ${r.display_name ?? r.email}'s pick`}
                      className={`relative flex h-12 w-12 items-center justify-center text-xs disabled:cursor-not-allowed ${
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

      <Sheet open={correcting !== null} onOpenChange={(open) => !open && setCorrecting(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>
              {correcting?.roster.display_name ?? correcting?.roster.email} —{" "}
              {correcting?.game.away_team} @ {correcting?.game.home_team}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <p className="text-sm text-muted-foreground">
              Current pick:{" "}
              {(() => {
                if (!correcting) return "—";
                const existing = pickFor(correcting.game.id, correcting.roster.id);
                return existing && existing.pick_status !== "voided" && existing.pick_value
                  ? existing.pick_value
                  : "—";
              })()}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving}
                variant={correctionValue === correcting?.game.away_team ? "default" : "outline"}
                className="flex-1"
                onClick={() => setCorrectionValue(correcting?.game.away_team ?? null)}
              >
                {correcting?.game.away_team}
              </Button>
              <Button
                type="button"
                disabled={saving}
                variant={correctionValue === correcting?.game.home_team ? "default" : "outline"}
                className="flex-1"
                onClick={() => setCorrectionValue(correcting?.game.home_team ?? null)}
              >
                {correcting?.game.home_team}
              </Button>
            </div>

            {correctionError && (
              <p className="text-sm text-destructive" role="alert">
                {correctionError}
              </p>
            )}

            <SheetFooter className="flex-col gap-2">
              <Button
                variant="destructive"
                className="w-full"
                disabled={!correctionValue || saving}
                onClick={confirmCorrection}
              >
                {saving ? "Saving…" : "Confirm correction"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full"
                disabled={saving}
                onClick={() => setCorrecting(null)}
              >
                Cancel
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
