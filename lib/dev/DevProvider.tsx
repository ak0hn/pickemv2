"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { MOCK_GMS } from "@/lib/mock/data";
import { MockGM } from "@/lib/mock/types";
import { devSignInAs } from "@/lib/dev/dev-auth-actions";
import { isDevEnvironment, devAutoResolveGames, devResetToWeek1Start } from "@/lib/dev/dev-test-data-actions";

interface DevContextValue {
  now: Date;
  nowOverride: boolean;
  setNowOverride: (d: Date) => void;
  resetNow: () => void;
  fastForward: (ms: number) => void;
  persona: MockGM;
  setPersonaId: (id: string) => void;
  personas: MockGM[];
  tiebreakerInvoked: boolean;
  setTiebreakerInvoked: (v: boolean) => void;
  // Defaults false until confirmed — any dev-only affordance gated on this should fail
  // closed (disabled) rather than briefly flash enabled before the check resolves.
  isDev: boolean;
  // Bumped only on a deliberate clock change (never on incidental re-renders), after any
  // due-game auto-resolution has finished — components that display game/week state
  // depend on this (not `now` directly) to know when to refetch.
  clockTick: number;
  // Wipes weeks 1-3 and rewinds the dev clock to the Wednesday before Week 1's earliest
  // kickoff — the one-click "start the simulation over" action.
  resetToWeek1Wednesday: () => Promise<void>;
  // Bumps clockTick with no clock/DB action of its own — lets any dev-tools action that
  // wrote data (seed picks, reset, etc.) tell data-displaying components to refetch,
  // instead of leaving them to say "reload to see it."
  notifyDataChanged: () => void;
}

const DevContext = createContext<DevContextValue | null>(null);

const STORAGE_KEY = "pickemv2-dev-clock-override";
const PERSONA_KEY = "pickemv2-dev-persona";

export function DevProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Date | null>(null);
  const [personaId, setPersonaIdState] = useState<string>(MOCK_GMS[0].id);
  const [tiebreakerInvoked, setTiebreakerInvoked] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    isDevEnvironment()
      .then(setIsDev)
      .catch(() => setIsDev(false));
  }, []);

  useEffect(() => {
    // Hydration-safe read: localStorage doesn't exist on the server, so this must
    // run client-only after mount rather than in a lazy useState initializer.
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setOverride(new Date(saved));
    const savedPersona = window.localStorage.getItem(PERSONA_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedPersona) setPersonaIdState(savedPersona);
  }, []);

  // Every deliberate clock change funnels through here: apply it, persist it, then run the
  // dev-only "did any game just finish" check for the active week before signaling
  // (clockTick) that dependents should refetch — so a reload never lands one tick behind
  // the resolve it was triggered by. Not gated on isDev: the underlying action self-gates
  // via assertDevOnly() and no-ops harmlessly if it's ever called where isDev is false.
  const applyClock = async (d: Date | null) => {
    setOverride(d);
    if (d) {
      window.localStorage.setItem(STORAGE_KEY, d.toISOString());
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    try {
      await devAutoResolveGames((d ?? new Date()).toISOString());
    } catch (err) {
      console.error("Dev auto-resolve failed:", err);
    } finally {
      setClockTick((t) => t + 1);
    }
  };

  const setNowOverride = (d: Date) => {
    void applyClock(d);
  };

  const resetNow = () => {
    void applyClock(null);
  };

  const fastForward = (ms: number) => {
    const base = override ?? new Date();
    setNowOverride(new Date(base.getTime() + ms));
  };

  const resetToWeek1Wednesday = async () => {
    const targetIso = await devResetToWeek1Start();
    await applyClock(new Date(targetIso));
  };

  const notifyDataChanged = () => {
    setClockTick((t) => t + 1);
  };

  const setPersonaId = (id: string) => {
    setPersonaIdState(id);
    window.localStorage.setItem(PERSONA_KEY, id);
  };

  const persona = MOCK_GMS.find((g) => g.id === personaId) ?? MOCK_GMS[0];

  useEffect(() => {
    // Bridges the mock persona switcher to a real Supabase Auth session (dev-only test
    // accounts) so RLS/role checks stay live for any component reading real data.
    // Sep 7, 2026 (Alex's live PIC-32 QA): this used to fire-and-forget with nothing
    // telling already-loaded data (e.g. the feed's reaction summaries) that the signed-in
    // identity underneath it just changed — components kept showing whichever viewer was
    // signed in at their own last fetch, and a reaction toggle would act on THAT stale
    // viewer's row instead of the one now selected. Bumping clockTick only after sign-in
    // actually resolves reuses the same refetch signal WeekControlTile already keys off,
    // and only after the new session is live so a refetch never races the old one.
    devSignInAs(persona.role)
      .then(() => setClockTick((t) => t + 1))
      .catch((err) => {
        console.error("Dev sign-in failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.role]);

  return (
    <DevContext.Provider
      value={{
        now: override ?? new Date(),
        nowOverride: override !== null,
        setNowOverride,
        resetNow,
        fastForward,
        persona,
        setPersonaId,
        personas: MOCK_GMS,
        tiebreakerInvoked,
        setTiebreakerInvoked,
        isDev,
        clockTick,
        resetToWeek1Wednesday,
        notifyDataChanged,
      }}
    >
      {children}
    </DevContext.Provider>
  );
}

export function useDev() {
  const ctx = useContext(DevContext);
  if (!ctx) throw new Error("useDev must be used within DevProvider");
  return ctx;
}
