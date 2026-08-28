"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDev } from "@/lib/dev/DevProvider";
import { cn } from "@/lib/utils";
import { Newspaper, ListChecks, User, Trophy, Shield } from "lucide-react";

const NAV_ITEMS = [
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/picks", label: "Picks", icon: ListChecks },
  { href: "/league", label: "League", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/commish", label: "Commish", icon: Shield, commishOnly: true },
];

export function NavBar() {
  const pathname = usePathname();
  const { persona } = useDev();
  const items = NAV_ITEMS.filter((i) => !i.commishOnly || persona.role === "commissioner");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="mx-auto flex max-w-3xl items-stretch justify-around"
        style={{ height: "var(--nav-height)" }}
      >
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                // text-primary matched --surface exactly after the navy re-theme, making
                // the active tab's own text invisible against the nav bar's background.
                // text-foreground (white) is the highest-contrast option in the palette;
                // the pill behind the icon gives a second, color-independent selection cue.
                active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  active && "bg-foreground/15"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
