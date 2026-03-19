import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AdminDraft, ExecutionRecord } from "./types";
import { ADMIN_UNLOCK_PASSWORD } from "./constants";

const ADMIN_UNLOCK_STORAGE_KEY = "lineage-war-admin-unlocked";

export interface PreviousPhaseSummaryEntry {
  systemId: number;
  pointsPerTick: number;
  takeMargin: number;
  holdMargin: number;
  ruleCount: number;
  sunset: boolean;
  weightSummary: string;
}

interface AdminPortalContextValue {
  draft: AdminDraft | null;
  setDraft: (draft: AdminDraft | null) => void;
  lastExecution: ExecutionRecord | null;
  setLastExecution: (record: ExecutionRecord | null) => void;
  previousPhaseSummary: PreviousPhaseSummaryEntry[] | null;
  setPreviousPhaseSummary: (summary: PreviousPhaseSummaryEntry[] | null) => void;
  selectedAdminCapId: string;
  setSelectedAdminCapId: (id: string) => void;
  isUnlocked: boolean;
  unlockError: string | null;
  unlock: (password: string) => boolean;
  lock: () => void;
}

const AdminPortalContext = createContext<AdminPortalContextValue | null>(null);

export function AdminPortalProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<AdminDraft | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionRecord | null>(null);
  const [previousPhaseSummary, setPreviousPhaseSummary] = useState<PreviousPhaseSummaryEntry[] | null>(null);
  const [selectedAdminCapId, setSelectedAdminCapId] = useState("");
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return ADMIN_UNLOCK_PASSWORD.length === 0;
    }

    if (ADMIN_UNLOCK_PASSWORD.length === 0) {
      return true;
    }

    return window.sessionStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === "true";
  });
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (ADMIN_UNLOCK_PASSWORD.length === 0) {
      window.sessionStorage.removeItem(ADMIN_UNLOCK_STORAGE_KEY);
      setIsUnlocked(true);
      setUnlockError(null);
      return;
    }

    if (isUnlocked) {
      window.sessionStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, "true");
      return;
    }

    window.sessionStorage.removeItem(ADMIN_UNLOCK_STORAGE_KEY);
  }, [isUnlocked]);

  const unlock = (password: string): boolean => {
    if (ADMIN_UNLOCK_PASSWORD.length === 0) {
      setUnlockError(null);
      setIsUnlocked(true);
      return true;
    }

    if (password === ADMIN_UNLOCK_PASSWORD) {
      setUnlockError(null);
      setIsUnlocked(true);
      return true;
    }

    setUnlockError("Incorrect password.");
    setIsUnlocked(false);
    return false;
  };

  const lock = () => {
    setUnlockError(null);
    setIsUnlocked(false);
  };

  const value = useMemo(
    () => ({
      draft,
      setDraft,
      lastExecution,
      setLastExecution,
      previousPhaseSummary,
      setPreviousPhaseSummary,
      selectedAdminCapId,
      setSelectedAdminCapId,
      isUnlocked,
      unlockError,
      unlock,
      lock,
    }),
    [draft, isUnlocked, lastExecution, previousPhaseSummary, selectedAdminCapId, unlockError],
  );

  return <AdminPortalContext.Provider value={value}>{children}</AdminPortalContext.Provider>;
}

export function useAdminPortalState(): AdminPortalContextValue {
  const context = useContext(AdminPortalContext);
  if (!context) {
    throw new Error("useAdminPortalState must be used inside AdminPortalProvider");
  }
  return context;
}
