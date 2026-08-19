import { useEffect, useState } from "react";
import api from "@/lib/api";

export type District = {
  id: number;
  name: string;
  region: { id: number; name: string };
};

export function useDistricts() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/districts");
        if (!cancelled) setDistricts(res.data.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { districts, loading };
}
