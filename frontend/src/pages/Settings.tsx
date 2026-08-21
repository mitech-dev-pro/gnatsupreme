import { useEffect, useMemo, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import Button from "@/components/ui/Button";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import { CURRENCIES } from "@/lib/currency";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";

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
  snapshot?: Record<string, unknown>;
};

const TIMEZONES = ["Africa/Accra", "Africa/Abidjan", "Africa/Lagos", "Africa/Nairobi", "Europe/London", "UTC"];
const DEFAULT_BRAND_COLORS = { primaryColor: "#102A43", accentColor: "#00A896" };
const FIELD_LABELS: Record<string, string> = {
  portalName: "Portal name", schemeSponsor: "Scheme sponsor", underwriter: "Underwriter", sidebarMark: "Sidebar mark",
  primaryColor: "Primary color", accentColor: "Accent color", memberIdLabel: "Member ID label", reconciliationSource: "Reconciliation source",
  subRegionLabel: "Sub-region label", organizationEmail: "Organization email", organizationPhone: "Organization phone", address: "Address",
  websiteUrl: "Website URL", privacyNotice: "Privacy notice", timezone: "Timezone", currency: "Currency",
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

function contrastWithWhite(hex: string) {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) return 0;
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05);
}

export default function Settings() {
  const { user } = useAuth();
  const { refresh: refreshPublicSettings } = useOrganizationSettings();
  const canEdit = user ? ELEVATED_ROLES.includes(user.role) : false;

  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [savedForm, setSavedForm] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<SettingsVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/organization");
      setSettings(res.data.data);
      const nextForm = {
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
      };
      setForm(nextForm);
      setSavedForm(nextForm);
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

  const changedFields = useMemo(
    () => Object.keys(form).filter((key) => form[key] !== savedForm[key]),
    [form, savedForm],
  );
  const isDirty = changedFields.length > 0;
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (form.portalName?.trim().length < 2) errors.portalName = "Enter at least 2 characters.";
    if (!/^[A-Z0-9]{1,3}$/.test(form.sidebarMark || "")) errors.sidebarMark = "Use 1 to 3 letters or numbers.";
    if (!/^#[0-9A-F]{6}$/.test(form.primaryColor || "")) errors.primaryColor = "Enter a 6-digit hex color.";
    if (!/^#[0-9A-F]{6}$/.test(form.accentColor || "")) errors.accentColor = "Enter a 6-digit hex color.";
    if (form.organizationEmail && !/^\S+@\S+\.\S+$/.test(form.organizationEmail)) errors.organizationEmail = "Enter a valid email address.";
    if (form.websiteUrl) { try { new URL(form.websiteUrl); } catch { errors.websiteUrl = "Enter a complete URL, including https://"; } }
    return errors;
  }, [form]);
  const primaryContrast = contrastWithWhite(form.primaryColor || "");
  const accentContrast = contrastWithWhite(form.accentColor || "");

  useEffect(() => {
    if (!isDirty) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [isDirty]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings || !isDirty || Object.keys(fieldErrors).length > 0) return;
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
      await refreshPublicSettings();
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
      await refreshPublicSettings();
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

      <nav aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto rounded-[10px] border border-[#e5e9f0] bg-white p-1">
        {[["branding", "Identity"], ["terminology", "Terminology"], ["contact", "Contact"], ["history", "History"]].map(([target, label]) => (
          <a key={target} href={`#${target}`} className="shrink-0 rounded-[7px] px-3 py-2 text-[12px] font-semibold text-[#1e2761] no-underline hover:bg-[#f4f6fa] focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee]">{label}</a>
        ))}
      </nav>

      <fieldset disabled={!canEdit} className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section id="branding" className="scroll-mt-5 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-[#1e2761]">Branding</h2>
              {canEdit && (
                <button
                  type="button"
                  disabled={form.primaryColor === DEFAULT_BRAND_COLORS.primaryColor && form.accentColor === DEFAULT_BRAND_COLORS.accentColor}
                  onClick={() => setForm((current) => ({ ...current, ...DEFAULT_BRAND_COLORS }))}
                  className="rounded-[8px] border border-[#e5e9f0] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#1e2761] transition hover:bg-[#f4f6fa] focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Restore default colors
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="overflow-hidden rounded-[10px] border border-[#e5e9f0] sm:col-span-2" aria-label="Brand preview">
                <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: form.primaryColor }}>
                  <span className="flex size-9 items-center justify-center rounded-[8px] bg-white text-[12px] font-extrabold" style={{ color: form.primaryColor }}>{form.sidebarMark || "?"}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{form.portalName || "Portal name"}</strong><small className="text-white/70">Sponsored by {form.schemeSponsor || "Organization"}</small></span>
                  <span className="rounded-[8px] px-3 py-2 text-[11px] font-bold text-white" style={{ backgroundColor: form.accentColor }}>Primary action</span>
                </div>
                <div className="flex flex-wrap gap-3 px-4 py-2 text-[10.5px] text-[#5b6472]">
                  <span>Primary contrast: <strong className={primaryContrast >= 4.5 ? "text-[#17805f]" : "text-[#c23b3b]"}>{primaryContrast.toFixed(1)}:1 {primaryContrast >= 4.5 ? "Passes AA" : "Fails AA"}</strong></span>
                  <span>Accent contrast: <strong className={accentContrast >= 4.5 ? "text-[#17805f]" : "text-[#c23b3b]"}>{accentContrast.toFixed(1)}:1 {accentContrast >= 4.5 ? "Passes AA" : "Fails AA"}</strong></span>
                </div>
              </div>
              <div>
                <label htmlFor="settings-portal-name" className={labelClasses}>Portal Name</label>
                <input
                  id="settings-portal-name"
                  value={form.portalName}
                  onChange={(e) => updateField("portalName", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.portalName)}
                  className={inputClasses}
                />
                {fieldErrors.portalName && <p className="mt-1 text-[11px] text-[#c23b3b]">{fieldErrors.portalName}</p>}
              </div>
              <div>
                <label htmlFor="settings-sidebar-mark" className={labelClasses}>Sidebar Mark</label>
                <input
                  id="settings-sidebar-mark"
                  value={form.sidebarMark}
                  onChange={(e) => updateField("sidebarMark", e.target.value)}
                  maxLength={3}
                  aria-invalid={Boolean(fieldErrors.sidebarMark)}
                  className={inputClasses}
                />
                <p className={`mt-1 text-[10.5px] ${fieldErrors.sidebarMark ? "text-[#c23b3b]" : "text-[#5b6472]"}`}>{fieldErrors.sidebarMark || `${form.sidebarMark.length}/3 characters`}</p>
              </div>
              <div>
                <label htmlFor="settings-scheme-sponsor" className={labelClasses}>Scheme Sponsor</label>
                <input
                  id="settings-scheme-sponsor"
                  value={form.schemeSponsor}
                  onChange={(e) => updateField("schemeSponsor", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-underwriter" className={labelClasses}>Underwriter</label>
                <input
                  id="settings-underwriter"
                  value={form.underwriter}
                  onChange={(e) => updateField("underwriter", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-primary-color" className={labelClasses}>Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Choose primary color"
                    value={form.primaryColor}
                    onChange={(e) =>
                      updateField("primaryColor", e.target.value.toUpperCase())
                    }
                    className="h-9 w-9 shrink-0 rounded-[6px] border border-[#e5e9f0]"
                  />
                  <input
                    id="settings-primary-color"
                    value={form.primaryColor}
                    onChange={(e) =>
                      updateField("primaryColor", e.target.value.toUpperCase())
                    }
                    aria-invalid={Boolean(fieldErrors.primaryColor)}
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="settings-accent-color" className={labelClasses}>Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Choose accent color"
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    className="h-9 w-9 shrink-0 rounded-[6px] border border-[#e5e9f0]"
                  />
                  <input
                    id="settings-accent-color"
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    aria-invalid={Boolean(fieldErrors.accentColor)}
                    className={inputClasses}
                  />
                </div>
              </div>
            </div>
          </section>

          <section id="terminology" className="scroll-mt-5 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
              Scheme Terminology
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-member-id-label" className={labelClasses}>Member ID Label</label>
                <input
                  id="settings-member-id-label"
                  value={form.memberIdLabel}
                  onChange={(e) => updateField("memberIdLabel", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-sub-region-label" className={labelClasses}>Sub-Region Label</label>
                <input
                  id="settings-sub-region-label"
                  value={form.subRegionLabel}
                  onChange={(e) => updateField("subRegionLabel", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-reconciliation-source" className={labelClasses}>
                  Reconciliation Source
                </label>
                <input
                  id="settings-reconciliation-source"
                  value={form.reconciliationSource}
                  onChange={(e) =>
                    updateField("reconciliationSource", e.target.value)
                  }
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-currency" className={labelClasses}>Currency</label>
                <select
                  id="settings-currency"
                  value={form.currency}
                  onChange={(e) => updateField("currency", e.target.value.toUpperCase())}
                  className={inputClasses}
                >
                  {CURRENCIES.map((currency) => <option key={currency.value} value={currency.value}>{currency.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="settings-timezone" className={labelClasses}>Timezone</label>
                <select
                  id="settings-timezone"
                  value={form.timezone}
                  onChange={(e) => updateField("timezone", e.target.value)}
                  className={inputClasses}
                >
                  {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section id="contact" className="scroll-mt-5 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
              Contact
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-organization-email" className={labelClasses}>Organization Email</label>
                <input
                  id="settings-organization-email"
                  type="email"
                  value={form.organizationEmail}
                  onChange={(e) =>
                    updateField("organizationEmail", e.target.value)
                  }
                  aria-invalid={Boolean(fieldErrors.organizationEmail)}
                  className={inputClasses}
                />
                {fieldErrors.organizationEmail && <p className="mt-1 text-[11px] text-[#c23b3b]">{fieldErrors.organizationEmail}</p>}
              </div>
              <div>
                <label htmlFor="settings-organization-phone" className={labelClasses}>Organization Phone</label>
                <input
                  id="settings-organization-phone"
                  value={form.organizationPhone}
                  onChange={(e) =>
                    updateField("organizationPhone", e.target.value)
                  }
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="settings-website-url" className={labelClasses}>Website URL</label>
                <input
                  id="settings-website-url"
                  value={form.websiteUrl}
                  onChange={(e) => updateField("websiteUrl", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.websiteUrl)}
                  className={inputClasses}
                />
                {fieldErrors.websiteUrl && <p className="mt-1 text-[11px] text-[#c23b3b]">{fieldErrors.websiteUrl}</p>}
              </div>
              <div>
                <label htmlFor="settings-address" className={labelClasses}>Address</label>
                <input
                  id="settings-address"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="settings-privacy-notice" className={labelClasses}>Privacy Notice</label>
                <textarea
                  id="settings-privacy-notice"
                  value={form.privacyNotice}
                  onChange={(e) => updateField("privacyNotice", e.target.value)}
                  rows={3}
                  className={inputClasses}
                />
              </div>
            </div>
          </section>

          {canEdit && (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-[#dfe4ec] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(30,39,97,0.12)]">
              <button
                type="submit"
                disabled={saving || !isDirty || Object.keys(fieldErrors).length > 0}
                className="rounded-[9px] bg-[#1f9c7c] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" onClick={() => { setForm(savedForm); setError(""); setSuccess(""); }} disabled={saving || !isDirty} className="rounded-[9px] border border-[#e5e9f0] px-4 py-2.5 text-[12.5px] font-bold text-[#1e2761] disabled:opacity-40">
                Discard changes
              </button>
              <Button variant="danger" onClick={() => setConfirmingReset(true)} disabled={saving}>
                Reset to Defaults
              </Button>
              <span className="ml-auto text-[11.5px] text-[#5b6472]">{isDirty ? `${changedFields.length} unsaved ${changedFields.length === 1 ? "change" : "changes"}` : "All changes saved"}</span>
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
        <section id="history" className="mt-6 scroll-mt-5 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
            Change History
          </h2>
          <ul className="divide-y divide-[#e5e9f0]">
            {history.map((item) => (
              <li key={item.id} className="text-[12.5px]">
                <button type="button" aria-expanded={openHistoryId === item.id} onClick={() => setOpenHistoryId((open) => open === item.id ? null : item.id)} className="flex w-full items-center gap-3 py-3 text-left focus:outline-none focus-visible:rounded-[7px] focus-visible:shadow-[0_0_0_3px_#dff7ee]">
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-4 shrink-0 text-[#5b6472] transition-transform ${openHistoryId === item.id ? "rotate-90" : ""}`}><path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="min-w-0 flex-1"><strong className="block text-[#171b26]">Version {item.version}</strong><small className="block truncate text-[#5b6472]">{item.changedBy?.fullName ?? "System"} changed {item.changedFields.length} {item.changedFields.length === 1 ? "field" : "fields"}</small></span>
                  <time className="shrink-0 text-[11px] text-[#5b6472]">{formatDate(item.createdAt)}</time>
                </button>
                {openHistoryId === item.id && (
                  <div className="pb-3 pl-7">
                    <dl className="grid gap-x-5 sm:grid-cols-2">
                      {item.changedFields.map((field) => (
                        <div key={field} className="border-t border-[#edf0f5] py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-[#5b6472]">{FIELD_LABELS[field] ?? field}</dt>
                          <dd className="mt-0.5 break-words text-[#171b26]">{String(item.snapshot?.[field] ?? "Not recorded")}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
