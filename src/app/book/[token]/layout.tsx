import type { Metadata } from "next";

/**
 * What the link looks like before anybody opens it.
 *
 * The invite is sent by a person, from their own phone, to somebody who has
 * never had a message from that number. All the applicant sees first is the
 * preview card -- and it was inheriting the root layout's, so a job invite
 * arrived from an unknown foreign number reading "Sushi ZEN Workforce OS /
 * Staff shift viewer + change requests". That is a message people ignore, and
 * sensibly: it looks like neither a job nor anything meant for them.
 *
 * Nothing here names the applicant. The card renders on whatever screen the
 * message lands on, including one somebody else is holding.
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://sushizen-shift-pwa.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "Sushi ZEN — book your interview",
  description:
    "You passed the first round. Pick a time that works for you — about 30 minutes, voice only.",
  // A personal link. It should not be in a search index.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Sushi ZEN",
    title: "Sushi ZEN — book your interview",
    description:
      "You passed the first round. Pick a time that works for you — about 30 minutes, voice only.",
    images: [{ url: "/logo.png", width: 1920, height: 1080, alt: "Sushi ZEN" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sushi ZEN — book your interview",
    description:
      "You passed the first round. Pick a time that works for you — about 30 minutes, voice only.",
    images: ["/logo.png"],
  },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
