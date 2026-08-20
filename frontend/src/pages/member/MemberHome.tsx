import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useMemberAuth } from "@/lib/MemberAuthContext";

type Beneficiary = {
  id: number;
  fullName: string;
  relationship: string;
};

type MemberProfile = {
  id: number;
  controllerId: string;
  fullName: string;
  dateOfBirth: string | null;
  phone: string | null;
  school: string;
  status: string;
  district: { id: number; name: string; region: { id: number; name: string } };
  spouse: { fullName: string } | null;
  beneficiaries: Beneficiary[];
};

type BenefitLine = {
  type: string;
  amount: string;
};

type BenefitPlan = {
  effectiveFrom: string;
  benefits: BenefitLine[];
} | null;

type MemberNotification = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MemberHome() {
  const { member, logout } = useMemberAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [benefitPlan, setBenefitPlan] = useState<BenefitPlan>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/member-portal/profile");
        if (!cancelled) {
          setProfile(res.data.data.member);
          setBenefitPlan(res.data.data.benefitPlan);
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
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllNotificationsRead = async () => {
    await api.patch("/member-portal/notifications/read-all");
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#f4f6fa] px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex flex-col gap-5 rounded-[14px] border border-[#e5e9f0] bg-white px-5 py-4 shadow-[0_5px_18px_rgba(30,39,97,0.06)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/brand/gnat-logo.png?v=1"
              alt="GNAT"
              className="h-14 w-24 shrink-0 object-contain"
            />
            <div className="h-10 w-px bg-[#e5e9f0]" />
            <div>
              <h1 className="text-[22px] font-extrabold text-[#1e2761]">
                Welcome, {member?.fullName}
              </h1>
              <div className="text-[12.5px] text-[#5b6472]">
                Controller ID {member?.controllerId}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#7a8190]">
                Underwritten by
              </div>
              <img
                src="/brand/milife-logo.png?v=1"
                alt="miLife Insurance"
                className="mt-1 h-7 w-20 object-contain"
              />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#c23b3b] transition hover:bg-[#fbe9e9]"
            >
              Sign out
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            Loading your profile…
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                Coverage
              </h2>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">Status</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.status}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">School</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.school}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">District</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.district.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">Region</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.district.region.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">Spouse</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.spouse?.fullName ?? "Not recorded"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                Beneficiaries
              </h2>
              {profile.beneficiaries.length === 0 ? (
                <div className="text-[13px] text-[#5b6472]">
                  No beneficiaries on record.
                </div>
              ) : (
                <ul className="space-y-2 text-[13px]">
                  {profile.beneficiaries.map((b) => (
                    <li key={b.id} className="flex justify-between">
                      <span className="text-[#171b26]">{b.fullName}</span>
                      <span className="text-[#5b6472]">{b.relationship}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {benefitPlan && (
              <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
                <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                  Benefit Plan
                </h2>
                <ul className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                  {benefitPlan.benefits.map((b) => (
                    <li key={b.type} className="flex justify-between">
                      <span className="text-[#5b6472]">{b.type}</span>
                      <span className="font-semibold text-[#171b26]">
                        {b.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="text-[13px] text-[#5b6472]">
                  No notifications yet.
                </div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {notifications.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div>
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#171b26]">
                          {!item.readAt && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f9c7c]" />
                          )}
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#5b6472]">
                          {item.message}
                        </div>
                      </div>
                      <div className="whitespace-nowrap text-[11px] text-[#9aa2c4]">
                        {timeAgo(item.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            We couldn't load your profile.
          </div>
        )}
      </div>
    </div>
  );
}
