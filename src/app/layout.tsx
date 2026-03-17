// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

import LayoutShell from "../components/LayoutShell";

export const metadata: Metadata = {
  title: "Sushi ZEN Shift",
  description: "Staff shift viewer + change requests",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sushi ZEN Shift",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}