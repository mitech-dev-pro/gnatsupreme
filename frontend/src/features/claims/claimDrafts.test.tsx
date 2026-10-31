import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useClaimDraft } from "./useClaimDraft";
import ClaimDraftControls from "./ClaimDraftControls";
import ClaimDraftList from "./ClaimDraftList";
import { draftSignature, draftTasks, type ClaimDraftPayload } from "./claimDrafts.model";
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const payload: ClaimDraftPayload = {
  claimType: "HOSPITALIZATION",
  claimantType: "MEMBER",
  claimantIdNumber: "GHA-",
  contact: {
    fullName: "Member",
    nationality: "Ghanaian",
    email: "",
    gpsAddress: "",
    residentialAddress: "",
  },
  details: {
    subjectName: "",
    relationship: "",
    dateOfEvent: "",
    cause: "",
    diagnosisDate: "",
    diagnosingHospital: "",
    diagnosingPhysician: "",
    illness: "",
    illnessOther: "",
    hospitalName: "",
    admissionDate: "",
    dischargeDate: "",
    reason: "",
  },
  paymentDetails: {},
  notes: "",
  page: 0,
};
const saved = {
  id: 4,
  revision: 1,
  memberId: 7,
  member: { id: 7, fullName: "Member", controllerId: "TEST7" },
  payload,
  documents: [{ id: 3, slotKey: "dischargeSummaryOrBill", originalName: "report.pdf" }],
  submissionKey: "00000000-0000-4000-8000-000000000007",
  updatedAt: "2026-10-29T10:00:00Z",
};
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.put).mockReset();
  vi.mocked(api.delete).mockReset();
});
function Form() {
  const [data, setData] = useState(payload),
    [documents, setDocuments] = useState(saved.documents);
  const key = useRef("00000000-0000-4000-8000-000000000007");
  const draft = useClaimDraft({
    audience: "member",
    memberId: 7,
    payload: data,
    documentIds: documents.map((file) => file.id),
    ready: true,
    getSubmissionKey: () => key.current,
    setSubmissionKey: (value) => {
      key.current = value;
    },
    apply: (record) => {
      setData(record.payload);
      setDocuments(record.documents as typeof documents);
    },
  });
  if (draft.loading) return <p>Loading draft</p>;
  if (draft.loadError) return <p role="alert">{draft.loadError}</p>;
  return (
    <>
      <label>
        Hospital
        <input
          aria-label="Hospital"
          value={data.details.hospitalName}
          onChange={(event) =>
            setData({ ...data, details: { ...data.details, hospitalName: event.target.value } })
          }
        />
      </label>
      <p>{documents.map((file) => file.originalName).join(", ")}</p>
      <ClaimDraftControls draft={draft} payload={data} documents={documents} busy={false} />
      <Link to="/away">Leave form</Link>
    </>
  );
}
const form = (path = "/new") => {
  const router = createMemoryRouter(
    [
      { path: "/new", element: <Form /> },
      { path: "/away", element: <p>Other page</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

it("saves incomplete fields, records the server revision and stays on the saved draft URL", async () => {
  vi.mocked(api.post).mockImplementation(async (_path, input) => ({
    data: { data: { ...saved, payload: (input as { payload: ClaimDraftPayload }).payload } },
  }));
  const router = form();
  fireEvent.change(screen.getByLabelText("Hospital"), { target: { value: "Partial hospital" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Last saved/);
  expect(router.state.location.search).toBe("?draft=4");
  expect(api.post).toHaveBeenCalledWith(
    "/member-portal/claims/drafts",
    expect.objectContaining({
      memberId: 7,
      documentIds: [3],
      payload: expect.objectContaining({ claimantIdNumber: "GHA-" }),
    }),
  );
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("resumes the saved fields and attachments and sends the saved revision on update", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: {
        ...saved,
        payload: { ...payload, details: { ...payload.details, hospitalName: "Saved hospital" } },
      },
    },
  });
  vi.mocked(api.put).mockImplementation(async (_path, input) => ({
    data: {
      data: { ...saved, revision: 2, payload: (input as { payload: ClaimDraftPayload }).payload },
    },
  }));
  form("/new?draft=4");
  expect(await screen.findByLabelText("Hospital")).toHaveValue("Saved hospital");
  expect(screen.getByText("report.pdf")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Hospital"), { target: { value: "Updated hospital" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      "/member-portal/claims/drafts/4",
      expect.objectContaining({ revision: 1 }),
    ),
  );
  await screen.findByText(/^Saved\./);
});
it("offers save-and-leave without losing the original navigation destination", async () => {
  vi.mocked(api.post).mockImplementation(async (_path, input) => ({
    data: { data: { ...saved, payload: (input as { payload: ClaimDraftPayload }).payload } },
  }));
  form();
  fireEvent.change(screen.getByLabelText("Hospital"), { target: { value: "Unsaved hospital" } });
  fireEvent.click(screen.getByRole("link", { name: "Leave form" }));
  const dialog = screen.getByRole("dialog", { name: "Leave this claim?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Hospital")).toHaveValue("Unsaved hospital");
  fireEvent.click(screen.getByRole("link", { name: "Leave form" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft and leave" }));
  expect(await screen.findByText("Other page")).toBeVisible();
  expect(api.post).toHaveBeenCalledTimes(1);
});
it("retains edited fields when a conflicting save fails", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: saved } });
  vi.mocked(api.put).mockRejectedValue({
    response: { data: { message: "Draft changed in another tab" }, status: 409 },
  });
  form("/new?draft=4");
  await screen.findByLabelText("Hospital");
  fireEvent.change(screen.getByLabelText("Hospital"), { target: { value: "My unsaved work" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Draft changed in another tab");
  expect(screen.getByLabelText("Hospital")).toHaveValue("My unsaved work");
});
it("protects browser unloads for unsaved edits and does not restore an inaccessible draft as a blank form", async () => {
  const router = form();
  fireEvent.change(screen.getByLabelText("Hospital"), { target: { value: "Unsaved" } });
  const unload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "Leave form" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await screen.findByText("Other page");
  vi.mocked(api.get).mockRejectedValue({
    response: { data: { message: "Draft not found" }, status: 404 },
  });
  await act(async () => {
    await router.navigate("/new?draft=999");
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Draft not found");
  expect(screen.queryByLabelText("Hospital")).not.toBeInTheDocument();
});
it("lists drafts separately, scopes resume links and confirms revision-checked deletion", async () => {
  let deleted = false;
  vi.mocked(api.get).mockImplementation(async () => ({
    data: { data: deleted ? [] : [saved], pagination: { total: deleted ? 0 : 1, totalPages: 1 } },
  }));
  vi.mocked(api.delete).mockImplementation(async () => {
    deleted = true;
    return { data: {} };
  });
  render(
    <MemoryRouter>
      <ClaimDraftList audience="staff" />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("link", { name: "Resume" })).toHaveAttribute(
    "href",
    "/claims/new?draft=4",
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions for draft 4" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete draft" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete draft" }));
  await screen.findByText(/No saved drafts/);
  expect(api.delete).toHaveBeenCalledWith("/claims/drafts/4", { params: { revision: 1 } });
});
it("does not treat page navigation as unsaved data and identifies missing fields/documents", () => {
  expect(draftSignature(payload, [3])).toBe(draftSignature({ ...payload, page: 1 }, [3]));
  const missing = draftTasks(payload, []);
  expect(missing).toContain("Hospital name");
  expect(missing.some((item) => item.startsWith("Attach "))).toBe(true);
});
