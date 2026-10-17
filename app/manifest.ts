import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Turn: savings committees",
    shortcuts: [{ name: "Start a committee", url: "/create" }, { name: "Verify a record", url: "/verify" }],
    short_name: "Turn",
    description: "Your committee's shared record, kept by every member.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0d0c",
    theme_color: "#0e0d0c",
    categories: ["finance", "lifestyle"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
