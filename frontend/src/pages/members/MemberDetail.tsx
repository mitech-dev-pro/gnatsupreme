import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";

type Beneficiary = {
  id: number;
  fullName: string;
  relationship: string;
  dateOfBirth: string | null;
};

type MemberDetailData = {
  id: number;
  controllerId: string;
  fullName: string;
  dateOfBirth: string | null;
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  school: string;
  status: string;
  report20Matched: boolean;
  createdAt: string;
  district: { id: number; name: string; region: { id: number; name: string } };
  spouse: { fullName: string; dateOfBirth: string | null; ghanaCardId: string | null } | null;
  beneficiaries: Beneficiary[];
  createdBy: { id: number; fullName: string } | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] font-medium text-[#171b26]">{value}</dd>
    </div>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const [member, setMember] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/members/${id}`);
        if (!cancelled) setMember(res.data.data);
      } catch {
        if (!cancelled) setError("Unable to load this member.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div>
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
      >
        &larr; All Members
      </Link>

      {loading ? (
        <div className="text-[13px] text-[#5b6472]">Loading…</div>
      ) : error || !member ? (
        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#c23b3b]">
          {error || "Member not found."}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-extrabold text-[#1e2761]">
                {member.fullName}
              </h1>
              <div className="mt-1 text-[12.5px] text-[#5b6472]">
                Controller ID {member.controllerId} · {member.district.name},{" "}
                {member.district.region.name}
              </div>
            </div>
            <span className="rounded-full bg-[#eef0fa] px-3 py-1 text-[12px] font-bold text-[#1e2761]">
              {member.status}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
                Member Details
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Date of Birth" value={formatDate(member.dateOfBirth)} />
                <Field label="Ghana Card ID" value={member.ghanaCardId ?? "—"} />
                <Field label="Phone" value={member.phone ?? "—"} />
                <Field
                  label="Phone Verified"
                  value={member.phoneVerifiedAt ? formatDate(member.phoneVerifiedAt) : "No"}
                />
                <Field label="School" value={member.school} />
                <Field
                  label="Report 20 Matched"
                  value={member.report20Matched ? "Yes" : "No"}
                />
                <Field label="Enrolled" value={formatDate(member.createdAt)} />
                <Field label="Enrolled By" value={member.createdBy?.fullName ?? "—"} />
              </dl>
            </div>

            <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">Spouse</h2>
              {member.spouse ? (
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Name" value={member.spouse.fullName} />
                  <Field label="Date of Birth" value={formatDate(member.spouse.dateOfBirth)} />
                  <Field label="Ghana Card ID" value={member.spouse.ghanaCardId ?? "—"} />
                </dl>
              ) : (
                <div className="text-[12.5px] text-[#5b6472]">No spouse on record.</div>
              )}
            </div>

            <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5 lg:col-span-2">
              <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
                Beneficiaries ({member.beneficiaries.length})
              </h2>
              {member.beneficiaries.length === 0 ? (
                <div className="text-[12.5px] text-[#5b6472]">
                  No beneficiaries on record.
                </div>
              ) : (
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                      <th className="py-2">Name</th>
                      <th className="py-2">Relationship</th>
                      <th className="py-2">Date of Birth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.beneficiaries.map((b) => (
                      <tr key={b.id} className="border-b border-[#e5e9f0] last:border-0">
                        <td className="py-2 text-[#171b26]">{b.fullName}</td>
                        <td className="py-2 text-[#5b6472]">{b.relationship}</td>
                        <td className="py-2 text-[#5b6472]">{formatDate(b.dateOfBirth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
