import api from "@/lib/api";
import type { ClaimDecision } from "./ClaimReviewControls";

export async function reviewClaim(id: number | string, action: ClaimDecision, note: string) {
  await api.patch(`/claims/submissions/${id}/review`, { action, note: note.trim() || null });
}
