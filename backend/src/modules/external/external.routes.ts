import { Router } from "express";

import { authenticateExternalApiKey } from "../../middleware/authenticate-external-api-key.js";
import { externalApiKeyRateLimiter } from "../../middleware/rate-limit.js";
import { recordAudit } from "../audit/audit.service.js";
import { lookupMemberByControllerId } from "./external.service.js";

export const externalRouter = Router();

externalRouter.use(externalApiKeyRateLimiter);
externalRouter.use(authenticateExternalApiKey);

externalRouter.get("/members/:controllerId", async (request, response) => {
  const { controllerId } = request.params;

  // Length guard, not a format check: rejects a pathologically long path segment before it
  // reaches the DB, with the same generic response as every other failure mode below -- a
  // format check here would let a caller distinguish "malformed" from "not found," which is
  // exactly the enumeration signal this endpoint avoids everywhere else.
  if (controllerId.length > 128) {
    response
      .status(404)
      .json({ success: false, code: "EXTERNAL_MEMBER_NOT_FOUND", message: "Member not found" });
    return;
  }

  const member = await lookupMemberByControllerId(controllerId);
  if (!member) {
    response
      .status(404)
      .json({ success: false, code: "EXTERNAL_MEMBER_NOT_FOUND", message: "Member not found" });
    return;
  }

  await recordAudit({
    request,
    actorEmail: "external-api",
    action: "EXTERNAL_MEMBER_LOOKUP",
    entityType: "MEMBER",
    entityId: member.controllerId,
    description: `External API lookup for member ${member.controllerId}`,
  });

  response.json({ success: true, data: member });
});
