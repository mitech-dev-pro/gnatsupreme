import MankradoHistory from "@/components/claims/MankradoHistory";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { InputField } from "@/components/ui/FormField";
import PageHeader from "@/components/ui/PageHeader";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

type MemberLookup = {
  id: number;
  controllerId: string;
  fullName: string;
  status: string;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
};

export default function ClaimHistory() {
  const [staffId, setStaffId] = useState("");
  const [member, setMember] = useState<MemberLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMember(null);
    try {
      const response = await api.get("/claims/member-lookup", {
        params: { staffId: staffId.trim() },
      });
      setMember(response.data.data as MemberLookup);
    } catch (caught: unknown) {
      setError(getApiError(caught)?.message || "We could not find that member.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Claim history"
        description="Look up a member's Staff ID to view their full Mankrado claim history."
      />

      <section className="max-w-md rounded-xl border border-border-default bg-(--surface-raised) p-5">
        {error && (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <InputField
              label="Staff ID"
              required
              autoFocus
              value={staffId}
              onChange={(event) => {
                setStaffId(event.target.value);
                setError("");
              }}
              placeholder="Enter Staff ID"
            />
          </div>
          <Button
            type="submit"
            loading={busy}
            loadingLabel="Finding member..."
            disabled={!staffId.trim()}
          >
            Look up
          </Button>
        </form>
      </section>

      {member && (
        <div className="mt-5">
          <section className="rounded-xl border border-border-default bg-(--surface-raised) p-5">
            <h2 className="mb-3 text-lg font-extrabold text-text-strong">Member</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">Name</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  <Link to={`/members/${member.id}`} className="hover:underline">
                    {member.fullName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  Staff ID
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{member.controllerId}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  District
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {member.district
                    ? `${member.district.name}, ${member.district.region.name}`
                    : "Not recorded"}
                </dd>
              </div>
            </dl>
          </section>

          <MankradoHistory staffId={member.controllerId} />
        </div>
      )}
    </div>
  );
}
