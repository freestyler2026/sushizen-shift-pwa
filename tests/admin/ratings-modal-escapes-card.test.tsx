// tests/admin/ratings-modal-escapes-card.test.tsx
//
// The Manila back office reported on 2026-09-08 that the 5-star encoding form
// could not be used: "unable to view the full box … not fully controllable
// using the cursor … the up-and-down scrolling function is unavailable". The
// 5-star table had zero rows at the time, and Dubai's encoder hit the same
// thing.
//
// The cause was not the form. `position: fixed` is measured from the nearest
// ancestor carrying a transform, filter or backdrop-filter -- and GLASS_CARD
// carries `backdrop-blur-sm`, with `overflow-hidden` on the card root as well.
// A modal rendered inside such a card is confined to the card's box and
// clipped, with no scrollbar to reach the rest of it. An empty card is short,
// which is why the 5-star form was unusable while the low-rating form -- the
// same bug, in a card holding 2,454 rows -- merely felt cramped.
//
// jsdom computes no layout, so this cannot assert pixels. What it can assert is
// the thing that makes the pixels right: the overlay must not be a descendant
// of the clipping card.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const CARD = "rounded-2xl backdrop-blur-sm overflow-hidden";

describe("rating encoding forms escape the card that would clip them", () => {
  it.each([
    ["HighRatingFormModal", () => import("@/components/analytics/HighRatingFormModal")],
    ["LowRatingFormModal", () => import("@/components/analytics/LowRatingFormModal")],
  ])("%s renders outside its card, not inside it", async (name, load) => {
    const mod = (await load()) as Record<string, React.ComponentType<Record<string, unknown>>>;
    const Modal = mod[name];
    render(
      <div data-testid="card" className={CARD}>
        <Modal city="manila" onClose={() => {}} onSave={async () => {}} busy={false} />
      </div>,
    );

    const dialog = await screen.findByRole("dialog");
    const card = screen.getByTestId("card");

    // The whole point: the dialog is not under the blurring, clipping card.
    expect(card.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("keeps a height limit on the panel, so a long form can still be scrolled", async () => {
    const { HighRatingFormModal } = await import("@/components/analytics/HighRatingFormModal");
    render(
      <div className={CARD}>
        <HighRatingFormModal city="manila" onClose={() => {}} onSave={async () => {}} busy={false} />
      </div>,
    );
    const dialog = await screen.findByRole("dialog");
    // Escaping the card is not enough on its own: the form is taller than a
    // phone, so the panel itself has to scroll.
    const panel = dialog.querySelector(".overflow-y-auto");
    expect(panel).toBeTruthy();
    expect(panel?.className).toMatch(/max-h-\[/);
  });
});
