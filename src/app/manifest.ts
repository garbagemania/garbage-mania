import type { MetadataRoute } from "next";

/** Lets drivers (and customers) "Add to Home screen" so the app opens full-screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Garbage Mania",
    short_name: "Garbage Mania",
    description: "Waste collection management for Garbage Mania.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1F7A45",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
