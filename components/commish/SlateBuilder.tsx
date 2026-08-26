"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  getActiveSlateAction,
  addGame,
  checkSpreadEditImpact,
  applySpreadEdit,
  publishWeek,
} from "@/lib/slate/actions";
import type { SlateData, SlateGame } from "@/lib/slate/types";

type LoadState = "loading" | "loaded" | "empty" | "error";

export function SlateBuilder() {
  const [data, setData] = useState<SlateData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [addOpen, setAddOpen] = useState(false);
  const [editGame, setEditGame] = useState<SlateGame | null>(null);
  const [editSpreadValue, setEditSpreadValue] = useState("");
  const [editWarning, setEditWarning] = useState<{ affectedCount: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
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
      setState(slate.games.length === 0 ? "empty" : "loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddGame(formData: FormData) {
    if (!data) return;
    setErrorMessage(null);
    setSaving(true);
    try {
      const kickoffRaw = String(formData.get("kickoff"));
      const kickoffDate = new Date(kickoffRaw);
      if (Number.isNaN(kickoffDate.getTime())) {
        throw new Error("Kickoff time is invalid.");
      }
      await addGame({
        weekId: data.week.id,
        awayTeam: String(formData.get("away")),
        homeTeam: String(formData.get("home")),
        kickoffAt: kickoffDate.toISOString(),
        spread: formData.get("spread") ? Number(formData.get("spread")) : null,
      });
      setAddOpen(false);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't add the game.");
    } finally {
      setSaving(false);
    }
  }

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
      await applySpreadEdit(editGame.id, Number(editSpreadValue));
      setEditGame(null);
      setEditWarning(null);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't save the spread.");
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
              Week {data.week.week_number} slate is empty. Add this week&apos;s matchups to get
              started.
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
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add Game
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled
              title="Automated Odds API pull arrives in Epic 7 — manual entry is the path for now"
            >
              Pull from Odds API
            </Button>
          </div>

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

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Add game</SheetTitle>
          </SheetHeader>
          <form
            action={handleAddGame}
            className="flex flex-col gap-4 px-4"
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="away">Away</Label>
                <Input id="away" name="away" placeholder="NYJ" maxLength={3} required />
              </div>
              <div className="flex-1">
                <Label htmlFor="home">Home</Label>
                <Input id="home" name="home" placeholder="BUF" maxLength={3} required />
              </div>
            </div>
            <div>
              <Label htmlFor="kickoff">Kickoff</Label>
              <Input id="kickoff" name="kickoff" type="datetime-local" required />
            </div>
            <div>
              <Label htmlFor="spread">Spread (home team, optional)</Label>
              <Input id="spread" name="spread" type="number" step="0.5" placeholder="-6.5" />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add game"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editGame !== null && !editWarning && !saving}
        onOpenChange={(open) => !open && setEditGame(null)}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>
              Edit spread — {editGame?.away_team} @ {editGame?.home_team}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div>
              <Label htmlFor="edit-spread">Spread (home team)</Label>
              <Input
                id="edit-spread"
                type="number"
                step="0.5"
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
              picked this game. Changing the spread will clear {editWarning?.affectedCount === 1 ? "that pick" : "those picks"} and notify{" "}
              {editWarning?.affectedCount === 1 ? "them" : "them"} to resubmit before kickoff.
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
