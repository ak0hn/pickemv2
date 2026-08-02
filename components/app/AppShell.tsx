"use client";

import { ReactNode } from "react";
import { DevProvider } from "@/lib/dev/DevProvider";
import { DevBar } from "@/lib/dev/DevBar";
import { NavBar } from "@/components/app/NavBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DevProvider>
      <main
        className="mx-auto w-full max-w-3xl flex-1 px-3 pt-4"
        style={{
          paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        {children}
      </main>
      <DevBar />
      <NavBar />
    </DevProvider>
  );
}
