"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
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
import { getActiveSlateAction, checkSpreadEditImpact, applySpreadEdit, publishWeek } from "@/lib/slate/actions";
import type { SlateData, SlateGame } from "@/lib/slate/types";

type LoadState = "loading" | "loaded" | "empty" | "error";

export function SlateBuilder() {
  const [data, setData] = useState<SlateData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [editGame, setEditGame] = useState<SlateGame | null>(null);
  const [editSpreadValue, setEditSpreadValue] = useState("");
  const [editWarning, setEditWarning] = useState<{ affectedCount: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkingEdit, setCheckingEdit] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const slate = await getActiveSlateAction();
      if (!slate) {
        setState("error");
        return;
      }
      setData(slate);
      // Games are seeded from the season schedule ahead of time — an empty games list
      // here means schedule seeding hasn't happened for this week, not "nothing entered
      // yet." That's a data problem to flag, not a normal first-use state.
      setState(slate.games.length === 0 ? "empty" : "loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startEditSpread(game: SlateGame) {
    if (checkingEdit) return; // guards against a double-click firing two concurrent checks
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
      // An emptied field means "no spread set" — must go through as null, not Number("") === 0.
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

  async function handlePublish() {
    if (!data) return;
    setErrorMessage(null);
    setPublishing(true);
    try {
      await publishWeek(data.week.id);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't publish the week.");
    } finally {
      setPublishing(false);
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
          <p className="text-sm text-destructive-foreground">
            Couldn&apos;t load the slate. Check your connection and try again.
          </p>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <p className="text-sm font-medium">Week {data.week.week_number} lines</p>
          <Badge variant={data.week.state === "draft" ? "outline" : "default"}>
            {data.week.state === "draft" ? "Draft" : "Published"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state === "empty" && (
            <p className="text-sm text-muted-foreground">
              No games found for Week {data.week.week_number}. The season schedule may not have
              been seeded yet — this isn&apos;t something to fix by adding games manually, check
              the schedule seed.
            </p>
          )}

          {state === "loaded" &&
            data.games.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={g.status === "final" || checkingEdit}
                onClick={() => startEditSpread(g)}
                className="flex min-h-12 items-center justify-between text-left text-sm disabled:opacity-60"
              >
                <span>
                  {g.away_team} @ {g.home_team}
                </span>
                <span className="text-muted-foreground">{g.spread === null ? "—" : g.spread}</span>
              </button>
            ))}

          {/* CT1: always visible, disabled — a clear future integration point, not hidden. */}
          <Button
            size="sm"
            variant="outline"
            disabled
            className="mt-2 self-start"
            title="Automated Odds API pull arrives in Epic 7 — manual entry is the path for now"
          >
            Pull spreads from Odds API
          </Button>

          {data.week.state === "draft" && state === "loaded" && (
            <Button size="sm" className="self-start" onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish week"}
            </Button>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive-foreground" role="alert">
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
                placeholder="-6.5"
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
