import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useDistricts } from "@/lib/useDistricts";

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11.5px] font-bold text-[#1e2761]";

type BeneficiaryDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  trusteeName: string;
  trusteeGhanaCardId: string;
};

const emptyBeneficiary = (): BeneficiaryDraft => ({
  fullName: "",
  relationship: "CHILD",
  dateOfBirth: "",
  trusteeName: "",
  trusteeGhanaCardId: "",
});

export default function AddMember() {
  const navigate = useNavigate();
  const { districts, loading: districtsLoading } = useDistricts();

  const [controllerId, setControllerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [ghanaCardId, setGhanaCardId] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [districtId, setDistrictId] = useState("");

  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseDob, setSpouseDob] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState("");

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([
    emptyBeneficiary(),
  ]);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateBeneficiary = (
    index: number,
    patch: Partial<BeneficiaryDraft>,
  ) => {
    setBeneficiaries((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
  };

  const addBeneficiary = () => {
    if (beneficiaries.length >= 10) return;
    setBeneficiaries((prev) => [...prev, emptyBeneficiary()]);
  };

  const removeBeneficiary = (index: number) => {
    setBeneficiaries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setError("Controller ID must contain 4 to 7 digits.");
      return;
    }
    if (!districtId) {
      setError("Select a district.");
      return;
    }
    if (beneficiaries.some((b) => !b.fullName.trim())) {
      setError("Every beneficiary needs a name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/members", {
        controllerId: controllerId.trim(),
        fullName: fullName.trim(),
        dateOfBirth: dateOfBirth || null,
        ghanaCardId: ghanaCardId.trim() || null,
        phone: phone.trim() || null,
        school: school.trim(),
        districtId: Number(districtId),
        spouse: includeSpouse
          ? {
              fullName: spouseName.trim(),
              dateOfBirth: spouseDob || null,
              ghanaCardId: spouseGhanaCardId.trim() || null,
            }
          : null,
        beneficiaries: beneficiaries.map((b) => ({
          fullName: b.fullName.trim(),
          relationship: b.relationship,
          dateOfBirth: b.dateOfBirth || null,
          trusteeName: b.trusteeName.trim() || null,
          trusteeGhanaCardId: b.trusteeGhanaCardId.trim() || null,
        })),
      });
      navigate(`/members/${res.data.data.id}`, { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.errors
          ?.map((issue: any) => issue.message)
          .join(" ") ||
          err?.response?.data?.message ||
          "Unable to enroll this member.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
      >
        &larr; All Members
      </Link>

      <h1 className="mb-5 text-[22px] font-extrabold text-[#1e2761]">
        Add Member
      </h1>

      {error && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <h2 className="mb-4 text-[15px] font-bold text-[#1e2761]">
            Member Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClasses}>Controller ID</label>
              <input
                value={controllerId}
                onChange={(e) => setControllerId(e.target.value)}
                placeholder="4 to 7 digits"
                inputMode="numeric"
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Ghana Card ID</label>
              <input
                value={ghanaCardId}
                onChange={(e) => setGhanaCardId(e.target.value)}
                placeholder="GHA-000000000-0"
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label className={labelClasses}>School</label>
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClasses}>District</label>
              <select
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                disabled={districtsLoading}
                className={inputClasses}
              >
                <option value="">Select a district…</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.region.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#1e2761]">Spouse</h2>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#5b6472]">
              <input
                type="checkbox"
                checked={includeSpouse}
                onChange={(e) => setIncludeSpouse(e.target.checked)}
              />
              Add spouse
            </label>
          </div>
          {includeSpouse && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClasses}>Full Name</label>
                <input
                  value={spouseName}
                  onChange={(e) => setSpouseName(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Date of Birth</label>
                <input
                  type="date"
                  value={spouseDob}
                  onChange={(e) => setSpouseDob(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Ghana Card ID</label>
                <input
                  value={spouseGhanaCardId}
                  onChange={(e) => setSpouseGhanaCardId(e.target.value)}
                  placeholder="GHA-000000000-0"
                  className={inputClasses}
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#1e2761]">
              Beneficiaries ({beneficiaries.length}/10)
            </h2>
            <button
              type="button"
              onClick={addBeneficiary}
              disabled={beneficiaries.length >= 10}
              className="rounded-[9px] border border-[#e5e9f0] px-3 py-1.5 text-[12px] font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add beneficiary
            </button>
          </div>
          <div className="space-y-4">
            {beneficiaries.map((b, index) => (
              <div
                key={index}
                className="rounded-[10px] border border-[#e5e9f0] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#5b6472]">
                    Beneficiary {index + 1}
                  </span>
                  {beneficiaries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBeneficiary(index)}
                      className="text-[11.5px] font-semibold text-[#c23b3b]"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClasses}>Full Name</label>
                    <input
                      value={b.fullName}
                      onChange={(e) =>
                        updateBeneficiary(index, { fullName: e.target.value })
                      }
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Relationship</label>
                    <select
                      value={b.relationship}
                      onChange={(e) =>
                        updateBeneficiary(index, {
                          relationship: e.target.value,
                        })
                      }
                      className={inputClasses}
                    >
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClasses}>Date of Birth</label>
                    <input
                      type="date"
                      value={b.dateOfBirth}
                      onChange={(e) =>
                        updateBeneficiary(index, {
                          dateOfBirth: e.target.value,
                        })
                      }
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Trustee Name</label>
                    <input
                      value={b.trusteeName}
                      onChange={(e) =>
                        updateBeneficiary(index, {
                          trusteeName: e.target.value,
                        })
                      }
                      className={inputClasses}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-[9px] bg-[#1f9c7c] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Enrolling…" : "Enroll Member"}
        </button>
      </form>
    </div>
  );
}
