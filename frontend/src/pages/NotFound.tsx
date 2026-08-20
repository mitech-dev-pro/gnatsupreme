import { Link } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader";

export default function NotFound() {
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Page not found" title="This location does not exist" description="The link may be outdated, or the page may have moved." />
      <Link to="/" className="inline-flex min-h-10 items-center rounded-[9px] bg-(--action-primary) px-4 py-2 text-[12.5px] font-bold text-(--text-on-action) hover:bg-(--action-primary-hover) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">Return to dashboard</Link>
    </div>
  );
}
