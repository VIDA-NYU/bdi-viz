"use client";

import { useCallback, useEffect, useState } from "react";

let CURRENT_SESSION_NAME = "default";

export const getSessionName = () => CURRENT_SESSION_NAME;

export const setSessionName = (name: string) => {
  CURRENT_SESSION_NAME = name && name.trim() ? name.trim() : "default";
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bdiviz_session_name", CURRENT_SESSION_NAME);
      // Notify other parts of the app in the same tab
      window.dispatchEvent(new Event("bdiviz:session"));
    }
  } catch (_) {}
};

// Initialize from localStorage on module load if available
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("bdiviz_session_name");
    if (saved) CURRENT_SESSION_NAME = saved;
  }
} catch (_) {}


export const useSession = () => {
  const [name, setName] = useState<string>(getSessionName());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (e: StorageEvent) => {
      if (e.key === "bdiviz_session_name") {
        setName(e.newValue || "default");
      }
    };

    const onCustom = () => {
      setName(getSessionName());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("bdiviz:session", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bdiviz:session", onCustom);
    };
  }, []);

  const update = useCallback((newName: string) => {
    setSessionName(newName);
  }, []);

  return [name, update] as const;
};


