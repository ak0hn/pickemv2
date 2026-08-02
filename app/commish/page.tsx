"use client";

import { useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { getWeekGames, getWeekPhase } from "@/lib/mock/data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function CommishPage() {
  const { now, persona, tiebreakerInvoked, setTiebreakerInvoked } = useDev();
  const [weekOffset] = useState(0);
  const games = getWeekGames(weekOffset);
  const phase = getWeekPhase(weekOffset, now, tiebreakerInvoked);
  const weekNumber = 13 + weekOffset;

  if (persona.role !== "commissioner") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Commish Tools isn&apos;t visible to this persona. Switch to a commissioner
          account in the dev bar below to view it.
        </p>
      </div>
    );
  }

  const readyForTiebreaker = phase === "awaiting-tiebreaker" || phase === "tiebreaker-open";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg text-foreground">Commish Tools</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <p className="text-sm font-medium">Week {weekNumber} lines</p>
          <Badge variant="outline">{games.length} games</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {games.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm">
              <span>
                {g.away} @ {g.home}
              </span>
              <span className="text-muted-foreground">{g.spread}</span>
            </div>
          ))}
          <Button size="sm" variant="secondary" className="mt-2 self-start">
            Edit lines
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Post to Feed</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea placeholder="Week open announcement, mid-week update..." />
          <Button size="sm" className="self-start">
            Post
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Monday Night Tiebreaker</p>
        </CardHeader>
        <CardContent>
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
            <p className="mt-2 text-xs text-muted-foreground">
              Not invoked this week — all 6/6 GMs stay co-winners.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Pick tracker &amp; exceptions</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Placeholder — per-GM submission status and manual override entry point
            (Epic 1 build).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
