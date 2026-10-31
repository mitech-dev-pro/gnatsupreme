import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";

type Client = Pick<typeof prisma, "memberChangeRequest">;

// Reserve the pending version inside the same transaction as the member changes.
// A competing reviewer or cancellation must win before any member data is written.
export async function reserveChangeReview(
  client: Client,
  item: { id: number; updatedAt: Date },
  actor: AuthenticatedUser,
) {
  const result = await client.memberChangeRequest.updateMany({
    where: {
      id: item.id,
      status: "PENDING",
      updatedAt: item.updatedAt,
      member: { is: memberScope(actor) },
    },
    data: { updatedAt: new Date() },
  });
  if (!result.count)
    throw new AppError(409, "This request changed. Refresh it before reviewing again.");
}
