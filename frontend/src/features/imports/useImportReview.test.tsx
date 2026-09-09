import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useImportReview } from "./useImportReview";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "42" }) }));
vi.mock("@/lib/useDistricts", () => ({ useDistricts: () => ({ districts: [] }) }));

beforeEach(() => vi.resetAllMocks());

it("loads the selected import and keeps pagination and filters in requests", async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url?.endsWith("/rows")
      ? { data: [], pagination: { totalPages: 3 } }
      : { data: { id: 42, status: "COMPLETED" } },
  }));
  const { result } = renderHook(useImportReview);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.job?.id).toBe(42);
  expect(result.current.totalPages).toBe(3);
  act(() => {
    result.current.setPage(2);
    result.current.setRowStatus("INVALID");
  });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith("/imports/members/42/rows", {
      params: { page: 2, limit: 50, status: "INVALID" },
    }),
  );
});

it("leaves the loading state and reports failed requests", async () => {
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(useImportReview);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("Unable to load rows.");
  expect(result.current.job).toBeNull();
});
