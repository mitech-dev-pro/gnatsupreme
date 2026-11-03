export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-lg bg-danger-soft px-2.5 py-2 text-xs font-semibold text-danger">
      {message}
    </div>
  );
}
