/**
 * Driving SelectDark from tests.
 *
 * These pages used native <select> elements, so the tests reach for them the
 * way you reach for a select: getByDisplayValue("Dubai") to assert what is
 * chosen, and fireEvent.change to choose something else. SelectDark is a
 * button and a portalled listbox, so neither works, and no amount of ARIA on
 * the component can make them: a display value belongs to a form control that
 * holds a value, and a change event needs one to fire on.
 *
 * The translation is direct, though. "The select whose display value is Dubai"
 * becomes "the combobox showing Dubai", and "change it to Manila" becomes
 * "open it and click Manila" -- which is what a person does anyway.
 *
 * Finding them by the text they show rather than by an accessible name is
 * deliberate: most SelectDark instances are still rendered without one, so on
 * a page with two of them both answer to "— Select —". Naming them properly is
 * worth doing, and until it is done this is the cut that actually
 * distinguishes one control from another.
 */

import { fireEvent, screen, within } from "@testing-library/react";

/** The combobox currently showing `text` — the SelectDark equivalent of
 *  getByDisplayValue. Throws with the list of what was on screen, because
 *  "undefined is not an element" tells you nothing about which select moved. */
export function selectShowing(text: string): HTMLElement {
  const all = screen.queryAllByRole("combobox");
  // Text first, then the value it holds. getByDisplayValue was given whichever
  // of the two the author had to hand -- "App Bug Report" in one test and
  // "app-private-report" in the next -- and both name the same control.
  // Exact first, then contains. "All" would otherwise match "All Statuses",
  // and a test asking for one filter would silently drive another.
  const hit = all.find((el) => (el.textContent || "").trim() === text)
    ?? all.find((el) => (el as HTMLElement).dataset.value === text)
    ?? all.find((el) => (el.textContent || "").includes(text));
  if (!hit) {
    const shown = all.map((el) => {
      const v = (el as HTMLElement).dataset.value;
      return `"${(el.textContent || "").trim()}"${v ? ` (=${v})` : ""}`;
    }).join(", ");
    throw new Error(
      `No combobox showing or holding "${text}". ${all.length} on screen: ${shown || "(none)"}`,
    );
  }
  return hit;
}

/** The combobox currently holding `value`. getByDisplayValue was sometimes
 *  given the option's value rather than its wording, and that is a different
 *  question -- ask it directly. */
export function selectWithValue(value: string): HTMLElement {
  const all = screen.queryAllByRole("combobox");
  const hit = all.find((el) => (el as HTMLElement).dataset.value === value);
  if (!hit) {
    const held = all.map((el) => `"${(el as HTMLElement).dataset.value ?? ""}"`).join(", ");
    throw new Error(
      `No combobox holding "${value}". ${all.length} on screen: ${held || "(none)"}`,
    );
  }
  return hit;
}

/** Assert a select is showing `text`. Reads like the assertion it replaces. */
export function expectSelectShowing(text: string): HTMLElement {
  return selectShowing(text);
}

/** Open the select currently showing `showing`, and click `optionLabel`.
 *  The list is portalled to document.body, so it is searched from the screen
 *  rather than from within the trigger. */
export function chooseOption(showing: string, optionLabel: string | RegExp): void {
  fireEvent.click(selectShowing(showing));
  const listbox = screen.getByRole("listbox");
  fireEvent.click(within(listbox).getByRole("option", { name: optionLabel }));
}

/** Open the select showing `showing` and pick the option whose value is
 *  `value` -- the direct translation of
 *  fireEvent.change(select, { target: { value } }). */
export function chooseValue(showing: string, value: string): void {
  fireEvent.click(selectShowing(showing));
  const listbox = screen.getByRole("listbox");
  const opt = listbox.querySelector(`[data-value="${CSS.escape(value)}"]`);
  if (!opt) {
    const had = Array.from(listbox.querySelectorAll("[data-value]"))
      .map((o) => (o as HTMLElement).dataset.value).join(", ");
    throw new Error(`No option with value "${value}". Offered: ${had || "(none)"}`);
  }
  fireEvent.click(opt);
}

/** The values a select offers -- what the page receives, not what it shows.
 *  Replaces reading `select.options` off a native element. */
export function optionValues(showing: string): string[] {
  fireEvent.click(selectShowing(showing));
  const values = Array.from(
    screen.getByRole("listbox").querySelectorAll("[data-value]"),
  ).map((o) => (o as HTMLElement).dataset.value ?? "");
  fireEvent.click(selectShowing(showing)); // leave it closed
  return values;
}

/** The labels a select offers, for tests that assert on the option list
 *  without choosing anything. */
export function optionLabels(showing: string): string[] {
  fireEvent.click(selectShowing(showing));
  const labels = within(screen.getByRole("listbox"))
    .queryAllByRole("option")
    .map((o) => (o.textContent || "").trim());
  fireEvent.click(selectShowing(showing)); // leave it closed
  return labels;
}
