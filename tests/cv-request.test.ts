import { describe, it, expect } from "vitest";
import { cvStateOf, openedSinceAsk, type CvFacts } from "@/lib/cv-request";

/**
 * The nine rows sitting in New on 2026-09-16, exactly as the board receives
 * them, plus the two shapes the board cannot show me yet.
 *
 * "arrived" has happened zero times in production -- nobody asked for a CV has
 * sent one back -- so the live board proves nothing about it. That is the whole
 * reason this file exists: a badge nobody can make appear is a badge nobody has
 * checked (lesson 60).
 */
const REAL_NEW: Array<[string, CvFacts, string]> = [
  ["Maribel Mendoza", {
    resume_screening_id: null, cv_asked_at: "2026-09-16T13:46:03.496841+00:00",
    cv_asked_how: "cv_sent", cv_link_made_at: "2026-09-16T13:46:03.496841+00:00",
  }, "sent"],
  ["Teddy Escalante", {
    resume_screening_id: null, cv_asked_at: "2026-09-15T13:35:55.064700+00:00",
    cv_asked_how: "cv_sent", cv_link_made_at: "2026-09-15T13:35:55.064700+00:00",
  }, "sent"],
  ["Jonas Adathazhe John", {
    resume_screening_id: null, cv_asked_at: "2026-09-15T13:37:19.252769+00:00",
    cv_asked_how: "cv_sent", cv_link_made_at: "2026-09-15T13:37:19.252769+00:00",
  }, "sent"],
  // The second Dominick Mariano row: a duplicate nobody has merged, and the
  // only one of the nine that was never given a CV link.
  ["Dominick Mariano (dup)", {
    resume_screening_id: null, cv_asked_at: null,
    cv_asked_how: null, cv_link_made_at: "2026-09-15T13:40:00.847153+00:00",
  }, "made"],
];

describe("cvStateOf — the rows the board actually holds", () => {
  it.each(REAL_NEW)("%s", (_name, facts, want) => {
    expect(cvStateOf(facts)).toBe(want);
  });

  it("an untouched applicant asks for nothing", () => {
    expect(cvStateOf({})).toBe("none");
  });
});

describe("cvStateOf — the CV landing", () => {
  it("a CV that arrives after we asked is the loud state", () => {
    expect(cvStateOf({
      resume_screening_id: 412,
      cv_asked_at: "2026-09-15T13:35:55Z",
      cv_asked_how: "cv_sent",
      cv_link_made_at: "2026-09-15T13:35:55Z",
    })).toBe("arrived");
  });

  it("a link built but never sent still counts as asked once it lands", () => {
    // Otherwise the eight people whose links predate any send record would go
    // silent on arrival -- which is the bug this change exists to remove.
    expect(cvStateOf({
      resume_screening_id: 412,
      cv_asked_at: null,
      cv_link_made_at: "2026-09-15T13:40:00Z",
    })).toBe("arrived");
  });

  it("a CV that came with the application stays quiet", () => {
    // 231 of the 437 people on the board are this. Shouting about them would
    // bury the ones that are news (lesson 39).
    expect(cvStateOf({ resume_screening_id: 98 })).toBe("on_file");
  });

  it("the CV outranks the chasing, so nobody is asked twice", () => {
    expect(cvStateOf({
      resume_screening_id: 98, cv_asked_at: "2026-09-15T13:35:55Z",
      cv_asked_how: "cv_copied",
    })).toBe("arrived");
  });
});

describe("openedSinceAsk — only ever says yes", () => {
  it("an open after the link was built counts", () => {
    expect(openedSinceAsk({
      cv_link_made_at: "2026-09-15T13:40:00Z",
      link_opened_at: "2026-09-16T02:11:00Z",
    })).toBe(true);
  });

  it("the visit they made when they applied does not count", () => {
    // Every one of the twelve looks like this: client_seen_at is days older
    // than the invite because it was set while they filled in the form.
    expect(openedSinceAsk({
      cv_link_made_at: "2026-09-15T13:40:00Z",
      link_opened_at: "2026-09-10T09:23:52Z",
    })).toBe(false);
  });

  it("no open on record is not a claim that they ignored it", () => {
    expect(openedSinceAsk({ cv_link_made_at: "2026-09-15T13:40:00Z" })).toBe(false);
    expect(openedSinceAsk({ link_opened_at: "2026-09-16T02:11:00Z" })).toBe(false);
    expect(openedSinceAsk({})).toBe(false);
  });

  it("unparseable timestamps stay silent rather than guess", () => {
    expect(openedSinceAsk({
      cv_link_made_at: "not a date", link_opened_at: "2026-09-16T02:11:00Z",
    })).toBe(false);
  });
});
