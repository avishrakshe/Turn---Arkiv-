import { DM_Sans, Fraunces } from "next/font/google"

// From Turn (pre-existing): Fraunces with its SOFT axis for display, DM Sans (tabular figures) for UI.
export const fraunces = Fraunces({ subsets: ["latin"], axes: ["SOFT", "WONK", "opsz"], variable: "--font-fraunces", display: "swap" })
export const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-dm-sans", display: "swap" })
