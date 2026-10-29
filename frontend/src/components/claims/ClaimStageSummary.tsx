import StatusBadge from "@/components/ui/StatusBadge";
import { claimStage, type ClaimStageInput } from "@/lib/claimStatus";

export default function ClaimStageSummary({ claim }: { claim: ClaimStageInput }) {
  const stage = claimStage(claim);
  return (
    <div className="mb-4" role="status">
      <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
      <p className="mt-2 text-sm text-text-muted">{stage.next}</p>
    </div>
  );
}
