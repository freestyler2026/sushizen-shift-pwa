/** Where one applicant's CV stands.
 *
 *  Pulled out of the board so it can be exercised against real rows. The
 *  interesting state -- a CV arriving after somebody asked for it -- has
 *  happened zero times in production so far, so nothing on the board would
 *  have proved it renders. See tests/cv-request.test.ts.
 */
export type CvState =
  /** Nobody has done anything about a CV. */
  | "none"
  /** A link exists, but no message has been recorded leaving the page. */
  | "made"
  /** The wording was copied -- evidence we watched -- but nobody confirmed. */
  | "copied"
  /** Somebody said they sent it. Self-reported; there is no proof. */
  | "sent"
  /** Asked for, and it came in. The only state that changes without anybody
   *  here doing something, which is why it is also the only one you cannot
   *  find by remembering what you did. */
  | "arrived"
  /** Came with the application. The ordinary case, kept quiet so that
   *  "arrived" keeps meaning something (lesson 39). */
  | "on_file";

export type CvFacts = {
  resume_screening_id?: number | null;
  cv_asked_at?: string | null;
  cv_asked_how?: string | null;
  cv_link_made_at?: string | null;
  link_opened_at?: string | null;
};

/** Did they open the link after we sent it?
 *
 *  Only ever answers true. Silence means no open is on record, which is not
 *  the same as "they did not open it": opens were first recorded on
 *  2026-09-16, and every link issued before that has none. Saying "not
 *  opened" would turn a gap in our recording into a statement about the
 *  applicant -- and that statement would send somebody chasing a phone
 *  number that was fine.
 *
 *  Compared against the link, not against the send: the send is somebody's
 *  account of what they did, and an open that beats it by a minute is far
 *  more likely a slow Done press than a psychic applicant.
 */
export function openedSinceAsk(a: CvFacts): boolean {
  if (!a.link_opened_at || !a.cv_link_made_at) return false;
  const opened = Date.parse(a.link_opened_at);
  const made = Date.parse(a.cv_link_made_at);
  if (!Number.isFinite(opened) || !Number.isFinite(made)) return false;
  return opened >= made;
}

export function cvStateOf(a: CvFacts): CvState {
  // The CV outranks everything else: once it is here, what was done to get
  // it stops being the thing anybody needs to act on.
  if (a.resume_screening_id) {
    return a.cv_asked_at || a.cv_link_made_at ? "arrived" : "on_file";
  }
  // Copying is something the page saw happen. Pressing "I sent it" is a
  // person's account of it. Both mean the applicant was asked, and the board
  // reads them the same way -- but they are not equally certain, so they are
  // not stored as one thing.
  if (a.cv_asked_at) return a.cv_asked_how === "cv_sent" ? "sent" : "copied";
  return a.cv_link_made_at ? "made" : "none";
}
