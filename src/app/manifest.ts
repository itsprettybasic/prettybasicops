import type { MetadataRoute } from "next";

/** Bisa di-install ke layar utama HP (PWA) — dibuka langsung tanpa bar browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pretty Basic Ops",
    short_name: "PB Ops",
    description: "Stock, PPIC, dan rekam packing Pretty Basic",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F8FA",
    theme_color: "#7F0010",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
