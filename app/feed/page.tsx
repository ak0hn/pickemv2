"use client";

import { useState } from "react";
import { getMockPosts } from "@/lib/mock/data";
import { WeekSelector } from "@/components/app/WeekSelector";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle } from "lucide-react";

export default function FeedPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const posts = getMockPosts(weekOffset);
  const weekNumber = 13 + weekOffset;

  return (
    <div>
      <WeekSelector
        weekOffset={weekOffset}
        onChange={setWeekOffset}
        label={weekOffset === 0 ? `Week ${weekNumber} · This Week` : `Week ${weekNumber}`}
      />

      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <Card key={post.id}>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{post.author.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{post.author}</p>
                <p className="text-xs text-muted-foreground">
                  {post.postedAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{post.body}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                  <Heart className="h-3.5 w-3.5" /> {post.reactions}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                  <MessageCircle className="h-3.5 w-3.5" /> {post.comments.length}
                </Button>
              </div>
              {post.comments.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {post.comments.map((c, i) => (
                    <p key={i} className="text-xs">
                      <span className="font-medium">{c.author}:</span> {c.body}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
