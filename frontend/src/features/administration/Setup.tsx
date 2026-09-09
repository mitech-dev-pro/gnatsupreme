import PageHeader from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { BenefitsTab } from "./BenefitsTab";
import { GeographyTab } from "./GeographyTab";
import { EDIT_ROLES, tabButton, VIEW_ROLES } from "./Setup.shared";
export default function Setup() {
  const { user } = useAuth();
  const canEdit = user ? EDIT_ROLES.includes(user.role) : false;
  const canView = user ? VIEW_ROLES.includes(user.role) : false;
  const [tab, setTab] = useState<"geography" | "benefits">("geography");

  if (!canView) {
    return (
      <div className="rounded-xl border border-border-default bg-white p-6 text-sm text-text-muted">
        Setup is available to Regional Admins and above.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Scheme Configuration"
        description="Configure regions, districts, and the benefit plan. Regional Admins can review configuration; National Admins and Super Admins can publish changes."
      />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Setup sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "geography"}
          onClick={() => setTab("geography")}
          className={tabButton(tab === "geography")}
        >
          Regions &amp; Districts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "benefits"}
          onClick={() => setTab("benefits")}
          className={tabButton(tab === "benefits")}
        >
          Benefit Plan
        </button>
      </div>

      {tab === "geography" ? <GeographyTab canEdit={canEdit} /> : <BenefitsTab canEdit={canEdit} />}
    </div>
  );
}
