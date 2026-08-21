import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import api from "@/lib/api";

export type PublicOrganizationSettings = {
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
};

export const DEFAULT_ORGANIZATION_SETTINGS: PublicOrganizationSettings = {
  portalName: "GNAT Supreme Care",
  schemeSponsor: "GNAT",
  underwriter: "miLife Insurance",
  sidebarMark: "GS",
  primaryColor: "#102A43",
  accentColor: "#00A896",
  memberIdLabel: "Controller ID",
  reconciliationSource: "CAGD Report 20",
  subRegionLabel: "District",
  organizationEmail: null,
  organizationPhone: null,
  address: null,
  websiteUrl: null,
  privacyNotice: null,
  timezone: "Africa/Accra",
  currency: "GHS",
  version: 1,
  updatedAt: "",
};

type OrganizationSettingsContextValue = {
  settings: PublicOrganizationSettings;
  loading: boolean;
  refresh: () => Promise<void>;
};

const OrganizationSettingsContext = createContext<OrganizationSettingsContextValue | null>(null);

export function OrganizationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_ORGANIZATION_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const response = await api.get("/public/settings/branding");
      setSettings(response.data.data);
    } catch {
      setSettings((current) => current);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    document.title = settings.portalName;
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", settings.primaryColor);
    root.style.setProperty("--brand-accent", settings.accentColor);
    root.style.setProperty("--brand-navy", settings.primaryColor);
    root.style.setProperty("--brand-teal", settings.accentColor);
    root.style.setProperty("--text-strong", settings.primaryColor);
    root.style.setProperty("--action-primary", settings.accentColor);
  }, [settings]);

  const value = useMemo(() => ({ settings, loading, refresh }), [settings, loading]);
  return <OrganizationSettingsContext.Provider value={value}>{children}</OrganizationSettingsContext.Provider>;
}

export function useOrganizationSettings() {
  const context = useContext(OrganizationSettingsContext);
  if (!context) throw new Error("useOrganizationSettings must be used within OrganizationSettingsProvider");
  return context;
}
