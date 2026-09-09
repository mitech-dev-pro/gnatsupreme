import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import api from "@/lib/api";
import { deliveryLabel } from "@/lib/claimDocuments";
import { formatCurrency } from "@/lib/currency";
import { getApiError } from "@/lib/errorExtract";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import { isMinor } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BeneficiaryForm } from "./BeneficiaryForm";
import { MemberDetailsForm } from "./MemberDetailsForm";
import {
  type Beneficiary,
  BENEFIT_LABELS,
  type BenefitPlan,
  type ChangeRequest,
  CLAIM_TYPE_LABELS,
  type ClaimItem,
  formatDate,
  type MemberNotification,
  type MemberPortalSection,
  type MemberProfile,
  type ProfileCompletion,
  REQUEST_FIELD_LABELS,
  REQUEST_STATUS_STYLES,
  REQUEST_TYPE_LABELS,
  requestValue,
  timeAgo,
} from "./MemberHome.shared";
import { SpouseForm } from "./SpouseForm";
export default function MemberHome({ section = "profile" }: { section?: MemberPortalSection }) {
  const { settings } = useOrganizationSettings();
  useMemberAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [benefitPlan, setBenefitPlan] = useState<BenefitPlan>(null);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [claims, setClaims] = useState<ClaimItem[]>([]);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSpouse, setEditingSpouse] = useState(false);
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [beneficiaryToRemove, setBeneficiaryToRemove] = useState<Beneficiary | null>(null);
  const [requestFilter, setRequestFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [requestToCancel, setRequestToCancel] = useState<ChangeRequest | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState(false);
  const [cancelRequestError, setCancelRequestError] = useState("");
  const [requestComposer, setRequestComposer] = useState<
    "MEMBER_DETAILS" | "SPOUSE" | "BENEFICIARY_ADD" | null
  >(null);
  // Endorsements consolidates the old separate "My Covered lives" page as a sub-tab here,
  // rather than a 5th sidebar item.
  const [endorsementsTab, setEndorsementsTab] = useState<"requests" | "household">("requests");
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState("");

  const loadProfile = async () => {
    const res = await api.get("/member-portal/profile");
    setProfile(res.data.data.member);
    setBenefitPlan(res.data.data.benefitPlan);
    setProfileCompletion(res.data.data.profileCompletion);
  };

  const loadNotifications = async () => {
    const res = await api.get("/member-portal/notifications");
    setNotifications(res.data.data);
    setUnreadCount(res.data.unreadCount);
  };

  const loadRequests = async () => {
    try {
      const res = await api.get("/member-portal/change-requests");
      setRequests(res.data.data);
    } catch {
      // request history is supplementary — a failed fetch shouldn't block the page
    }
  };

  const loadClaims = async () => {
    try {
      const res = await api.get("/member-portal/claims");
      setClaims(res.data.data);
    } catch {
      // claim history is supplementary — a failed fetch shouldn't block the page
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadProfile();
        if (!cancelled) {
          try {
            await loadNotifications();
          } catch {
            // Notifications are supplementary; the member profile remains usable.
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await api.get("/member-portal/notifications");
        if (!cancelled) {
          setNotifications(res.data.data);
          setUnreadCount(res.data.unreadCount);
        }
      } catch {
        // notifications are supplementary — a failed fetch shouldn't block the page
      }
    })();
    void loadRequests();
    void loadClaims();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllNotificationsRead = async () => {
    await api.patch("/member-portal/notifications/read-all");
    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);
  };

  const afterRequestSubmitted = async () => {
    await Promise.all([loadRequests(), loadProfile()]);
  };

  const finishComposedRequest = async () => {
    await Promise.all([loadRequests(), loadProfile()]);
    setRequestComposer(null);
  };

  const dismissCompletionPrompt = async () => {
    setCompletionBusy(true);
    setCompletionError("");
    try {
      await api.patch("/member-portal/profile-completion/dismiss");
      setProfileCompletion((current) =>
        current ? { ...current, showExpandedPrompt: false } : current,
      );
    } catch (error: unknown) {
      setCompletionError(getApiError(error)?.message || "Unable to save this preference.");
    } finally {
      setCompletionBusy(false);
    }
  };

  const declareNoSpouse = async () => {
    setCompletionBusy(true);
    setCompletionError("");
    try {
      await api.patch("/member-portal/profile-completion/spouse-declaration", {
        hasSpouse: false,
      });
      await loadProfile();
    } catch (error: unknown) {
      setCompletionError(getApiError(error)?.message || "Unable to save your spouse declaration.");
    } finally {
      setCompletionBusy(false);
    }
  };

  const cancelChangeRequest = async () => {
    if (!requestToCancel) return;
    setCancellingRequest(true);
    setCancelRequestError("");
    try {
      await api.patch(`/member-portal/change-requests/${requestToCancel.id}/cancel`);
      await Promise.all([loadRequests(), loadProfile()]);
      setRequestToCancel(null);
    } catch (error: unknown) {
      setCancelRequestError(getApiError(error)?.message || "Unable to cancel this request.");
    } finally {
      setCancellingRequest(false);
    }
  };

  const removeBeneficiary = async (beneficiary: Beneficiary) => {
    setRemovingId(beneficiary.id);
    setRemoveError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "BENEFICIARY_REMOVE",
        targetBeneficiaryId: beneficiary.id,
      });
      await loadRequests();
      setBeneficiaryToRemove(null);
    } catch (err: unknown) {
      setRemoveError(getApiError(err)?.message || "Unable to submit this request.");
    } finally {
      setRemovingId(null);
    }
  };

  const pendingFor = (type: ChangeRequest["type"], targetBeneficiaryId: number | null = null) =>
    requests.find(
      (r) =>
        r.status === "PENDING" && r.type === type && r.targetBeneficiaryId === targetBeneficiaryId,
    );

  const spousePending = pendingFor("SPOUSE");
  const profilePending = pendingFor("MEMBER_DETAILS");
  const visibleRequests = requests.filter((request) => {
    if (requestFilter === "PENDING") return request.status === "PENDING";
    if (requestFilter === "COMPLETED") return request.status !== "PENDING";
    return true;
  });

  return (
    <div>
      {loading ? (
        <div className="rounded-2xl border border-border-default bg-white p-6 text-sm text-text-muted">
          Loading your profile…
        </div>
      ) : profile ? (
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:gap-5 ${section === "requests" && endorsementsTab === "household" ? "lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]" : ""}`}
        >
          {section === "profile" && (
            <>
              <section
                className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
                aria-labelledby="coverage-summary-title"
              >
                <div
                  className="flex flex-col gap-5 px-5 py-5 text-white sm:px-6"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-white/14 px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                        {profile.status}
                      </span>
                      <span className="text-xs text-white/65">Membership coverage</span>
                    </div>
                    <h2 id="coverage-summary-title" className="text-lg font-extrabold">
                      My cover is{" "}
                      {profile.status === "ACTIVE" ? "active" : profile.status.toLowerCase()}
                    </h2>
                    <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-white/72">
                      {profile.school} ·{" "}
                      {profile.district
                        ? `${profile.district.name}, ${profile.district.region.name}`
                        : "District not yet assigned"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-default px-5 py-3 text-xs text-text-muted">
                  <span>
                    {settings.memberIdLabel}:{" "}
                    <strong className="text-text-strong">{profile.controllerId}</strong>
                  </span>
                  {benefitPlan && (
                    <span>Plan effective {formatDate(benefitPlan.effectiveFrom)}</span>
                  )}
                  <Link
                    to="/member/coverage"
                    className="ml-auto font-bold text-action-primary no-underline hover:underline"
                  >
                    View coverage
                  </Link>
                </div>
              </section>

              {profileCompletion && !profileCompletion.complete && (
                <section
                  className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
                  aria-labelledby="profile-completion-title"
                >
                  {profileCompletion.showExpandedPrompt ? (
                    <>
                      <header className="flex flex-col gap-4 border-b border-border-default bg-warning-soft px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                        <div className="max-w-[70ch]">
                          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.07em] text-warning">
                            <span
                              aria-hidden="true"
                              className="grid size-5 place-items-center rounded-full bg-(--surface-raised)"
                            >
                              !
                            </span>
                            Profile check
                          </div>
                          <h2
                            id="profile-completion-title"
                            className="text-lg font-extrabold text-text-strong"
                          >
                            Complete your membership details
                          </h2>
                          <p className="mt-1 text-xs leading-relaxed text-text-muted">
                            Report 20 does not contain every detail needed for your membership.
                            Submit the missing information below; you can continue using the portal
                            while your district reviews it.
                          </p>
                        </div>
                        <div className="min-w-32 shrink-0">
                          <div className="flex items-center justify-between text-xs font-bold text-text-muted">
                            <span>Profile progress</span>
                            <span>{profileCompletion.percentage}%</span>
                          </div>
                          <div
                            className="mt-2 h-2 overflow-hidden rounded-full bg-(--surface-raised)"
                            role="progressbar"
                            aria-label="Profile completion"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={profileCompletion.percentage}
                          >
                            <span
                              className="block h-full rounded-full bg-action-primary"
                              style={{
                                width: `${profileCompletion.percentage}%`,
                              }}
                            />
                          </div>
                        </div>
                      </header>
                      <ul className="divide-y divide-(--border-default)">
                        {profileCompletion.items.map((item) => (
                          <li
                            key={item.key}
                            className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                aria-hidden="true"
                                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${item.status === "COMPLETE" ? "bg-success-soft text-success" : item.status === "PENDING" ? "bg-warning-soft text-warning" : "bg-surface-subtle text-text-muted"}`}
                              >
                                {item.status === "COMPLETE"
                                  ? "✓"
                                  : item.status === "PENDING"
                                    ? "…"
                                    : "•"}
                              </span>
                              <span>
                                <strong className="block text-sm text-text-strong">
                                  {item.label}
                                </strong>
                                <small className="mt-0.5 block text-xs text-text-muted">
                                  {item.status === "COMPLETE"
                                    ? "Recorded"
                                    : item.status === "PENDING"
                                      ? "Submitted and awaiting district review"
                                      : "Information needed"}
                                </small>
                              </span>
                            </div>
                            {item.status === "MISSING" && (
                              <div className="flex shrink-0 flex-wrap gap-2">
                                {item.key === "ghanaCardId" && (
                                  <button
                                    type="button"
                                    onClick={() => setRequestComposer("MEMBER_DETAILS")}
                                    className="min-h-9 rounded-lg bg-action-primary px-3 text-xs font-bold text-white"
                                  >
                                    Add personal details
                                  </button>
                                )}
                                {item.key === "spouse" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setRequestComposer("SPOUSE")}
                                      className="min-h-9 rounded-lg bg-action-primary px-3 text-xs font-bold text-white"
                                    >
                                      Add spouse
                                    </button>
                                    <button
                                      type="button"
                                      disabled={completionBusy}
                                      onClick={() => void declareNoSpouse()}
                                      className="min-h-9 rounded-lg border border-border-default px-3 text-xs font-bold text-(--brand-primary) disabled:opacity-55"
                                    >
                                      I have no spouse
                                    </button>
                                  </>
                                )}
                                {item.key === "beneficiary" && (
                                  <button
                                    type="button"
                                    onClick={() => setRequestComposer("BENEFICIARY_ADD")}
                                    className="min-h-9 rounded-lg bg-action-primary px-3 text-xs font-bold text-white"
                                  >
                                    Add beneficiary
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      {completionError && (
                        <p
                          role="alert"
                          className="mx-5 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger sm:mx-6"
                        >
                          {completionError}
                        </p>
                      )}
                      {requestComposer === "MEMBER_DETAILS" && (
                        <MemberDetailsForm
                          profile={profile}
                          onClose={() => setRequestComposer(null)}
                          onSubmitted={finishComposedRequest}
                        />
                      )}
                      {requestComposer === "SPOUSE" && (
                        <div className="border-t border-border-default px-5 pb-5 sm:px-6">
                          <SpouseForm
                            spouse={profile.spouse}
                            onClose={() => setRequestComposer(null)}
                            onSubmitted={finishComposedRequest}
                          />
                        </div>
                      )}
                      {requestComposer === "BENEFICIARY_ADD" && (
                        <div className="border-t border-border-default px-5 pb-5 sm:px-6">
                          <BeneficiaryForm
                            beneficiary={null}
                            onClose={() => setRequestComposer(null)}
                            onSubmitted={finishComposedRequest}
                          />
                        </div>
                      )}
                      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-5 py-3 sm:px-6">
                        <p className="text-xs text-text-muted">
                          Approved changes will appear here automatically.
                        </p>
                        <button
                          type="button"
                          disabled={completionBusy}
                          onClick={() => void dismissCompletionPrompt()}
                          className="min-h-8 text-xs font-bold text-text-muted hover:text-(--brand-primary) disabled:opacity-55"
                        >
                          Remind me later
                        </button>
                      </footer>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div>
                        <h2
                          id="profile-completion-title"
                          className="text-lg font-bold text-text-strong"
                        >
                          Your profile is {profileCompletion.percentage}% complete
                        </h2>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {
                            profileCompletion.items.filter((item) => item.status === "MISSING")
                              .length
                          }{" "}
                          details needed,{" "}
                          {
                            profileCompletion.items.filter((item) => item.status === "PENDING")
                              .length
                          }{" "}
                          awaiting review
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setProfileCompletion((current) =>
                            current ? { ...current, showExpandedPrompt: true } : current,
                          )
                        }
                        className="min-h-9 rounded-lg border border-border-default px-3 text-xs font-bold text-(--brand-primary) hover:bg-surface-subtle"
                      >
                        Review missing details
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section
                className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
                aria-labelledby="member-profile-title"
              >
                <div className="flex flex-col gap-4 border-b border-border-default bg-surface-subtle px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      className="grid size-14 shrink-0 place-items-center rounded-full text-base font-extrabold text-white"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {profile.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h2
                          id="member-profile-title"
                          className="truncate text-lg font-extrabold text-text-strong"
                        >
                          {profile.fullName}
                        </h2>
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-success">
                          {profile.status}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {settings.memberIdLabel} {profile.controllerId}
                      </p>
                    </div>
                  </div>
                  {!editingProfile &&
                    (profilePending ? (
                      <span className="rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning">
                        Update awaiting review
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingProfile(true)}
                        className="min-h-10 shrink-0 rounded-lg bg-action-primary px-4 text-xs font-bold text-white"
                      >
                        Request an update
                      </button>
                    ))}
                </div>

                <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
                  <div className="px-5 py-5 sm:px-6 lg:border-r lg:border-border-default">
                    <h3 className="text-base font-bold uppercase tracking-[0.08em] text-text-muted">
                      Personal and contact details
                    </h3>
                    <dl className="mt-3 divide-y divide-(--border-default)">
                      {[
                        ["Full legal name", profile.fullName],
                        ["Ghana Card ID", profile.ghanaCardId ?? "Not provided"],
                        ["Phone number", profile.phone ?? "Not provided"],
                      ].map(([label, value]) => (
                        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]">
                          <dt className="text-xs text-text-muted">{label}</dt>
                          <dd className="break-words text-sm font-semibold text-ink">
                            {value}
                            {label === "Phone number" && profile.phoneVerifiedAt && (
                              <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">
                                Verified
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="px-5 py-5 sm:px-6">
                    <h3 className="text-base font-bold uppercase tracking-[0.08em] text-text-muted">
                      Membership context
                    </h3>
                    <dl className="mt-3 divide-y divide-(--border-default)">
                      {[
                        ["School or institution", profile.school],
                        [settings.subRegionLabel, profile.district?.name ?? "Not yet assigned"],
                        ["Region", profile.district?.region.name ?? "Not yet assigned"],
                        [
                          settings.reconciliationSource,
                          profile.report20Matched ? "Matched" : "Needs review",
                        ],
                      ].map(([label, value]) => (
                        <div key={label} className="py-3">
                          <dt className="text-xs text-text-muted">{label}</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs leading-relaxed text-text-muted">
                      Changes to these records are reviewed before they become active.
                    </p>
                  </div>
                </div>
                {editingProfile && (
                  <MemberDetailsForm
                    profile={profile}
                    onClose={() => setEditingProfile(false)}
                    onSubmitted={afterRequestSubmitted}
                  />
                )}
              </section>
            </>
          )}

          {section === "requests" && (
            <div
              className="flex gap-1 rounded-lg bg-surface-subtle p-1 md:col-span-2"
              role="tablist"
              aria-label="Endorsements"
            >
              <button
                type="button"
                role="tab"
                aria-selected={endorsementsTab === "requests"}
                onClick={() => setEndorsementsTab("requests")}
                className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:shadow-focus ${endorsementsTab === "requests" ? "bg-(--surface-raised) text-(--brand-primary) shadow-inset-panel" : "text-text-muted hover:text-ink"}`}
              >
                Requests history
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={endorsementsTab === "household"}
                onClick={() => setEndorsementsTab("household")}
                className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:shadow-focus ${endorsementsTab === "household" ? "bg-(--surface-raised) text-(--brand-primary) shadow-inset-panel" : "text-text-muted hover:text-ink"}`}
              >
                Household
              </button>
            </div>
          )}

          {section === "requests" && endorsementsTab === "household" && (
            <section
              className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
              aria-labelledby="household-title"
            >
              <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2 id="household-title" className="text-lg font-extrabold text-text-strong">
                    Your covered lives
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Review the spouse and beneficiaries connected to your membership.
                  </p>
                </div>
                <div className="flex gap-5 text-xs text-text-muted">
                  <span>
                    <strong className="block text-lg text-text-strong">
                      {profile.spouse ? 1 : 0}
                    </strong>{" "}
                    spouse
                  </span>
                  <span>
                    <strong className="block text-lg text-text-strong">
                      {profile.beneficiaries.length}
                    </strong>{" "}
                    beneficiaries
                  </span>
                  <span>
                    <strong className="block text-lg text-text-strong">
                      {
                        requests.filter(
                          (request) =>
                            request.status === "PENDING" && request.type !== "MEMBER_DETAILS",
                        ).length
                      }
                    </strong>{" "}
                    pending
                  </span>
                </div>
              </div>
            </section>
          )}

          {section === "requests" && endorsementsTab === "household" && (
            <section
              className="rounded-2xl border border-border-default bg-(--surface-raised) p-5"
              aria-labelledby="spouse-title"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 id="spouse-title" className="text-lg font-bold text-text-strong">
                    Spouse
                  </h2>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {profile.spouse ? "One spouse is recorded" : "No spouse is currently recorded"}
                  </p>
                </div>
                {!editingSpouse &&
                  (spousePending ? (
                    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-accent">
                      Review pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingSpouse(true)}
                      className="min-h-9 rounded-lg border border-border-default px-3 text-xs font-semibold text-action-primary hover:bg-surface-subtle"
                    >
                      {profile.spouse ? "Request update" : "Add spouse"}
                    </button>
                  ))}
              </div>
              {profile.spouse ? (
                <dl className="mt-4 divide-y divide-(--border-default) text-sm">
                  <div className="py-2.5">
                    <dt className="text-text-muted">Full Name</dt>
                    <dd className="mt-0.5 font-semibold text-ink">{profile.spouse.fullName}</dd>
                  </div>
                  <div className="py-2.5">
                    <dt className="text-text-muted">Ghana Card ID</dt>
                    <dd className="mt-0.5 break-words font-semibold text-ink">
                      {profile.spouse.ghanaCardId ?? "Not provided"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="text-sm text-text-muted">No spouse on record.</div>
              )}
              {editingSpouse && (
                <SpouseForm
                  spouse={profile.spouse}
                  onClose={() => setEditingSpouse(false)}
                  onSubmitted={afterRequestSubmitted}
                />
              )}
            </section>
          )}

          {section === "requests" && endorsementsTab === "household" && (
            <section
              className="rounded-2xl border border-border-default bg-(--surface-raised) p-5"
              aria-labelledby="beneficiaries-title"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 id="beneficiaries-title" className="text-lg font-bold text-text-strong">
                    Beneficiaries ({profile.beneficiaries.length}/10)
                  </h2>
                  <p className="mt-0.5 text-xs text-text-muted">
                    People nominated to receive eligible benefits
                  </p>
                </div>
                {!addingBeneficiary && profile.beneficiaries.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setAddingBeneficiary(true)}
                    className="min-h-9 rounded-lg bg-action-primary px-3 text-xs font-bold text-white"
                  >
                    Add beneficiary
                  </button>
                )}
              </div>

              {removeError && (
                <div className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
                  {removeError}
                </div>
              )}

              {beneficiaryToRemove && (
                <div className="mb-4">
                  <ConfirmationPanel
                    title={`Remove ${beneficiaryToRemove.fullName}?`}
                    description="A removal request will be sent for administrative review. The beneficiary remains on your record until the request is approved."
                    confirmLabel="Request removal"
                    busyLabel="Submitting…"
                    busy={removingId === beneficiaryToRemove.id}
                    onConfirm={() => void removeBeneficiary(beneficiaryToRemove)}
                    onCancel={() => setBeneficiaryToRemove(null)}
                  />
                </div>
              )}

              {profile.beneficiaries.length === 0 ? (
                <div className="text-sm text-text-muted">No beneficiaries on record.</div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {profile.beneficiaries.map((b) => {
                    const updatePending = pendingFor("BENEFICIARY_UPDATE", b.id);
                    const removePending = pendingFor("BENEFICIARY_REMOVE", b.id);
                    return (
                      <li key={b.id} className="py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {b.fullName}
                            </span>
                            <span className="mt-0.5 block text-xs text-text-muted">
                              {b.relationship.charAt(0) + b.relationship.slice(1).toLowerCase()}
                              {isMinor(b.dateOfBirth) && " · Minor"}
                            </span>
                            {b.trusteeName && (
                              <span className="mt-0.5 block text-xs text-text-muted">
                                Trustee: {b.trusteeName}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            {updatePending || removePending ? (
                              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-accent">
                                Review pending
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingBeneficiaryId(
                                      editingBeneficiaryId === b.id ? null : b.id,
                                    )
                                  }
                                  className="min-h-8 rounded-lg border border-border-default px-2.5 text-xs font-semibold text-text-strong"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBeneficiaryToRemove(b)}
                                  disabled={removingId === b.id}
                                  className="min-h-8 rounded-lg px-2.5 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingBeneficiaryId === b.id && (
                          <BeneficiaryForm
                            beneficiary={b}
                            onClose={() => setEditingBeneficiaryId(null)}
                            onSubmitted={afterRequestSubmitted}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {addingBeneficiary && (
                <BeneficiaryForm
                  beneficiary={null}
                  onClose={() => setAddingBeneficiary(false)}
                  onSubmitted={afterRequestSubmitted}
                />
              )}
            </section>
          )}

          {section === "coverage" && benefitPlan && (
            <section
              className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
              aria-labelledby="coverage-heading"
            >
              <header className="border-b border-border-default px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="coverage-heading" className="text-lg font-bold text-(--brand-primary)">
                    My benefit plan
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/policy/terms-and-conditions.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-bold text-(--brand-primary) no-underline hover:bg-surface-subtle"
                    >
                      View Terms &amp; Conditions ↗
                    </a>
                    <a
                      href="/policy/terms-and-conditions.pdf"
                      download="GNAT-Supreme-Care-Terms-and-Conditions.pdf"
                      className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-bold text-(--brand-primary) no-underline hover:bg-surface-subtle"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-text-muted">Effective from</dt>
                    <dd className="font-semibold text-ink">
                      {new Date(benefitPlan.effectiveFrom).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Collection method</dt>
                    <dd className="font-semibold text-ink">{benefitPlan.collectionMethod}</dd>
                  </div>
                </dl>
                {benefitPlan.note && (
                  <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-text-muted">
                    {benefitPlan.note}
                  </p>
                )}
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 table-fixed text-left text-sm">
                  <caption className="sr-only">
                    Member and spouse benefit amounts with coverage notes
                  </caption>
                  <thead className="bg-surface-subtle text-xs font-bold uppercase tracking-[0.05em] text-text-muted">
                    <tr>
                      <th scope="col" className="w-[23%] px-4 py-2.5 sm:px-5">
                        Benefit
                      </th>
                      <th scope="col" className="w-[15%] px-3 py-2.5">
                        Member
                      </th>
                      <th scope="col" className="w-[15%] px-3 py-2.5">
                        Spouse
                      </th>
                      <th scope="col" className="px-3 py-2.5 sm:pr-5">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--border-default)">
                    {benefitPlan.benefits
                      .filter((benefit) => benefit.enabled)
                      .map((benefit) => (
                        <tr key={benefit.type} className="align-top">
                          <th
                            scope="row"
                            className="px-4 py-3.5 font-semibold leading-snug text-(--brand-primary) sm:px-5"
                          >
                            {BENEFIT_LABELS[benefit.type] ?? benefit.type}
                          </th>
                          <td className="px-3 py-3.5 font-semibold tabular-nums text-ink">
                            {formatCurrency(benefit.memberAmount, settings.currency)}
                          </td>
                          <td className="px-3 py-3.5 text-ink">
                            {benefit.spouseAmount !== null ? (
                              <span className="font-semibold tabular-nums">
                                {formatCurrency(benefit.spouseAmount, settings.currency)}
                              </span>
                            ) : (
                              <span className="text-text-muted">Not covered</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 leading-relaxed text-text-muted sm:pr-5">
                            {benefit.note || "No additional conditions noted."}
                            {benefit.type === "CRITICAL_ILLNESS" &&
                              benefit.namedConditions?.length > 0 && (
                                <details className="mt-2">
                                  <summary className="inline-flex cursor-pointer list-none items-center rounded-lg border border-border-default bg-(--surface-raised) px-2.5 py-1.5 text-xs font-bold text-(--brand-primary) hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus">
                                    View {benefit.namedConditions.length} named{" "}
                                    {benefit.namedConditions.length === 1 ? "illness" : "illnesses"}
                                  </summary>
                                  <ul className="mt-2 grid list-disc grid-cols-1 gap-x-6 gap-y-1 pl-5 text-ink sm:grid-cols-2">
                                    {benefit.namedConditions.map((condition) => (
                                      <li key={condition}>{condition}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border-default px-4 py-3 text-xs text-text-muted sm:px-5">
                On smaller screens, swipe across the table to view all coverage details.
              </p>
            </section>
          )}

          {section === "requests" && endorsementsTab === "requests" && (
            <section
              className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
              aria-labelledby="new-request-heading"
            >
              <header className="border-b border-border-default px-4 py-4 sm:px-5">
                <h2 id="new-request-heading" className="text-lg font-bold text-(--brand-primary)">
                  Submit a change request
                </h2>
                <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-text-muted">
                  Choose what you want to update. Your current record stays unchanged until your
                  district administrator reviews and approves the request.
                </p>
              </header>
              {!requestComposer && (
                <div className="grid grid-cols-1 divide-y divide-(--border-default) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <button
                    type="button"
                    disabled={Boolean(profilePending)}
                    onClick={() => setRequestComposer("MEMBER_DETAILS")}
                    className="group min-h-28 px-4 py-4 text-left hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus-inset disabled:cursor-not-allowed disabled:opacity-55 sm:px-5"
                  >
                    <span className="block text-sm font-bold text-ink">Personal details</span>
                    <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                      Name, date of birth, Ghana Card, phone number, or school.
                    </span>
                    {profilePending && (
                      <span className="mt-2 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
                        Request pending
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(spousePending)}
                    onClick={() => setRequestComposer("SPOUSE")}
                    className="group min-h-28 px-4 py-4 text-left hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus-inset disabled:cursor-not-allowed disabled:opacity-55 sm:px-5"
                  >
                    <span className="block text-sm font-bold text-ink">
                      {profile.spouse ? "Spouse details" : "Add spouse"}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                      Add or update the spouse covered under your membership.
                    </span>
                    {spousePending && (
                      <span className="mt-2 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
                        Request pending
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(pendingFor("BENEFICIARY_ADD"))}
                    onClick={() => setRequestComposer("BENEFICIARY_ADD")}
                    className="group min-h-28 px-4 py-4 text-left hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus-inset disabled:cursor-not-allowed disabled:opacity-55 sm:px-5"
                  >
                    <span className="block text-sm font-bold text-ink">Add beneficiary</span>
                    <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                      Nominate another person to receive eligible benefits.
                    </span>
                    {pendingFor("BENEFICIARY_ADD") && (
                      <span className="mt-2 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
                        Request pending
                      </span>
                    )}
                  </button>
                </div>
              )}
              {requestComposer === "MEMBER_DETAILS" && (
                <MemberDetailsForm
                  profile={profile}
                  onClose={() => setRequestComposer(null)}
                  onSubmitted={finishComposedRequest}
                />
              )}
              {requestComposer === "SPOUSE" && (
                <div className="p-4 sm:p-5">
                  <SpouseForm
                    spouse={profile.spouse}
                    onClose={() => setRequestComposer(null)}
                    onSubmitted={finishComposedRequest}
                  />
                </div>
              )}
              {requestComposer === "BENEFICIARY_ADD" && (
                <div className="p-4 sm:p-5">
                  <BeneficiaryForm
                    beneficiary={null}
                    onClose={() => setRequestComposer(null)}
                    onSubmitted={finishComposedRequest}
                  />
                </div>
              )}
              <footer className="border-t border-border-default px-4 py-3 text-xs text-text-muted sm:px-5">
                To update or remove an existing beneficiary, use the{" "}
                <button
                  type="button"
                  onClick={() => setEndorsementsTab("household")}
                  className="font-bold text-(--brand-primary) underline-offset-2 hover:underline"
                >
                  Household
                </button>{" "}
                tab and select that person.
              </footer>
            </section>
          )}

          {section === "requests" && endorsementsTab === "requests" && requests.length > 0 && (
            <section
              className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
              aria-labelledby="requests-heading"
            >
              <header className="flex flex-col gap-3 border-b border-border-default px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
                <div>
                  <h2 id="requests-heading" className="text-lg font-bold text-(--brand-primary)">
                    My requests
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {requests.filter((request) => request.status === "PENDING").length} awaiting
                    review, {requests.filter((request) => request.status !== "PENDING").length}{" "}
                    completed
                  </p>
                </div>
                <div
                  className="flex gap-1 rounded-lg bg-surface-subtle p-1"
                  role="group"
                  aria-label="Filter requests"
                >
                  {(["ALL", "PENDING", "COMPLETED"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={requestFilter === filter}
                      onClick={() => setRequestFilter(filter)}
                      className={`min-h-8 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:shadow-focus ${requestFilter === filter ? "bg-(--surface-raised) text-(--brand-primary) shadow-inset-panel" : "text-text-muted hover:text-ink"}`}
                    >
                      {filter === "ALL" ? "All" : filter === "PENDING" ? "Pending" : "Completed"}
                    </button>
                  ))}
                </div>
              </header>

              {requestToCancel && (
                <div className="border-b border-border-default p-4 sm:p-5">
                  <ConfirmationPanel
                    title={`Cancel ${REQUEST_TYPE_LABELS[requestToCancel.type].toLowerCase()} request?`}
                    description="This removes the request from the review queue. Your current member record will not be changed."
                    confirmLabel="Cancel request"
                    busyLabel="Cancelling…"
                    tone="warning"
                    busy={cancellingRequest}
                    onConfirm={cancelChangeRequest}
                    onCancel={() => {
                      setRequestToCancel(null);
                      setCancelRequestError("");
                    }}
                  >
                    {cancelRequestError && (
                      <p role="alert" className="mt-2 text-xs font-semibold text-danger">
                        {cancelRequestError}
                      </p>
                    )}
                  </ConfirmationPanel>
                </div>
              )}

              {visibleRequests.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-muted sm:px-5">
                  No requests match this filter.
                </p>
              ) : (
                <ol className="divide-y divide-(--border-default)">
                  {visibleRequests.map((request) => (
                    <li key={request.id}>
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 hover:bg-surface-subtle focus:outline-none focus-visible:shadow-focus-inset sm:px-5">
                          <span
                            aria-hidden="true"
                            className={`mt-1 size-2 shrink-0 rounded-full ${request.status === "PENDING" ? "bg-warning" : request.status === "APPROVED" ? "bg-success" : "bg-text-muted"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm text-ink">
                                {REQUEST_TYPE_LABELS[request.type]}
                              </strong>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS_STYLES[request.status]}`}
                              >
                                {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-text-muted">
                              Submitted{" "}
                              {new Date(request.requestedAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              ({timeAgo(request.requestedAt)})
                            </span>
                          </span>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            fill="none"
                            className="mt-1 size-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
                          >
                            <path
                              d="m5 7.5 5 5 5-5"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </summary>
                        <div className="px-4 pb-5 pl-9 sm:px-5 sm:pl-10">
                          {request.proposedData && Object.keys(request.proposedData).length > 0 ? (
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border-default pt-4 sm:grid-cols-2">
                              {Object.entries(request.proposedData).map(([field, value]) => (
                                <div key={field}>
                                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                    {REQUEST_FIELD_LABELS[field] ??
                                      field.replaceAll(/([A-Z])/g, " $1")}
                                  </dt>
                                  <dd className="mt-0.5 break-words text-sm font-semibold text-ink">
                                    {requestValue(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="border-t border-border-default pt-4 text-xs text-text-muted">
                              This request does not include replacement field values.
                            </p>
                          )}
                          {request.requestNote && (
                            <div className="mt-4">
                              <h3 className="text-base font-semibold uppercase tracking-wide text-text-muted">
                                Your note
                              </h3>
                              <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink">
                                {request.requestNote}
                              </p>
                            </div>
                          )}
                          {request.reviewNote && (
                            <div className="mt-4 rounded-lg bg-surface-subtle p-3">
                              <h3 className="text-base font-semibold uppercase tracking-wide text-text-muted">
                                Review note
                              </h3>
                              <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink">
                                {request.reviewNote}
                              </p>
                            </div>
                          )}
                          {request.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => {
                                setRequestToCancel(request);
                                setCancelRequestError("");
                              }}
                              className="mt-4 min-h-9 rounded-lg border border-danger-border px-3 text-xs font-bold text-danger hover:bg-danger-soft focus:outline-none focus-visible:shadow-focus"
                            >
                              Cancel request
                            </button>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          {section === "coverage" && !benefitPlan && (
            <div className="rounded-2xl border border-border-default bg-(--surface-raised) p-6 text-sm text-text-muted md:col-span-2">
              No active benefit plan is available yet.
            </div>
          )}
          {section === "requests" && endorsementsTab === "requests" && requests.length === 0 && (
            <div className="rounded-2xl border border-border-default bg-(--surface-raised) px-5 py-6 text-center md:col-span-2">
              <h2 className="text-lg font-bold text-(--brand-primary)">No request history yet</h2>
              <p className="mt-1 text-xs text-text-muted">
                Choose an option above to submit your first change request.
              </p>
            </div>
          )}

          {section === "notifications" && (
            <div className="rounded-2xl border border-border-default bg-white p-5 md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-strong">Notifications</h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-xs font-semibold text-action-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="text-sm text-text-muted">No notifications yet.</div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {notifications.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                          {!item.readAt && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-action-primary" />
                          )}
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-xs text-text-muted">{item.message}</div>
                        {item.type === "PROFILE_COMPLETION_REQUIRED" && (
                          <Link
                            to="/member"
                            className="mt-1.5 inline-block text-xs font-bold text-action-primary no-underline hover:underline"
                          >
                            Review missing details
                          </Link>
                        )}
                      </div>
                      <div className="whitespace-nowrap text-xs text-nav-muted">
                        {timeAgo(item.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === "claims" && (
            <section
              className="overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
              aria-labelledby="member-claims-heading"
            >
              <header className="flex flex-col gap-3 border-b border-border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h2 id="member-claims-heading" className="text-lg font-bold text-text-strong">
                    Claims
                  </h2>
                  <p className="mt-1 max-w-[65ch] text-xs text-text-muted">
                    File a claim and track its review status here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/member/claims/new")}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-action-primary px-4 text-xs font-bold text-text-on-action hover:bg-(--action-primary-hover)"
                >
                  File a claim
                </button>
              </header>
              {claims.length === 0 ? (
                <div className="px-4 py-8 text-center sm:px-5">
                  <p className="text-sm text-text-muted">You haven't submitted any claims yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-(--border-default)">
                  {claims.map((claim) => {
                    const statusLabel =
                      claim.status === "PENDING" &&
                      !claim.reviewedAt &&
                      claim.source === "MEMBER_PORTAL"
                        ? "Submitted — awaiting staff review"
                        : claim.status === "RETURNED"
                          ? "Returned — needs your attention"
                          : claim.status.charAt(0) + claim.status.slice(1).toLowerCase();
                    const tone =
                      claim.status === "SUBMITTED" || claim.status === "SYNCHRONIZED"
                        ? "text-success"
                        : claim.status === "FAILED"
                          ? "text-danger"
                          : "text-warning";
                    return (
                      <li
                        key={claim.id}
                        className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                      >
                        <div>
                          <div className="text-sm font-bold text-ink">
                            {claim.claimType
                              ? (CLAIM_TYPE_LABELS[claim.claimType] ?? claim.claimType)
                              : "Claim"}
                          </div>
                          <div className={`mt-0.5 text-xs font-semibold ${tone}`}>
                            {statusLabel}
                          </div>
                          {claim.deliveryState && (
                            <p className="text-xs text-text-muted">
                              {deliveryLabel(claim.deliveryState)}
                            </p>
                          )}
                          {claim.status === "RETURNED" && claim.reviewNote && (
                            <p className="mt-1 max-w-[55ch] text-xs text-text-muted">
                              {claim.reviewNote}
                            </p>
                          )}
                          {(claim.status === "FAILED" ||
                            claim.deliveryState === "FAILED" ||
                            claim.deliveryState === "UNKNOWN") &&
                            (claim.reviewNote || claim.errorMessage) && (
                              <p className="mt-1 max-w-[55ch] text-xs text-text-muted">
                                {claim.errorMessage || claim.reviewNote}
                              </p>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-muted">
                            {timeAgo(claim.createdAt)}
                          </span>
                          {claim.status === "RETURNED" && (
                            <button
                              type="button"
                              onClick={() => navigate(`/member/claims/${claim.id}/resubmit`)}
                              className="rounded-lg border border-action-primary px-2.5 py-1 text-xs font-bold text-action-primary hover:bg-info-soft"
                            >
                              Edit &amp; resubmit
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {section === "help" && (
            <div className="rounded-2xl border border-border-default bg-(--surface-raised) p-6 md:col-span-2">
              <h2 className="text-lg font-bold text-text-strong">Help and support</h2>
              <p className="mt-1 text-sm text-text-muted">
                Contact {settings.schemeSponsor} if you need help with your membership record.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {settings.organizationPhone && (
                  <a
                    className="rounded-lg border border-border-default px-3 py-2 font-semibold text-text-strong no-underline"
                    href={`tel:${settings.organizationPhone}`}
                  >
                    Call {settings.organizationPhone}
                  </a>
                )}
                {settings.organizationEmail && (
                  <a
                    className="rounded-lg border border-border-default px-3 py-2 font-semibold text-text-strong no-underline"
                    href={`mailto:${settings.organizationEmail}`}
                  >
                    Email support
                  </a>
                )}
              </div>
              {settings.privacyNotice && (
                <div className="mt-5 border-t border-border-default pt-4">
                  <h3 className="text-base font-bold text-text-strong">Privacy notice</h3>
                  <p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-xs leading-relaxed text-text-muted">
                    {settings.privacyNotice}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border-default bg-white p-6 text-sm text-text-muted">
          We couldn't load your profile.
        </div>
      )}
    </div>
  );
}
