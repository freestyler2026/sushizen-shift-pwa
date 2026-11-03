import { describe, expect, it } from "vitest";
import { ACTION_NOUN, isNetworkFailure } from "@/lib/attendanceErrors";

// Peter Villafuerte, 3 Nov 2026: Break Out at 13:39 never reached the server; the screen said only "Failed to fetch".
describe("a punch that never reached the server", () => {
  it("is recognised however the browser words it", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"), "Failed to fetch")).toBe(true);
    expect(isNetworkFailure(new TypeError("Load failed"), "Load failed")).toBe(true);
    expect(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource."), "NetworkError when attempting to fetch resource.")).toBe(true);
  });
  it("is not confused with the server refusing the punch", () => {
    expect(isNetworkFailure(new Error("Not currently on break"), "Not currently on break")).toBe(false);
    expect(isNetworkFailure(new Error("Authentication failed"), "Authentication failed")).toBe(false);
  });
  it("names the punch that was not recorded", () => {
    expect(ACTION_NOUN.break_out).toBe("break end");
    expect(ACTION_NOUN.checkout).toBe("clock-out");
  });
});
