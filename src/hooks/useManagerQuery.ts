import { useCallback, useEffect, useState } from "react";
import type { OperationResult } from "../../shared/contracts";
import { unwrap } from "../lib/api";

export function useManagerQuery<T>(loader: () => Promise<OperationResult<T>>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(unwrap(await loader()));
      setError(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load data",
      );
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void reload(), 0);
    const unsubscribe = window.sshManager.events.onChanged(() => void reload());
    return () => {
      window.clearTimeout(initialLoad);
      unsubscribe();
    };
  }, [reload]);

  return { data, loading, error, reload };
}
