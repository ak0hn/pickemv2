"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useDev } from "@/lib/dev/DevProvider";
import { getWeekPhase } from "@/lib/mock/data";
import { getActiveSlateAction, checkSpreadEditImpact, applySpreadEdit } from "@/lib/slate/actions";
import { formatGameDay, formatKickoffTime, formatHomeSpread } from "@/lib/slate/format";
import {
  buildOpenWeekBlock,
  publishWeekWithPost,
  buildCloseWeekBlock,
  closeWeekWithPost,
} from "@/lib/posts/actions";
import { computeWeekResults } from "@/lib/results/compute";
import type { SlateData, SlateGame } from "@/lib/slate/types";
import type { WeekResults } from "@/lib/results/types";

type LoadState = "loading" | "loaded" | "empty" | "error";

// Aug 31, 2026 (Alex's live spot-check, third pass on PIC-24/PR #7): replaces SlateBuilder
// + ResultsStandingsPreview + WeekCloseControl as three separate cards with ONE tile for
// the active week, driven by state rather than component boundaries — having two tiles
// both claiming to be "Week 1" was the actual bug, not just a layout ordering issue.
//
// Four states, cycling in order:
// 1. draft    — matchups visible (full-season schedule is known in advance, no reason to
//               hide it), pull-odds stub + per-game spread editing + inline "open week"
//               message box. Commish's whole focus here is starting the week.
// 2. published — identical matchup display, but no pull-odds button (don't re-pull once
//               live) and no message box (that's tied to opening the week specifically —
//               a separate evergreen "Post to League" card, unaffected, covers any other
//               posting). Only function: edit an individual game's spread.
// 3. complete — this week's regular-slate games are all final, not yet closed. Renders
//               results (spread shown explicitly, not just which side covered), this
//               week's 6/6 winner(s) with click-to-copy, the (mock, dev-only) tiebreaker
//               toggle, and an inline "close week" message box + action.
// 4. closed   — same view as (1), for whatever the "active" week is next. Known
//               limitation: `ACTIVE_WEEK_NUMBER` (lib/slate/queries.ts) is hardcoded to 1 —
//               real week-to-week advancement doesn't exist yet (flagged there already,
//               out of scope here), so this state renders correctly but against the same
//               single active week, not a genuinely different "next" week's data yet.
export function WeekControlTile() {
  const { tiebreakerInvoked, setTiebreakerInvoked, now } = useDev();

  const [data, setData] = useState<SlateData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [results, setResults] = useState<WeekResults | null>(null);

  const [editGame, setEditGame] = useState<SlateGame | null>(null);
  const [editSpreadValue, setEditSpreadValue] = useState("");
  const [editWarning, setEditWarning] = useState<{ affectedCount: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkingEdit, setCheckingEdit] = useState(false);

  const [openWeekMessage, setOpenWeekMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [closeWeekMessage, setCloseWeekMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const slate = await getActiveSlateAction();
      if (!slate) {
        setState("error");
        return;
      }
      setData(slate);

      const nonVoided = slate.games.filter((g) => g.status !== "voided");
      const allFinal = nonVoided.length > 0 && nonVoided.every((g) => g.status === "final");
      if (slate.week.state !== "draft" && slate.week.state !== "closed" && allFinal) {
        setResults(await computeWeekResults(slate.week.id));
      } else {
        setResults(null);
      }

      setState(slate.games.length === 0 ? "empty" : "loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Kept from the original mock scaffold, dev-only — no real data behind this yet. The
  // real trigger is Epic 3's job (PIC-12's own ticket reserved this exact layout slot and
  // explicitly said "render nothing," not even a placeholder). Surfacing it as an obvious
  // dev stand-in (Alex's call, Aug 31, 2026) rather than hiding it, since it's still useful
  // for exercising the reserved layout during dev — but it must not be mistaken for real.
  const mockPhase = getWeekPhase(0, now, tiebreakerInvoked);
  const readyForTiebreaker = mockPhase === "awaiting-tiebreaker" || mockPhase === "tiebreaker-open";

  async function startEditSpread(game: SlateGame) {
    if (checkingEdit) return;
    setErrorMessage(null);
    setCheckingEdit(true);
    try {
      const impact = await checkSpreadEditImpact(game.id);
      setEditGame(game);
      setEditSpreadValue(String(game.spread ?? ""));
      setEditWarning(impact.hasExistingPicks ? { affectedCount: impact.affectedCount } : null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't check this game's picks.");
    } finally {
      setCheckingEdit(false);
    }
  }

  async function confirmEditSpread() {
    if (!editGame) return;
    setSaving(true);
    try {
      const newSpread = editSpreadValue.trim() === "" ? null : Number(editSpreadValue);
      await applySpreadEdit(editGame.id, newSpread);
      setEditGame(null);
      setEditWarning(null);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't save the spread.");
      setEditGame(null);
      setEditWarning(null);
    } finally {
      setSaving(false);
    }
  }

  // Aug 31, 2026: no longer opens the shared Post Composer sheet for this trigger — the
  // message box lives directly on this tile instead, since the slate is already fully
  // visible right above it (Alex's call; this narrows the shared composer's remaining
  // scope to freeform + eventually open_tiebreaker).
  async function handlePublish() {
    // A message is required to open the week — the button is already disabled on an empty
    // message, but guard here too rather than trust the disabled state alone.
    if (!data || openWeekMessage.trim() === "") return;
    setErrorMessage(null);
    setPublishing(true);
    try {
      const block = await buildOpenWeekBlock(data.week.id);
      const result = await publishWeekWithPost({
        weekId: data.week.id,
        message: openWeekMessage,
        block,
        imageUrl: null,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setOpenWeekMessage("");
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't publish the week.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleClose() {
    // Same rule as Open Week — a message is required to close, not silently optional.
    if (!data || closeWeekMessage.trim() === "") return;
    setErrorMessage(null);
    setClosing(true);
    try {
      const block = await buildCloseWeekBlock(data.week.id);
      const result = await closeWeekWithPost({
        weekId: data.week.id,
        message: closeWeekMessage,
        block,
        imageUrl: null,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setCloseWeekMessage("");
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't close the week.");
    } finally {
      setClosing(false);
    }
  }

  async function copyWinners(names: string[]) {
    try {
      await navigator.clipboard.writeText(names.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErrorMessage("Couldn't copy to clipboard — copy the names manually.");
    }
  }

  if (state === "loading") {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-12 items-center justify-between gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col items-start gap-2 pt-6">
          <p className="text-sm text-destructive">
            Couldn&apos;t load the week. Check your connection and try again.
          </p>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isComplete = results !== null;
  const isDraftLike = data.week.state === "draft" || data.week.state === "closed";

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <p className="text-sm font-medium">
            {isComplete
              ? `Week ${results.weekNumber} Results`
              : `Week ${data.week.week_number} lines`}
          </p>
          <Badge variant={isDraftLike ? "outline" : isComplete ? "secondary" : "default"}>
            {isComplete ? "Complete" : isDraftLike ? "Draft" : "Live"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state === "empty" && (
            <p className="text-sm text-muted-foreground">
              No games found for Week {data.week.week_number}. The season schedule may not have
              been seeded yet — this isn&apos;t something to fix by adding games manually, check
              the schedule seed.
            </p>
          )}

          {state === "loaded" && !isComplete && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {data.games.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={g.status === "final" || checkingEdit}
                    onClick={() => startEditSpread(g)}
                    className="flex min-h-12 items-center justify-between gap-2 text-left text-sm disabled:opacity-60"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {formatGameDay(g.kickoff_at)} · {formatKickoffTime(g.kickoff_at)}
                      </span>
                      <span>
                        {g.away_team} @ {g.home_team}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">Home Spread</span>
                      <span>{formatHomeSpread(g.spread)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {isDraftLike && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    {/* CT1: draft/closed only — once live, don't re-pull; edits are manual. */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="self-start"
                      title="Automated Odds API pull arrives in Epic 7 — manual entry is the path for now"
                    >
                      Pull spreads from Odds API
                    </Button>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="open-week-message">Message to open the week</Label>
                      <Textarea
                        id="open-week-message"
                        placeholder="Add a message to this week's slate…"
                        value={openWeekMessage}
                        onChange={(e) => setOpenWeekMessage(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="self-start"
                        onClick={handlePublish}
                        disabled={publishing || openWeekMessage.trim() === ""}
                      >
                        {publishing ? "Publishing…" : "Publish week"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {isComplete && (
            <>
              <p className="text-xs text-muted-foreground">
                Reload to see the latest as games go final — independent of Close Week.
                Nothing here is posted or official until you close the week yourself.
              </p>

              <div className="flex flex-col gap-1.5">
                {results.games
                  .filter((g) => g.winner !== null)
                  .map((g) => (
                    <div key={`${g.away}-${g.home}`} className="flex items-center justify-between text-sm">
                      <div className="flex flex-col">
                        <span>
                          {g.away} @ {g.home}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Home Spread {formatHomeSpread(g.spread)}
                        </span>
                      </div>
                      <Badge variant={g.winner === "push" ? "outline" : "secondary"}>
                        {g.winner === "push"
                          ? "Push"
                          : g.winner === "home"
                            ? `${g.home} covered`
                            : `${g.away} covered`}
                      </Badge>
                    </div>
                  ))}
              </div>

              <Separator />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    This week&apos;s winner{results.weeklyWinners.length === 1 ? "" : "s"}
                  </p>
                  {results.weeklyWinners.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => copyWinners(results.weeklyWinners)}>
                      {copied ? "Copied!" : "Copy names"}
                    </Button>
                  )}
                </div>
                {results.weeklyWinners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No 6/6 winners this week.</p>
                ) : (
                  <p className="text-sm">{results.weeklyWinners.join(", ")}</p>
                )}
              </div>

              <Separator />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm">Invoke tiebreaker for this week</p>
                  <Switch
                    checked={tiebreakerInvoked}
                    disabled={!readyForTiebreaker}
                    onCheckedChange={setTiebreakerInvoked}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Dev-only stand-in — the real trigger is Epic 3&apos;s build, not wired to
                  live data yet.{" "}
                  {readyForTiebreaker
                    ? "Sunday's games are final — you can open this now."
                    : "Available once Sunday's games are final."}
                </p>
                {!tiebreakerInvoked && (
                  <p className="text-xs text-muted-foreground">
                    Not invoked this week — all 6/6 GMs stay co-winners.
                  </p>
                )}
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Label htmlFor="close-week-message">Message to close the week</Label>
                <Textarea
                  id="close-week-message"
                  placeholder={`Add a message to close out Week ${results.weekNumber}…`}
                  value={closeWeekMessage}
                  onChange={(e) => setCloseWeekMessage(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  onClick={handleClose}
                  disabled={closing || closeWeekMessage.trim() === ""}
                >
                  {closing ? "Closing…" : "Close Week"}
                </Button>
              </div>
            </>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={editGame !== null && !editWarning && !saving}
        onOpenChange={(open) => !open && setEditGame(null)}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>
              {editGame?.spread === null ? "Set spread" : "Edit spread"} — {editGame?.away_team} @{" "}
              {editGame?.home_team}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div>
              <Label htmlFor="edit-spread">Spread (home team)</Label>
              <Input
                id="edit-spread"
                type="number"
                step="0.5"
                placeholder="No spread set"
                className="placeholder:italic"
                value={editSpreadValue}
                onChange={(e) => setEditSpreadValue(e.target.value)}
              />
            </div>
            <SheetFooter>
              <Button onClick={confirmEditSpread} disabled={saving}>
                {saving ? "Saving…" : "Save spread"}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={editWarning !== null} onOpenChange={(open) => !open && setEditWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This will clear existing picks</AlertDialogTitle>
            <AlertDialogDescription>
              {editWarning?.affectedCount} GM{editWarning?.affectedCount === 1 ? "" : "s"} already
              picked this game. Changing the spread will clear{" "}
              {editWarning?.affectedCount === 1 ? "that pick" : "those picks"} and notify them to
              resubmit before kickoff.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditGame(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async () => {
                setEditWarning(null);
                await confirmEditSpread();
              }}
            >
              {saving ? "Saving…" : "Confirm — clear picks & save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
