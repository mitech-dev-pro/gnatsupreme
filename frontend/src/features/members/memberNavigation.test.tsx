import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import MembersList from "./MembersList";
import { memberProfileLink, safeMemberReturnTo } from "./memberNavigation";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { id: 51, role: "SUPER_ADMIN" } }),
}));
vi.mock("@/lib/useDistricts", () => ({ useDistricts: () => ({ districts: [] }) }));
vi.mock("@/lib/useSchools", () => ({ useSchools: () => ({ schools: [] }) }));
const member = {
  id: 17,
  fullName: "Ama Member",
  controllerId: "TEST17",
  phone: "0244000000",
  school: "Test School",
  status: "ACTIVE",
  createdAt: "2026-10-29T12:00:00.000Z",
  district: null,
  spouse: null,
};
const stats = {
  totalMembers: 15,
  newThisMonth: 0,
  activeCoverage: 15,
  activeCoveragePct: 100,
  registeredMembers: 5,
  report20Mismatch: 0,
  removedThisMonth: 0,
  removedBreakdownNote: "None",
};
let removed = false;
function Profile() {
  const location = useLocation();
  return (
    <>
      <h1>Profile</h1>
      <Link
        to={safeMemberReturnTo(new URLSearchParams(location.search).get("returnTo")) ?? "/members"}
      >
        Back to members
      </Link>
      <button
        onClick={() => {
          removed = true;
        }}
      >
        Move outside filter
      </button>
      <p data-testid="profile-url">{location.search}</p>
    </>
  );
}
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}
function setup(path = "/members?search=Ama&page=2&limit=5&status=ACTIVE") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/members" element={<MembersList />} />
        <Route path="/members/:id" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(api.get).mockReset();
  removed = false;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.tagName === "TR" ? [new DOMRect(0, 200, 300, 40)] : []) as unknown as DOMRectList;
  });
  vi.mocked(api.get).mockImplementation(async (path) => ({
    data: path?.endsWith("/stats")
      ? { data: stats }
      : { data: removed ? [] : [member], pagination: { total: 15, totalPages: 3 } },
  }));
});

it("accepts only local member-list return destinations", () => {
  expect(safeMemberReturnTo("/members?search=Ama&page=2#member-17")).toBe(
    "/members?search=Ama&page=2#member-17",
  );
  for (const value of [
    "https://example.test",
    "//example.test/members",
    "/member/claims",
    "/members/17",
    "/members/../claims",
    "/members#wrong",
    "/members\\evil",
    "/members\n",
  ])
    expect(safeMemberReturnTo(value)).toBeNull();
});

it("keeps filters and row identifiers in profile, edit and workflow links", () => {
  const list = "/members?school=Test+School&page=2&limit=5";
  for (const action of ["profile", "edit", "workflow"] as const) {
    const url = new URL(memberProfileLink(17, list, action), "https://example.test");
    expect(url.searchParams.get("returnTo")).toBe(`${list}#member-17`);
    expect(url.searchParams.get("edit")).toBe(action === "edit" ? "member" : null);
    expect(url.hash).toBe(action === "workflow" ? "#workflow" : "");
  }
});

it("returns to the same query and focuses and marks the viewed row", async () => {
  setup();
  fireEvent.click((await screen.findByText("Ama Member")).closest("a")!);
  const back = await screen.findByRole("link", { name: "Back to members" });
  expect(back).toHaveAttribute(
    "href",
    "/members?search=Ama&page=2&limit=5&status=ACTIVE#member-17",
  );
  fireEvent.click(back);
  await screen.findByText("Ama Member");
  await waitFor(() => expect(document.activeElement).toHaveAttribute("data-member-row", "17"));
  expect(screen.getByLabelText("Search members")).toHaveValue("Ama");
  expect(screen.getAllByText("Last viewed").length).toBeGreaterThan(0);
  expect(screen.getByTestId("location")).toHaveTextContent(
    "page=2&limit=5&status=ACTIVE#member-17",
  );
});

it("restores the viewed row when using browser Back without adding a return hash", async () => {
  setup("/members?search=browser-pop&page=2&limit=5");
  fireEvent.click((await screen.findByText("Ama Member")).closest("a")!);
  await screen.findByRole("heading", { name: "Profile" });
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() => expect(document.activeElement).toHaveAttribute("data-member-row", "17"));
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/members?search=browser-pop&page=2&limit=5",
  );
});

it("keeps filters and explains when the viewed member leaves the result", async () => {
  setup("/members?search=removed-member&page=2&limit=5&status=ACTIVE");
  fireEvent.click((await screen.findByText("Ama Member")).closest("a")!);
  fireEvent.click(await screen.findByRole("button", { name: "Move outside filter" }));
  fireEvent.click(screen.getByRole("link", { name: "Back to members" }));
  expect(
    await screen.findByText(/last viewed member is no longer on this page/),
  ).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("status=ACTIVE#member-17");
});
