import { useEffect, useState } from "react";
import api from "@/lib/api";

export function useSchools(districtId: string, enabled: boolean) {
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSchools([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get("/members/schools", { params: { districtId: districtId || undefined } });
        if (!cancelled) setSchools(res.data.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [districtId, enabled]);

  return { schools, loading };
}
