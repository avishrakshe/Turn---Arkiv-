import type { Metadata, Viewport } from "next"
import { Providers } from "@/components/providers"
import { bebas, urbanist } from "@/lib/fonts"
import { InstallPrompt } from "@/components/install"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Turn · Save together. Take turns.", template: "%s · Turn" },
  description: "A shared, tamper-evident record for savings committees (BC, kitty, chit), kept on Arkiv by every member. Money stays on UPI or cash.",
  applicationName: "Turn",
  appleWebApp: { capable: true, title: "Turn", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  referrer: "no-referrer",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ede6" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1612" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${urbanist.variable} ${bebas.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <InstallPrompt />
      </body>
    </html>
  )
}
