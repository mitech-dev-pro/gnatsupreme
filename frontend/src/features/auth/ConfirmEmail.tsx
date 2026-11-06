import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function ConfirmEmail() {
  const { confirmEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This confirmation link is missing or invalid.");
      return;
    }
    confirmEmail(token)
      .then((res) => {
        setStatus("done");
        setMessage(res.message);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(getApiError(err)?.message || "This confirmation link is invalid or has expired.");
      });
    // Runs once per mount against whatever token was in the URL at load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="w-full max-w-100 rounded-2xl border border-white/10 bg-white p-8 shadow-dialog">
        <h1 className="mb-1 text-xl font-extrabold tracking-tight text-text-strong">
          Confirm your email
        </h1>

        {status === "pending" && (
          <div className="mt-5 flex items-center gap-2 text-[12.5px] text-text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-action-primary" />
            Confirming…
          </div>
        )}
        {status === "done" && (
          <div className="mt-5 rounded-lg bg-success-soft px-2.5 py-2 text-[12.5px] font-semibold text-success">
            {message}
          </div>
        )}
        {status === "error" && (
          <div className="mt-5 rounded-lg bg-danger-soft px-2.5 py-2 text-[12.5px] font-semibold text-danger">
            {message}
          </div>
        )}

        <Link
          to="/login"
          className="mt-5 block w-full rounded-lg bg-action-primary py-2.5 text-center text-[13px] font-bold text-white shadow-action transition hover:bg-success"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
