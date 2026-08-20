export default function AppLoading({ label = "Restoring your session…" }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-(--app-bg) px-6" role="status" aria-live="polite">
      <div className="w-full max-w-72">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-(--text-strong) text-[13px] font-extrabold text-(--text-on-action)">GS</div>
          <div>
            <div className="text-[13px] font-bold text-(--text-strong)">GNAT Supreme Care</div>
            <div className="mt-0.5 text-[11.5px] text-(--text-muted)">{label}</div>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--skeleton)">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-(--action-primary)" />
        </div>
      </div>
    </div>
  );
}
