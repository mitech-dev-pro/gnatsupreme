import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import Button from "@/components/ui/Button";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";

const ELEVATED_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN"];

type OrganizationSettings = {
  id: number;
  portalName: string;
  schemeSponsor: string;
  underwriter: string;
  sidebarMark: string;
  primaryColor: string;
  accentColor: string;
  memberIdLabel: string;
  reconciliationSource: string;
  subRegionLabel: string;
  organizationEmail: string | null;
  organizationPhone: string | null;
  address: string | null;
  websiteUrl: string | null;
  privacyNotice: string | null;
  timezone: string;
  currency: string;
  version: number;
  updatedAt: string;
  updatedBy: { id: number; fullName: string; email: string } | null;
};

type SettingsVersion = {
  id: number;
  version: number;
  changedFields: string[];
  createdAt: string;
  changedBy: { id: number; fullName: string } | null;
};

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11px] font-bold text-[#1e2761]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Settings() {
  const { user } = useAuth();
  const canEdit = user ? ELEVATED_ROLES.includes(user.role) : false;

  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<SettingsVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/organization");
      setSettings(res.data.data);
      setForm({
        portalName: res.data.data.portalName,
        schemeSponsor: res.data.data.schemeSponsor,
        underwriter: res.data.data.underwriter,
        sidebarMark: res.data.data.sidebarMark,
        primaryColor: res.data.data.primaryColor,
        accentColor: res.data.data.accentColor,
        memberIdLabel: res.data.data.memberIdLabel,
        reconciliationSource: res.data.data.reconciliationSource,
        subRegionLabel: res.data.data.subRegionLabel,
        organizationEmail: res.data.data.organizationEmail ?? "",
        organizationPhone: res.data.data.organizationPhone ?? "",
        address: res.data.data.address ?? "",
        websiteUrl: res.data.data.websiteUrl ?? "",
        privacyNotice: res.data.data.privacyNotice ?? "",
        timezone: res.data.data.timezone,
        currency: res.data.data.currency,
      });
    } catch {
      setError("Unable to load organization settings.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get("/settings/organization/history", { params: { limit: 10 } });
      setHistory(res.data.data);
    } catch {
      // history is supplementary
    }
  };

  useEffect(() => {
    load();
    if (canEdit) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api.patch("/settings/organization", {
        expectedVersion: settings.version,
        portalName: form.portalName.trim(),
        schemeSponsor: form.schemeSponsor.trim(),
        underwriter: form.underwriter.trim(),
        sidebarMark: form.sidebarMark.trim(),
        primaryColor: form.primaryColor.trim(),
        accentColor: form.accentColor.trim(),
        memberIdLabel: form.memberIdLabel.trim(),
        reconciliationSource: form.reconciliationSource.trim(),
        subRegionLabel: form.subRegionLabel.trim(),
        organizationEmail: form.organizationEmail.trim() || null,
        organizationPhone: form.organizationPhone.trim() || null,
        address: form.address.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        privacyNotice: form.privacyNotice.trim() || null,
        timezone: form.timezone.trim(),
        currency: form.currency.trim(),
      });
      setSuccess("Settings saved.");
      await load();
      await loadHistory();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError(
          "Someone else updated these settings while you were editing. Reloading the latest version.",
        );
        await load();
      } else {
        setError(
          err?.response?.data?.errors
            ?.map((issue: any) => issue.message)
            .join(" ") ||
            err?.response?.data?.message ||
            "Unable to save settings.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!settings) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api.post("/settings/organization/reset", { expectedVersion: settings.version });
      setSuccess("Settings reset to defaults.");
      setConfirmingReset(false);
      await load();
      await loadHistory();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to reset settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-[13px] text-[#5b6472]">Loading…</div>;
  }

  if (!settings) {
    return (
      <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#c23b3b]">
        {error || "Settings could not be loaded."}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1e2761]">
            Organization Settings
          </h1>
          <div className="mt-1 text-[12.5px] text-[#5b6472]">
            Version {settings.version} · last updated{" "}
            {formatDate(settings.updatedAt)}
            {settings.updatedBy ? ` by ${settings.updatedBy.fullName}` : ""}
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="mb-4 rounded-lg bg-[#fbf0dd] px-3 py-2 text-[12.5px] font-semibold text-[#b9791a]">
          You can view these settings, but only Super Admins and National
          Admins can change them.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-[#dff7ee] px-3 py-2 text-[12.5px] font-semibold text-[#17805f]">
          {success}
        </div>
      )}

      <fieldset disabled={!canEdit} className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
              Branding
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClasses}>Portal Name</label>
                <input
                  value={form.portalName}
                  onChange={(e) => updateField("portalName", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Sidebar Mark</label>
                <input
                  value={form.sidebarMark}
                  onChange={(e) => updateField("sidebarMark", e.target.value)}
                  maxLength={3}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Scheme Sponsor</label>
                <input
                  value={form.schemeSponsor}
                  onChange={(e) => updateField("schemeSponsor", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Underwriter</label>
                <input
                  value={form.underwriter}
                  onChange={(e) => updateField("underwriter", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) =>
                      updateField("primaryColor", e.target.value.toUpperCase())
                    }
                    className="h-9 w-9 shrink-0 rounded-[6px] border border-[#e5e9f0]"
                  />
                  <input
                    value={form.primaryColor}
                    onChange={(e) =>
                      updateField("primaryColor", e.target.value.toUpperCase())
                    }
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <label className={labelClasses}>Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    className="h-9 w-9 shrink-0 rounded-[6px] border border-[#e5e9f0]"
                  />
                  <input
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    className={inputClasses}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
              Scheme Terminology
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClasses}>Member ID Label</label>
                <input
                  value={form.memberIdLabel}
                  onChange={(e) => updateField("memberIdLabel", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Sub-Region Label</label>
                <input
                  value={form.subRegionLabel}
                  onChange={(e) => updateField("subRegionLabel", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>
                  Reconciliation Source
                </label>
                <input
                  value={form.reconciliationSource}
                  onChange={(e) =>
                    updateField("reconciliationSource", e.target.value)
                  }
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Currency</label>
                <input
                  value={form.currency}
                  onChange={(e) => updateField("currency", e.target.value.toUpperCase())}
                  maxLength={3}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Timezone</label>
                <input
                  value={form.timezone}
                  onChange={(e) => updateField("timezone", e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
              Contact
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClasses}>Organization Email</label>
                <input
                  type="email"
                  value={form.organizationEmail}
                  onChange={(e) =>
                    updateField("organizationEmail", e.target.value)
                  }
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Organization Phone</label>
                <input
                  value={form.organizationPhone}
                  onChange={(e) =>
                    updateField("organizationPhone", e.target.value)
                  }
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Website URL</label>
                <input
                  value={form.websiteUrl}
                  onChange={(e) => updateField("websiteUrl", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Address</label>
                <input
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClasses}>Privacy Notice</label>
                <textarea
                  value={form.privacyNotice}
                  onChange={(e) => updateField("privacyNotice", e.target.value)}
                  rows={3}
                  className={inputClasses}
                />
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={saving}
                className="rounded-[9px] bg-[#1f9c7c] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <Button variant="danger" onClick={() => setConfirmingReset(true)} disabled={saving}>
                Reset to Defaults
              </Button>
            </div>
          )}
        </form>
      </fieldset>

      {canEdit && confirmingReset && (
        <div className="mt-5">
          <ConfirmationPanel
            title="Reset organization settings?"
            description="This restores every organization setting to its system default. Your current configuration will remain visible in change history."
            confirmLabel="Reset all settings"
            busy={saving}
            onConfirm={() => void handleReset()}
            onCancel={() => setConfirmingReset(false)}
          />
        </div>
      )}

      {canEdit && history.length > 0 && (
        <div className="mt-6 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
            Change History
          </h2>
          <ul className="divide-y divide-[#e5e9f0]">
            {history.map((item) => (
              <li key={item.id} className="py-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#171b26]">
                    Version {item.version}
                  </span>
                  <span className="text-[11px] text-[#5b6472]">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#5b6472]">
                  {item.changedBy?.fullName ?? "System"} changed{" "}
                  {item.changedFields.join(", ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
