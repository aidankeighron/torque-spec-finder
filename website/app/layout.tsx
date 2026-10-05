import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Torque Spec Finder",
  description:
    "Natural-language torque spec lookup that refuses to guess. Every value traced to a source; abstains when unsure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
