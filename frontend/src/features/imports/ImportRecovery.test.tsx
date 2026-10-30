import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
  renderHook,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import UploadMembers from "./UploadMembers";
import ImportReview from "./ImportReview";
import { useImportReview } from "./useImportReview";
import { importStage } from "./importStatus";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "SUPER_ADMIN" } }) }));
vi.mock("@/lib/useDistricts", () => ({ useDistricts: () => ({ districts: [] }) }));
const job = {
  id: 42,
  status: "COMPLETED",
  totalRows: 5,
  readyRows: 2,
  invalidRows: 1,
  duplicateRows: 1,
  unmatchedRows: 1,
  importedRows: 0,
  processedRows: 5,
  file: { originalName: "members.csv", sizeBytes: 20 },
  uploadedBy: { id: 1, fullName: "Staff" },
  createdAt: "2026-10-29T12:00:00.000Z",
  updatedAt: "2026-10-29T12:00:00.000Z",
};
const row = {
  id: 1,
  rowNumber: 2,
  controllerId: "TEST1234",
  fullName: "Test Member",
  status: "READY",
  issues: [],
  districtName: "Test District",
};
beforeEach(() => vi.clearAllMocks());
function review() {
  render(
    <MemoryRouter initialEntries={["/members/upload/42"]}>
      <Routes>
        <Route path="/members/upload/:id" element={<ImportReview />} />
      </Routes>
    </MemoryRouter>,
  );
}
function readApi() {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url?.endsWith("/rows")
      ? { data: [row], pagination: { total: 1, totalPages: 1 } }
      : { data: job },
  }));
}

it("distinguishes validated rows from enrolled members", () => {
  expect(importStage(job).label).toBe("Ready for enrollment");
  expect(importStage({ ...job, readyRows: 0, importedRows: 2 }).label).toBe(
    "Enrollment finished with skipped rows",
  );
  expect(
    importStage({
      ...job,
      readyRows: 0,
      importedRows: 5,
      invalidRows: 0,
      duplicateRows: 0,
      unmatchedRows: 0,
    }).label,
  ).toBe("Enrollment complete");
});

it("requires confirmation before enrolling ready members and keeps failures in the dialog", async () => {
  readApi();
  vi.mocked(api.post).mockRejectedValue({
    response: { data: { message: "Another attempt started. Refresh this import." } },
  });
  review();
  fireEvent.click(await screen.findByRole("button", { name: "Enroll 2 ready members" }));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm enrollment" }),
  );
  await waitFor(() =>
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "Another attempt started",
    ),
  );
  expect(api.post).toHaveBeenCalledTimes(1);
});

it("retains loaded rows and the job after failed refreshes without showing a false empty result", async () => {
  readApi();
  review();
  await screen.findByText("Test Member");
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh import" }));
  await screen.findByText(/Unable to refresh this import/);
  expect(screen.getByText("Test Member")).toBeInTheDocument();
  expect(screen.queryByText("No rows found")).not.toBeInTheDocument();
});

it("offers saved imports after duplicate upload responses and retains the selected file", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { data: [], pagination: { total: 0, totalPages: 1 } },
  });
  vi.mocked(api.post).mockRejectedValue({
    response: {
      data: { message: "This file already has an import.", duplicateImport: { id: 42 } },
    },
  });
  render(
    <MemoryRouter>
      <UploadMembers />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Teaching staff" }));
  const file = new File(["Controller ID,Full Name\nTEST1234,Test Member"], "members.csv", {
    type: "text/csv",
  });
  fireEvent.change(screen.getByLabelText("Member import file"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload & Validate" }));
  expect(await screen.findByRole("link", { name: "Open saved import #42" })).toHaveAttribute(
    "href",
    "/members/upload/42",
  );
  expect(screen.getByRole("button", { name: /members.csv/ })).toBeInTheDocument();
});

it("paginates history on the server and numbers rows across pages", async () => {
  vi.mocked(api.get).mockImplementation(async (_path, config) => {
    const page = (config?.params as { page?: number } | undefined)?.page ?? 1;
    return { data: { data: [{ ...job, id: page }], pagination: { total: 11, totalPages: 2 } } };
  });
  render(
    <MemoryRouter>
      <UploadMembers />
    </MemoryRouter>,
  );
  await screen.findByText("Page 1 of 2 · 11 imports");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2 of 2 · 11 imports");
  expect(screen.getByRole("cell", { name: "11" })).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith(
    "/imports/members",
    expect.objectContaining({ params: { page: 2, limit: 10, status: undefined } }),
  );
});

it("ignores obsolete row responses after filters change", async () => {
  let resolveOld!: (value: unknown) => void;
  vi.mocked(api.get).mockImplementation(async (path, config) => {
    if (!path?.endsWith("/rows")) return { data: { data: job } };
    if (!(config?.params as { status?: string } | undefined)?.status)
      return (await new Promise<unknown>((resolve) => {
        resolveOld = resolve;
      })) as never;
    return {
      data: {
        data: [{ ...row, status: "INVALID", fullName: "Filtered Member" }],
        pagination: { total: 1, totalPages: 1 },
      },
    };
  });
  const { result } = renderHook(useImportReview, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={["/42"]}>
        <Routes>
          <Route path="/:id" element={children} />
        </Routes>
      </MemoryRouter>
    ),
  });
  await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
  act(() => result.current.setRowStatus("INVALID"));
  await waitFor(() => expect(result.current.rows[0]?.fullName).toBe("Filtered Member"));
  await act(async () =>
    resolveOld({ data: { data: [row], pagination: { total: 1, totalPages: 1 } } }),
  );
  expect(result.current.rows[0]?.fullName).toBe("Filtered Member");
});

it("lets staff inspect source values without starting enrollment", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url?.endsWith("/rows")
      ? {
          data: [{ ...row, rawData: { School: "Source School", Phone: "0244000000" } }],
          pagination: { total: 1, totalPages: 1 },
        }
      : { data: job },
  }));
  review();
  fireEvent.click(await screen.findByRole("button", { name: "View row" }));
  expect(screen.getByText("Source values for spreadsheet row 2")).toBeVisible();
  expect(screen.getByText("Source School")).toBeVisible();
  expect(screen.getByText("0244000000")).toBeVisible();
  expect(api.post).not.toHaveBeenCalled();
});
