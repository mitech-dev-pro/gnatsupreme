import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import api from "@/lib/api";
import { GeographyTab } from "./GeographyTab";
import type { DistrictAlias } from "./Setup.shared";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

it("renders valid table rows while aliases load, then displays the resolved aliases", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  type AliasResponse = { data: { data: DistrictAlias[] } };
  let resolveAliases!: (value: AliasResponse) => void;
  const pending = new Promise<AliasResponse>((resolve) => {
    resolveAliases = resolve;
  });
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/districts/aliases") return pending;
    return { data: { data: [] } };
  });

  try {
    const { container } = render(<GeographyTab canEdit />);
    await waitFor(() => {
      const rows = container.querySelectorAll('tr[aria-hidden="true"]');
      expect(rows).toHaveLength(5);
      expect(rows[0]?.children).toHaveLength(4);
    });
    for (const row of container.querySelectorAll('tr[aria-hidden="true"]')) {
      expect(row.parentElement?.tagName).toBe("TBODY");
      expect(row.parentElement?.parentElement?.tagName).toBe("TABLE");
    }
    expect(errors).not.toHaveBeenCalled();

    await act(async () => {
      resolveAliases({
        data: {
          data: [
            {
              id: 1,
              alias: "Test district spelling",
              district: { id: 1, name: "Test District", region: { id: 1, name: "Test Region" } },
              createdBy: null,
              createdAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        },
      });
    });
    expect(await screen.findByText("Test district spelling")).toBeInTheDocument();
    expect(screen.getByText("Test District (Test Region)")).toBeInTheDocument();
    expect(container.querySelector('tr[aria-hidden="true"]')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
    vi.mocked(api.get).mockReset();
  }
});
