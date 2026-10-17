import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Local multi-phone testing: localhost, 127.0.0.1 and [::1] are separate origins (separate accounts).
  allowedDevOrigins: ["127.0.0.1", "[::1]", "::1"],
  // Don't write AGENTS.md / CLAUDE.md into the repo on `next dev`.
  agentRules: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        // Invite links carry the circle key in the fragment; never leak the URL to other sites.
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }]
  },
}

export default config
