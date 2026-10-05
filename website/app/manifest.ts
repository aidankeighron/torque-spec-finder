import type { MetadataRoute } from "next";

// Required with output:"export" — the manifest is emitted at build time as a
// static file rather than served by a route handler.
export const dynamic = "force-static";

/** Makes the site installable to a phone home screen, which is the realistic
 *  way this gets used: add to home screen in the garage, open it one-handed. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Torque Spec Finder",
    short_name: "Torque",
    description:
      "Natural-language torque spec lookup that refuses to guess. Every value traced to its source.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1216",
    theme_color: "#0f1216",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
