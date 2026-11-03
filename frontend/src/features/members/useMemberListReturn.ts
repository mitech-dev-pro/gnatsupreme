import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { memberReturnPosition, rememberMemberPosition } from "./memberNavigation";

export function useMemberListReturn(
  userId: number,
  loading: boolean,
  error: string,
  memberIds: number[],
) {
  const location = useLocation(),
    navigation = useNavigationType();
  const path = location.pathname + location.search;
  const hashId = /^#member-([1-9]\d*)$/.exec(location.hash)?.[1];
  const saved = memberReturnPosition(userId, path, hashId ? Number(hashId) : undefined);
  const targetId = hashId ? Number(hashId) : navigation === "POP" ? saved?.memberId : undefined;
  const restored = useRef("");
  const targetPresent = Boolean(targetId && memberIds.includes(targetId));
  useEffect(() => {
    const key = `${location.key}:${path}:${targetId}`;
    if (!targetId || loading || error || !targetPresent || restored.current === key) return;
    let frame = requestAnimationFrame(() => {
      const nodes = document.querySelectorAll<HTMLElement>(`[data-member-row="${targetId}"]`);
      const node = [...nodes].find((item) => item.getClientRects().length > 0);
      if (!node) return;
      restored.current = key;
      // Use the member's offset to compensate for layout changes while details were open.
      const host = node.closest("main");
      if (saved) {
        const top = Math.max(
          0,
          (host?.scrollTop ?? window.scrollY) + node.getBoundingClientRect().top - saved.top,
        );
        if (host) host.scrollTo({ top, behavior: "instant" });
        else window.scrollTo({ top, behavior: "instant" });
        const table = node.closest<HTMLElement>(".members-table-wrap");
        if (table) table.scrollLeft = saved.x;
      } else node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      frame = requestAnimationFrame(() => node.focus({ preventScroll: true }));
    });
    return () => cancelAnimationFrame(frame);
  }, [targetId, targetPresent, loading, error, saved, location.key, path]);
  const remember = (memberId: number) => {
    const node = [
      ...document.querySelectorAll<HTMLElement>(`[data-member-row="${memberId}"]`),
    ].find((item) => item.getClientRects().length > 0);
    rememberMemberPosition(
      userId,
      path,
      memberId,
      node?.closest("main")?.scrollTop ?? window.scrollY,
      node?.getBoundingClientRect().top ?? 0,
      node?.closest<HTMLElement>(".members-table-wrap")?.scrollLeft ?? 0,
    );
  };
  return {
    targetId,
    remember,
    path,
    missing: Boolean(targetId && !loading && !error && !targetPresent),
  };
}
