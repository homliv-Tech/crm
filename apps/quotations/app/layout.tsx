import type { Metadata } from "next";
import "./globals.css";
import "./editor.css";

export const metadata: Metadata = {
  title: "Quotient — Architecture & building quotations",
  description:
    "Prepare architecture, renovation and building quotations for homeowners and companies, with work quantities, project scope, payment milestones and PDF export.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
