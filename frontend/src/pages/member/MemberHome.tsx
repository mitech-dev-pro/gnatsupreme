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

export default function MemberHome() {
  const { member, logout } = useMemberAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [benefitPlan, setBenefitPlan] = useState<BenefitPlan>(null);
  const [loading, setLoading] = useState(true);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#f4f6fa] px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-[#1e2761]">
              Welcome, {member?.fullName}
            </h1>
            <div className="text-[12.5px] text-[#5b6472]">
              Controller ID {member?.controllerId}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-[9px] border border-[#e5e9f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#c23b3b] transition hover:bg-[#fbe9e9]"
          >
            Sign out
          </button>
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
