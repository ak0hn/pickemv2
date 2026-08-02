"use client";

import { useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import {
  getWeekGames,
  getWeekPhase,
  isGameFinal,
  isGameLocked,
  gameWinnerAgainstSpread,
} from "@/lib/mock/data";
import { WeekSelector } from "@/components/app/WeekSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

const SLOT_LABEL: Record<string, string> = {
  TNF: "Thursday Night",
  SUN_EARLY: "Sunday 1:00pm",
  SUN_LATE: "Sunday 4:00pm",
  SNF: "Sunday Night",
  MNF: "Monday Night",
};

export default function PicksPage() {
  const { now, persona, tiebreakerInvoked } = useDev();
  const [weekOffset, setWeekOffset] = useState(0);
  const [picks, setPicks] = useState<Record<string, "home" | "away">>({});
  const [tiebreakerGuess, setTiebreakerGuess] = useState("");

  const games = getWeekGames(weekOffset);
  const regularGames = games.filter((g) => !g.isTiebreaker);
  const mnf = games.find((g) => g.isTiebreaker)!;
  const phase = getWeekPhase(weekOffset, now, tiebreakerInvoked);
  const weekNumber = 13 + weekOffset;

  // Mock eligibility: pretend this persona went 6/6 so the tiebreaker section has something to show.
  const eligibleForTiebreaker = true;

  return (
    <div>
      <WeekSelector
        weekOffset={weekOffset}
        onChange={setWeekOffset}
        label={weekOffset === 0 ? `Week ${weekNumber} · This Week` : `Week ${weekNumber}`}
      />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Viewing as {persona.name}</p>
        <Badge variant="outline" className="capitalize">
          {phase.replace("-", " ")}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {regularGames.map((game) => {
          const locked = isGameLocked(game, now);
          const final = isGameFinal(game, now);
          const winner = final ? gameWinnerAgainstSpread(game) : null;
          const myPick = picks[game.id];

          return (
            <Card key={game.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {SLOT_LABEL[game.slot]} ·{" "}
                    {game.kickoff.toLocaleTimeString("en-US", {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm font-medium">
                    {game.away} @ {game.home}{" "}
                    <span className="text-muted-foreground">
                      ({game.spread > 0 ? "+" : ""}
                      {game.spread})
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {final && winner && (
                    <span className="text-muted-foreground">
                      {winner === "push" ? (
                        <MinusCircle className="h-4 w-4" />
                      ) : myPick === winner ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </span>
                  )}
                  {locked && !final && <Lock className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={myPick === "away" ? "default" : "secondary"}
                      disabled={locked}
                      onClick={() => setPicks((p) => ({ ...p, [game.id]: "away" }))}
                    >
                      {game.away}
                    </Button>
                    <Button
                      size="sm"
                      variant={myPick === "home" ? "default" : "secondary"}
                      disabled={locked}
                      onClick={() => setPicks((p) => ({ ...p, [game.id]: "home" }))}
                    >
                      {game.home}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {phase === "awaiting-tiebreaker" && (
        <>
          <Separator className="my-4" />
          <p className="text-center text-xs text-muted-foreground">
            Sunday&apos;s games are final. Waiting on the commissioner to open the Monday
            night tiebreaker for this week&apos;s 6/6 group.
          </p>
        </>
      )}

      {phase === "tiebreaker-open" && eligibleForTiebreaker && (
        <>
          <Separator className="my-4" />
          <Card className="border-primary/40">
            <CardContent className="py-4">
              <p className="mb-1 text-sm font-medium">Monday Night Tiebreaker</p>
              <p className="mb-3 text-xs text-muted-foreground">
                You went 6/6 this week — guess the combined final score of{" "}
                {mnf.away} @ {mnf.home}.
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={tiebreakerGuess}
                  onChange={(e) => setTiebreakerGuess(e.target.value)}
                  placeholder="e.g. 47"
                  className="w-24"
                />
                <Button size="sm">Submit guess</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {phase === "week-complete" && (
        <>
          <Separator className="my-4" />
          <p className="text-center text-xs text-muted-foreground">
            Week {weekNumber} is complete. Check League for updated standings.
          </p>
        </>
      )}
    </div>
  );
}
