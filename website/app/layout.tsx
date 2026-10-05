import type { Metadata, Viewport } from "next";
import "./globals.css";

/** Set NEXT_PUBLIC_SITE_URL in Vercel to your real domain.
 *
 *  Open Graph and Twitter image URLs must be absolute — relative paths are
 *  silently ignored by crawlers — so this base is what makes link previews
 *  work at all. The fallback keeps local builds and previews valid. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://torque-spec-finder.vercel.app";

const title = "Torque Spec Finder — 2003 C5 Corvette";
const description =
  "Natural-language torque spec lookup that refuses to guess. 708 fasteners for the 2003 " +
  "C5 Corvette, every value traced to the GM service document it came from, with service " +
  "bulletin revisions applied. Abstains instead of guessing when it can't tell two bolts apart.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Torque Spec Finder",
  },
  description,
  applicationName: "Torque Spec Finder",
  keywords: [
    "torque specs", "C5 Corvette", "2003 Corvette", "LS1", "fastener torque",
    "service manual", "lb ft", "N·m", "torque to yield", "ball joint torque",
  ],
  authors: [{ name: "Torque Spec Finder" }],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Torque Spec Finder",
    title,
    description,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt:
          "Torque Spec Finder: Rear Shock Absorber Lower Mounting Bolt, 162 lb ft / 220 N·m, " +
          "tier A, GM manual corroborated by two independent sources.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  // A private tool for one car: useful to share by link, not useful in search
  // results, and indexing it would invite people to torque their own cars to
  // another car's numbers.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#0f1216",
  width: "device-width",
  initialScale: 1,
  // Let people pinch-zoom a torque figure while lying under a car.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
