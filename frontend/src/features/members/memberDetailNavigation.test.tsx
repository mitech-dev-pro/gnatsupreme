import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import MemberDetail from "./MemberDetail";
import { useMemberDetail } from "./useMemberDetail";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, role: "SUPER_ADMIN" } }) }));
vi.mock("@/lib/useDistricts", () => ({ useDistricts: () => ({ districts: [] }) }));
const fixture = (id = 17) => ({
  id,
  fullName: `Member ${id}`,
  controllerId: `TEST${id}`,
  phone: "0244000000",
  phoneVerifiedAt: null,
  email: null,
  ghanaCardId: null,
  gender: "FEMALE",
  employmentCategory: "TEACHING",
  placeOfWork: null,
  school: "School",
  status: "ACTIVE",
  report20Matched: true,
  createdAt: "2026-10-29T12:00:00.000Z",
  district: null,
  region: null,
  spouse: null,
  beneficiaries: [],
  createdBy: null,
});
beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: {
      data: url?.endsWith("/workflow") ? [] : fixture(Number(String(url).split("/").at(-1))),
    },
  }));
});
function setup(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/members/:id" element={<MemberDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("keeps the safe list context after a direct profile refresh and rejects external return links", async () => {
  setup("/members/17?returnTo=https%3A%2F%2Fexample.test");
  await screen.findByRole("heading", { name: "Member 17" });
  expect(screen.getByRole("link", { name: "Back to members" })).toHaveAttribute("href", "/members");
});

it("opens the existing edit form from an edit link without losing the return destination", async () => {
  setup(
    `/members/17?edit=member&returnTo=${encodeURIComponent("/members?status=ACTIVE&page=2#member-17")}`,
  );
  expect(await screen.findByDisplayValue("Member 17")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to members" })).toHaveAttribute(
    "href",
    "/members?status=ACTIVE&page=2#member-17",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByDisplayValue("Member 17")).not.toBeInTheDocument());
});

it("focuses the workflow section after its member record loads", async () => {
  setup("/members/17#workflow");
  await screen.findByRole("heading", { name: "Member 17" });
  await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "workflow"));
});

function HookView() {
  const state = useMemberDetail();
  return (
    <>
      <output data-testid="member">{state.member?.fullName ?? "Loading"}</output>
      <output data-testid="password">{state.passwordResult ?? "None"}</output>
      <button onClick={() => void state.generatePassword()}>Generate</button>
      <Link to="/members/18">Next member</Link>
    </>
  );
}
function hookView() {
  render(
    <MemoryRouter initialEntries={["/members/17"]}>
      <Routes>
        <Route path="/members/:id" element={<HookView />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("ignores an obsolete details response when switching members quickly", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/members/17")
      return (await new Promise<unknown>((resolve) => {
        finish = resolve;
      })) as never;
    return { data: { data: url?.endsWith("/workflow") ? [] : fixture(18) } };
  });
  hookView();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("link", { name: "Next member" }));
  await waitFor(() => expect(screen.getByTestId("member")).toHaveTextContent("Member 18"));
  await act(async () => finish({ data: { data: fixture(17) } }));
  expect(screen.getByTestId("member")).toHaveTextContent("Member 18");
});

it("never displays a previous member's delayed password result under the next member", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api.post).mockImplementation(
    async () =>
      (await new Promise<unknown>((resolve) => {
        finish = resolve;
      })) as never,
  );
  hookView();
  await waitFor(() => expect(screen.getByTestId("member")).toHaveTextContent("Member 17"));
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  fireEvent.click(screen.getByRole("link", { name: "Next member" }));
  await waitFor(() => expect(screen.getByTestId("member")).toHaveTextContent("Member 18"));
  await act(async () => finish({ data: { password: "old-member-temporary-value" } }));
  expect(screen.getByTestId("password")).toHaveTextContent("None");
  expect(screen.queryByText("old-member-temporary-value")).not.toBeInTheDocument();
});
