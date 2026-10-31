// Notification payloads cannot send users to external URLs or another portal.
export function claimNotificationLink(
  value: string | null | undefined,
  audience: "staff" | "member",
) {
  if (!value) return null;
  const allowed =
    audience === "staff"
      ? /^\/claims\/[1-9]\d*$/
      : /^\/member\/claims(?:#claim-[1-9]\d*|\/[1-9]\d*\/resubmit)$/;
  const changeRequest =
    audience === "staff"
      ? /^\/change-requests\?request=[1-9]\d*$/
      : /^\/member\/requests#request-[1-9]\d*$/;
  return allowed.test(value) || changeRequest.test(value) ? value : null;
}
