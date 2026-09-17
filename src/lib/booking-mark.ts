/** Recording that an interview link left the screen.
 *
 *  Two screens hand out the same booking link — the pipeline board and the
 *  voice-screening queue — and the board reads one pair of events to decide
 *  whether a row says "sent". Only the board was writing them. Somebody who
 *  shortlisted in Voice screening, sent the message, and pressed the button
 *  labelled "Sent — close" left no trace at all, so the applicant came back on
 *  the board as "link made · not sent" and the message went out a second time.
 *  Measured 2026-09-17: three people in one afternoon, each issued a second
 *  link ten to thirty minutes after the first.
 *
 *  So the calls live here once and both screens use them (lesson 62).
 */

/** The wording left the page. Recorded whether or not the clipboard worked:
 *  when it is refused the person selects the text and copies it by hand, and
 *  they have still taken it away. Recording only the successful path would
 *  leave exactly those people invisible. */
export async function markBookingCopied(
  applicantId: string,
  what: string,
  lang: string,
  clipboardWorked: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/admin/hr/applicants/${applicantId}/booking-invite/copied`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what: clipboardWorked ? what : `${what} (by hand)`, lang }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** A person saying they sent it. Nothing is sent from the OS here, so this is
 *  their word — but it is the only thing that separates a row waiting on the
 *  applicant from a row still waiting on us.
 *
 *  Returns false when it did not land. The caller must not close on false: a
 *  panel closing looks exactly like it worked, and the row then reads "not
 *  sent" with nobody any the wiser (lesson 46). */
export async function markBookingSent(
  applicantId: string,
  how = "copied the message and sent it",
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/admin/hr/applicants/${applicantId}/booking-invite/sent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ how }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
