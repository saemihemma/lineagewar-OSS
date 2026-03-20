import { useState, useEffect } from "react";
import { type WarActivationState, DEFAULT_ACTIVATION } from "../lib/war-phases";
import { API_BASE_URL } from "../lib/constants";

export function useWarActivation(): { data: WarActivationState; loading: boolean } {
  const [data, setData] = useState<WarActivationState>(DEFAULT_ACTIVATION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/activation`)
      .then((r) => r.ok ? r.json() : DEFAULT_ACTIVATION)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
