"use client";

import { getMockStandings } from "@/lib/mock/data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LeaguePage() {
  const standings = getMockStandings();

  return (
    <div>
      <h1 className="font-display mb-4 text-lg text-foreground">League</h1>
      <Tabs defaultValue="standings">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="individual">Individual Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="standings">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>GM</TableHead>
                <TableHead className="text-right">W</TableHead>
                <TableHead className="text-right">L</TableHead>
                <TableHead className="text-right">P</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((s, i) => (
                <TableRow key={s.gmId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="text-right">{s.wins}</TableCell>
                  <TableCell className="text-right">{s.losses}</TableCell>
                  <TableCell className="text-right">{s.pushes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="individual">
          <p className="text-sm text-muted-foreground">
            Basic per-player season W-L-push (beta scope). Same underlying data as
            Standings, filtered to one GM. Deeper breakdowns (by team, favorite/dog,
            home/away, time slot) are deferred to full launch.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
