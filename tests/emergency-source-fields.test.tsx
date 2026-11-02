import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import EmergencySourceFields, { sourceLabel, sourceProblem } from "@/components/EmergencySourceFields";

// Owner, 2026-11-02: October's 24 completed emergency requests said nothing of where the
// goods came from, so another site's stock reached a store at no cost to it.
describe("emergency request source", () => {
  it("asks where, which supplier or store, and how much -- as the server does", () => {
    expect(sourceProblem({ type: "", name: "" }, "Taft", "100")).toBe("Choose where the goods came from.");
    expect(sourceProblem({ type: "supplier", name: " " }, "Taft", "100")).toBe("Name the supplier.");
    expect(sourceProblem({ type: "store", name: "" }, "Taft", "100")).toBe("Choose the store the goods came from.");
    expect(sourceProblem({ type: "store", name: "taft" }, "Taft", "100")).toBe("The goods cannot come from the store that asked for them.");
    expect(sourceProblem({ type: "ck", name: "" }, "Taft", "")).toBe("Enter the amount of the goods.");
    expect(sourceProblem({ type: "ck", name: "" }, "Taft", "-5")).toBe("The amount cannot be negative.");
    expect(sourceProblem({ type: "store", name: "Cubao" }, "Taft", "14250")).toBe("");
    expect(sourceLabel("store", "Cubao")).toBe("From another store — Cubao");
    expect(sourceLabel("ck", "")).toBe("From CK");
  });

  it("shows the supplier name box only for a supplier", () => {
    const { rerender } = render(<EmergencySourceFields value={{ type: "supplier", name: "Marhon" }} onChange={() => {}} requestStore="Taft" />);
    expect(screen.getByLabelText("Supplier name")).toBeTruthy();
    rerender(<EmergencySourceFields value={{ type: "ck", name: "" }} onChange={() => {}} requestStore="Taft" />);
    expect(screen.queryByLabelText("Supplier name")).toBeNull();
  });
});
