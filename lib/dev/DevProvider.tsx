"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { MOCK_GMS } from "@/lib/mock/data";
import { MockGM } from "@/lib/mock/types";
import { devSignInAs } from "@/lib/dev/dev-auth-actions";

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
}

const DevContext = createContext<DevContextValue | null>(null);

const STORAGE_KEY = "pickemv2-dev-clock-override";
const PERSONA_KEY = "pickemv2-dev-persona";

export function DevProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Date | null>(null);
  const [personaId, setPersonaIdState] = useState<string>(MOCK_GMS[0].id);
  const [tiebreakerInvoked, setTiebreakerInvoked] = useState(false);

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

  const setNowOverride = (d: Date) => {
    setOverride(d);
    window.localStorage.setItem(STORAGE_KEY, d.toISOString());
  };

  const resetNow = () => {
    setOverride(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const fastForward = (ms: number) => {
    const base = override ?? new Date();
    setNowOverride(new Date(base.getTime() + ms));
  };

  const setPersonaId = (id: string) => {
    setPersonaIdState(id);
    window.localStorage.setItem(PERSONA_KEY, id);
  };

  const persona = MOCK_GMS.find((g) => g.id === personaId) ?? MOCK_GMS[0];

  useEffect(() => {
    // Bridges the mock persona switcher to a real Supabase Auth session (dev-only test
    // accounts) so RLS/role checks stay live for any component reading real data.
    devSignInAs(persona.role).catch((err) => {
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
