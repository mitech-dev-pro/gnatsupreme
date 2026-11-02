import StatusBadge from "@/components/ui/StatusBadge";
import { claimStage, type ClaimStageInput } from "@/lib/claimStatus";

export default function ClaimStageSummary({
  claim,
  audience = "staff",
}: {
  claim: ClaimStageInput;
  audience?: "staff" | "member";
}) {
  const stage = claimStage(claim, { audience });
  return (
    <div className="mb-4" role="status">
      <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
      <p className="mt-2 text-sm text-text-muted">{stage.next}</p>
    </div>
  );
}
