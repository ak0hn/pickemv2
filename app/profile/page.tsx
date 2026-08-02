"use client";

import { useDev } from "@/lib/dev/DevProvider";
import { getMockStandings } from "@/lib/mock/data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function ProfilePage() {
  const { persona } = useDev();
  const mine = getMockStandings().find((s) => s.gmId === persona.id);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback>{persona.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-display text-foreground">{persona.name}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {persona.role === "commissioner" ? "Commissioner" : "GM"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Season record</p>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div>
            <p className="text-xl font-semibold text-success">{mine?.wins ?? 0}</p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-destructive">{mine?.losses ?? 0}</p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-muted-foreground">
              {mine?.pushes ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Pushes</p>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-4" />
      <p className="text-xs text-muted-foreground">
        Settings (notification preferences, etc.) — placeholder for now.
      </p>
    </div>
  );
}
