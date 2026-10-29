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
  return allowed.test(value) ? value : null;
}
