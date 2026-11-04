"use client";
import { useEffect, useState } from "react";
import { useLibrary } from "./library";

/** Fetch on key change. Country/explicit are part of the key so changing Settings refetches. */
export function useData<T>(key: string | null, fn: () => Promise<T>) {
  const { country, explicit } = useLibrary((s) => s.settings);
  const full = key && `${key}|${country}|${explicit}`;
  const [state, setState] = useState<{ key?: string; data?: T; error?: boolean }>({});

  useEffect(() => {
    if (!full) return;
    let live = true;
    fn().then(
      (data) => live && setState({ key: full, data }),
      () => live && setState({ key: full, error: true }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  return state.key === full ? { data: state.data, error: state.error, loading: false } : { loading: !!full };
}
