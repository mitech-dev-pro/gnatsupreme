import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress, ReadOnlyField, SectionTitle } from "./ClaimFormLayout";

describe("shared claim layout", () => {
  it("announces each flow's current step", () => {
    const { rerender } = render(
      <Progress page={0} labels={["Claim details", "Payment and declaration"]} />,
    );
    expect(screen.getByLabelText("Step 1 of 2")).toBeInTheDocument();
    rerender(
      <Progress page={1} labels={["Policy and identification", "Payment and declaration"]} />,
    );
    expect(screen.getByLabelText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByTitle("Policy and identification")).toBeInTheDocument();
  });
  it("keeps identification read-only and sections navigable by heading", () => {
    render(
      <>
        <SectionTitle>Identification</SectionTitle>
        <ReadOnlyField label="Staff ID" value="123456" />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Identification", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
