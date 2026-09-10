// tests/apply/apply-cv-required.test.tsx
//
// The CV is required, and it is asked for **on the form**.
//
// It used to be offered on the screen after submitting, behind the voice
// interview's consent step, and it said "optional". Of the 22 applications
// that arrived while that step existed, 11 never consented and so never saw
// it; of the 11 who did, 6 attached a CV. Not one applicant has ever pressed
// "I do not have one". So the button was never the leak, and removing it
// alone would have changed nothing — the step was in the wrong place.
// These tests pin the two things that actually make the difference: the form
// will not send without a file, and the file goes up on the same press.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
// The screening component is a page of its own and is tested separately; here
// it would only pull the load request into every assertion about the form.
vi.mock("@/components/apply/VoiceScreening", () => ({
  default: ({ cvIn }: { cvIn?: boolean }) => <div>screening cvIn={String(!!cvIn)}</div>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function reply(status: number, body: unknown) {
  return Promise.resolve({
    ok: status < 400, status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function cvFile(name = "cv.pdf", type = "application/pdf", size = 40_000) {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** Everything the server insists on, so the only thing a test can be missing
 *  is the one it is about. */
function fillTheForm() {
  fireEvent.change(screen.getByPlaceholderText("Juan Dela Cruz"), { target: { value: "Ana Cruz" } });
  fireEvent.change(screen.getByPlaceholderText("0917 123 4567"), { target: { value: "09171234567" } });
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "kitchen" } });
  fireEvent.change(selects[1], { target: { value: "TAFT" } });
  fireEvent.change(selects[2], { target: { value: "1_3y" } });
  fireEvent.click(screen.getByText("This is my first job"));
}

async function renderApply() {
  const Apply = (await import("@/app/apply/page")).default;
  render(<Apply />);
  await screen.findByText("Send application");
}

function fileInput(): HTMLInputElement {
  const el = document.querySelector('input[type="file"]');
  if (!el) throw new Error("no file input on the form");
  return el as HTMLInputElement;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => reply(200, { ok: true, voice: { token: "tok" } }));
});

describe("the CV on the application form", () => {
  it("will not send an application without one, and says which thing is missing", async () => {
    await renderApply();
    fillTheForm();
    fireEvent.click(screen.getByText("Send application"));

    // Not "complete the highlighted fields": every box is filled in, and that
    // sentence points at nothing the applicant can see is wrong.
    expect(await screen.findByText(/Please attach your CV/)).toBeTruthy();
    // Nothing was sent, so nothing was lost either.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Thank you")).toBeNull();
  });

  it("never calls it optional", async () => {
    await renderApply();
    expect(screen.queryByText(/CV.*optional|optional.*CV/i)).toBeNull();
    expect(screen.getByText("Your CV")).toBeTruthy();
  });

  it("sends the file on the same press, once the application has a token", async () => {
    await renderApply();
    fillTheForm();
    fireEvent.change(fileInput(), { target: { files: [cvFile()] } });
    expect(await screen.findByText(/cv\.pdf/)).toBeTruthy();

    fireEvent.click(screen.getByText("Send application"));
    expect(await screen.findByText("Thank you")).toBeTruthy();

    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/api/apply");
    expect(urls).toContain("/api/voice/tok/resume");
    // The application goes first: the token the upload hangs on comes from it.
    expect(urls.indexOf("/api/apply")).toBeLessThan(urls.indexOf("/api/voice/tok/resume"));
    // And the screening is told, so it does not ask for the same file again.
    expect(screen.getByText("screening cvIn=true")).toBeTruthy();
  });

  it("keeps the application when the upload fails, and says the CV did not go", async () => {
    // The application is already saved at this point. Turning that into an
    // error screen would cost the applicant's phone number to save a file.
    mockFetch.mockImplementation((url: unknown) =>
      String(url).endsWith("/resume") ? reply(500, {}) : reply(200, { ok: true, voice: { token: "tok" } }));
    await renderApply();
    fillTheForm();
    fireEvent.change(fileInput(), { target: { files: [cvFile()] } });
    fireEvent.click(screen.getByText("Send application"));

    expect(await screen.findByText("Thank you")).toBeTruthy();
    expect(screen.getByText(/the CV did not upload/)).toBeTruthy();
    // The step is left in front of them rather than marked done.
    expect(screen.getByText("screening cvIn=false")).toBeTruthy();
  });

  it("refuses a Word file too big to shrink, before it is picked up", async () => {
    // A .docx cannot be compressed in the browser, so an oversized one has to
    // be reported here — the alternative is a Vercel 413 that comes back as
    // plain text and loses its reason (lesson 24).
    await renderApply();
    const big = cvFile("cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 9_000_000);
    fireEvent.change(fileInput(), { target: { files: [big] } });
    expect(await screen.findByText(/The limit is/)).toBeTruthy();
    expect(screen.queryByText(/cv\.docx/)).toBeNull();
  });

  it("keeps the chosen file when the picker is opened and cancelled", async () => {
    // Backing out of the picker fires a change with no files. Clearing on that
    // told people their CV had not been attached when it had.
    await renderApply();
    fireEvent.change(fileInput(), { target: { files: [cvFile()] } });
    expect(await screen.findByText(/cv\.pdf/)).toBeTruthy();
    fireEvent.change(fileInput(), { target: { files: [] } });
    await waitFor(() => expect(screen.getByText(/cv\.pdf/)).toBeTruthy());
  });
});
