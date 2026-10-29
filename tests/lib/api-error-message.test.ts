import { describe, expect, it } from "vitest";
import { _extractErrorMessage } from "@/lib/api";

describe("_extractErrorMessage", () => {
  it("reads the server's detail", () => {
    expect(_extractErrorMessage('{"detail":"month is not available yet"}', 400)).toBe("month is not available yet");
  });
  // My Shift printed Heroku's "Application Error" page as raw markup, 2026-10-27.
  it("never shows an HTML error page as text", () => {
    const html = '<!DOCTYPE html> <html> <head> <title>Application Error</title>';
    expect(_extractErrorMessage(html, 503)).toBe("The server is restarting or unavailable. Please try again in a minute.");
    expect(_extractErrorMessage(html, 404)).toBe("Request failed (HTTP 404).");
  });
  it("keeps plain text and falls back to the status", () => {
    expect(_extractErrorMessage("Bad gateway", 502)).toBe("Bad gateway");
    expect(_extractErrorMessage("", 500)).toBe("HTTP 500");
  });
});
