import { Bebas_Neue, Urbanist } from "next/font/google"

// Urbanist: rounded geometric sans for everything (UI + headings). Bebas Neue: the giant condensed
// display word on the landing page only.
export const urbanist = Urbanist({ subsets: ["latin", "latin-ext"], variable: "--font-urbanist", display: "swap" })
export const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" })
