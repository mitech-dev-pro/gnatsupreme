import StatusBadge from "@/components/ui/StatusBadge";
import api from "@/lib/api";
import { useEffect, useState } from "react";

type ProviderStatus = {
  provider: string;
  mode: string;
  configured: boolean;
  submissionsEnabled: boolean;
};

// Without this, staff only discover the Claims Portal integration is down when a live
// submission or retry fails mid-flow with a 503 -- surface it up front instead.
export default function ClaimsPortalStatus() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/claims/provider", { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setStatus(response.data.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!status) return null;

  return (
    <StatusBadge tone={status.submissionsEnabled ? "success" : "danger"}>
      {status.provider}: {status.submissionsEnabled ? "Connected" : "Not configured"}
    </StatusBadge>
  );
}
