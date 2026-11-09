import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { InputField } from "@/components/ui/FormField";
import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useState, type FormEvent } from "react";

// Shown on the dashboard whenever the logged-in staff member has no email on file --
// self-service, reusable any time (not a one-shot "finish setup" step), since adding an email
// is no longer forced during account setup. See the simplified-onboarding plan.
export default function AddEmailBanner() {
  const { user, setEmail } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmailValue] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user || user.email !== null) return null;

  const close = () => {
    setOpen(false);
    setCurrentPassword("");
    setEmailValue("");
    setConfirmEmail("");
    setError("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError("Email addresses do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await setEmail({ currentPassword, email, confirmEmail });
      close();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to add your email address.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info-border bg-info-soft px-4 py-3">
        <p className="text-[13px] font-bold text-text-strong">
          Add your email so you can also sign in that way.
        </p>
        <Button onClick={() => setOpen(true)}>Add email</Button>
      </div>
      {open && (
        <Dialog
          title="Add your email"
          description="You'll still be able to sign in with your phone number afterward."
          busy={submitting}
          onClose={close}
        >
          <form onSubmit={handleSubmit}>
            <fieldset disabled={submitting} className="min-w-0 space-y-4">
              <InputField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
              <InputField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmailValue(event.target.value)}
                required
                autoComplete="email"
              />
              <InputField
                label="Confirm email"
                type="email"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
                required
                autoComplete="email"
              />
              {error && <Alert tone="error">{error}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={submitting} loadingLabel="Saving…">
                  Save email
                </Button>
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        </Dialog>
      )}
    </>
  );
}
