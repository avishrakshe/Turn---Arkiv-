import type { Metadata } from "next"
import Link from "next/link"
import { TurnMark } from "@/components/ring/TurnMark"
import { Seal } from "@/components/seal"
import s from "./landing.module.css"

export const metadata: Metadata = {
  title: { absolute: "Turn · Save together. Take turns." },
  description: "Turn gives India's savings committees (BC, kitty, chit) a shared record nobody can rewrite. Money stays on UPI or cash; the record lives on Arkiv, kept by every member.",
}

/** Same idea, many names. A rotating savings group, around the world. */
const NAMES: [string, string][] = [
  ["BC (bishi)", "India"], ["Committee", "India · Pakistan"], ["Chit fund", "India"], ["Kitty party", "India"],
  ["Dhikuti", "Nepal"], ["Seettu", "Sri Lanka"], ["Samity", "Bangladesh"], ["Chama", "Kenya"],
  ["Esusu · Ajo", "Nigeria"], ["Susu", "Ghana"], ["Stokvel", "South Africa"], ["Njangi · Tontine", "Cameroon"],
  ["Equb", "Ethiopia"], ["Hagbad", "Somalia"], ["Gam'eya", "Egypt"], ["Tanda", "Mexico"],
  ["Pasanaku", "Bolivia"], ["San", "Dominican Republic"], ["Sol", "Haiti"], ["Partner", "Jamaica"],
  ["Sou-sou", "Trinidad & Tobago"], ["Tanomoshi", "Japan"], ["Gye", "Korea"], ["Hui", "China · Taiwan"],
  ["Hụi", "Vietnam"], ["Arisan", "Indonesia"], ["Paluwagan", "Philippines"], ["Kutu", "Malaysia"],
]

const HERO_SEATS = ["confirmed", "confirmed", "claimed", "confirmed", "unpaid", "disputed"] as const

export default function Landing() {
  const half = Math.ceil(NAMES.length / 2)
  const rows = [NAMES.slice(0, half), NAMES.slice(half)]
  return (
    <div className={s.page}>
      {/* ───────────── Nav ───────────── */}
      <header className={s.nav}>
        <Link href="/" className="inline-flex items-center gap-2" aria-label="Turn home">
          <TurnMark size={28} />
          <span lang="en" className="font-display text-[1.35rem] font-semibold leading-none tracking-tight">Turn</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          <a href="#how" className={`${s.navLink} hidden sm:inline`}>How it works</a>
          <a href="#why" className={`${s.navLink} hidden sm:inline`}>Why it can&apos;t be rewritten</a>
          <Link href="/verify" className={`${s.navLink} hidden sm:inline`}>Verify</Link>
          <Link href="/app" className={s.navCta}>Open app</Link>
        </nav>
      </header>

      {/* ───────────── Hero ───────────── */}
      <section className={s.hero}>
        <div className={s.grid} aria-hidden />
        <div className={s.heroInner}>
          <div className={s.heroCopy}>
            <p className={s.kicker}>For BCs, kitty parties &amp; office committees</p>
            <h1 className={s.h1}>Save together.<br /><span className={s.glow}>Take turns.</span></h1>
            <p className={s.lead}>
              Your committee&apos;s record, kept by <em>every</em> member, not one notebook. Money still moves on
              UPI or cash. Turn keeps the shared ledger that nobody can edit, delete or quietly lose.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/app" className={s.ctaPrimary}>Start a committee</Link>
              <Link href="/verify#c=d2ccb6e40b03bc6280b8ea95df17536e&o=0x0cbaaccdcf158845b04d0e770c75248084365e40" className={s.ctaGhost}>See a live record →</Link>
            </div>
            <p className={s.fine}>No sign-up · No phone number · No crypto needed · Free on Arkiv testnet</p>
          </div>

          <div className={s.orbit} aria-label="A committee: six members, each payment sealed by payer and collector">
            <div className={s.orbitRing} />
            {HERO_SEATS.map((st, i) => (
              <div key={i} className={s.seat} style={{ ["--i" as string]: i, ["--n" as string]: HERO_SEATS.length }}>
                <div className={s.seatInner}><Seal state={st} size={58} label={st} /></div>
              </div>
            ))}
            <div className={s.pot}>
              <span className={s.potLabel}>Round 3 pot</span>
              <span className={`tabular ${s.potValue}`}>₹25,000</span>
              <span className={s.potLabel}>to Priya</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── Marquee: names around the world ───────────── */}
      <section className={s.marqueeWrap} aria-label="What savings committees are called around the world">
        <p className={s.marqueeTitle}>One idea, a hundred names. Millions of people already save this way.</p>
        {rows.map((row, ri) => (
          <div key={ri} className={s.marquee} data-dir={ri === 0 ? "left" : "right"}>
            <ul className={s.track}>
              {[...row, ...row].map(([name, where], i) => (
                <li key={i} className={s.chip} aria-hidden={i >= row.length}>
                  <span className={s.chipName}>{name}</span>
                  <span className={s.chipWhere}>{where}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* ───────────── Problem ───────────── */}
      <section className={s.section}>
        <p className={s.eyebrow}>The problem</p>
        <h2 className={s.h2}>Trust runs the committee. The notebook doesn&apos;t keep it.</h2>
        <div className={s.cards3}>
          <article className={s.card}>
            <p className={s.quote}>“I paid!”<br />“You never sent it.”</p>
            <p className={s.cardText}>Screenshots get lost, cash leaves no trace, and the argument goes round the WhatsApp group for a week.</p>
          </article>
          <article className={s.card}>
            <p className={s.quote}>“It was always ₹6,000.”</p>
            <p className={s.cardText}>Amounts and turn order live in the organiser&apos;s memory, and memory changes by month seven.</p>
          </article>
          <article className={s.card}>
            <p className={s.quote}>The organiser stopped replying.</p>
            <p className={s.cardText}>With them goes the only copy of who paid, who already took the pot, and who is still owed.</p>
          </article>
        </div>
      </section>

      {/* ───────────── How it works ───────────── */}
      <section id="how" className={s.section}>
        <p className={s.eyebrow}>How it works</p>
        <h2 className={s.h2}>Every payment is a seal with two halves.</h2>
        <p className={s.sectionLead}>
          The person who pays signs one half. The person who receives signs the other. Only when both halves meet is
          the payment <strong>sealed</strong>, and nobody else can sign for them.
        </p>
        <ol className={s.steps}>
          <li className={s.step}>
            <Seal state="unpaid" size={72} label="open seal" />
            <h3 className={s.stepTitle}>1 · Agree the rules</h3>
            <p className={s.cardText}>Pick Family BC, Office committee, Kitty party or Wedding fund. The amount and turn order are saved for everyone, read-only from day one.</p>
          </li>
          <li className={s.step}>
            <Seal state="claimed" size={72} label="payer half" />
            <h3 className={s.stepTitle}>2 · Pay on UPI, tap “I&apos;ve paid”</h3>
            <p className={s.cardText}>Turn opens your UPI app with the amount filled in. Your half of the seal lights up, signed by your phone.</p>
          </li>
          <li className={s.step}>
            <Seal state="confirmed" size={72} label="sealed" />
            <h3 className={s.stepTitle}>3 · They tap “Received”</h3>
            <p className={s.cardText}>Only this round&apos;s collector can close the seal. Everyone&apos;s screen updates live: “Paid ✓ confirmed by Ravi”.</p>
          </li>
          <li className={s.step}>
            <Seal state="disputed" size={72} label="cracked seal" />
            <h3 className={s.stepTitle}>Something wrong? It cracks.</h3>
            <p className={s.cardText}>Any member can file a dispute. It stays on the record with their name. The organiser can&apos;t delete it.</p>
          </li>
        </ol>
      </section>

      {/* ───────────── Why it can't be rewritten ───────────── */}
      <section id="why" className={s.dark}><div className={s.section}>
        <p className={s.eyebrow}>Why it can&apos;t be rewritten</p>
        <h2 className={s.h2}>The record belongs to the group, not to us.</h2>
        <div className={s.cards2}>
          <article className={s.cardDark}>
            <h3 className={s.stepTitle}>Signed by the right phone</h3>
            <p className={s.cardTextDark}>Each record is created by the member it speaks for, and Arkiv keeps that creator forever. A “Received” from anyone except that round&apos;s collector simply doesn&apos;t count.</p>
          </article>
          <article className={s.cardDark}>
            <h3 className={s.stepTitle}>Nothing can be edited</h3>
            <p className={s.cardTextDark}>Rules, payments and disputes are saved read-only. A correction is a new record everyone can see, never a quiet change.</p>
          </article>
          <article className={s.cardDark}>
            <h3 className={s.stepTitle}>Any member can keep it alive</h3>
            <p className={s.cardTextDark}>Records last the whole committee plus 30 days, and <em>anyone</em> in the group can extend them with one tap: “Keep our record alive”. An organiser who disappears can&apos;t let the evidence expire.</p>
          </article>
          <article className={s.cardDark}>
            <h3 className={s.stepTitle}>Readable without Turn</h3>
            <p className={s.cardTextDark}>If this website vanished tomorrow, the ledger would still be on Arkiv. Our <Link href="/verify" className="underline">verify page</Link> and a one-line query read it straight from the network.</p>
          </article>
        </div>
      </div></section>

      {/* ───────────── Privacy ───────────── */}
      <section className={s.section}>
        <p className={s.eyebrow}>Private by default</p>
        <h2 className={s.h2}>The network sees seals. Only your group sees names.</h2>
        <div className={s.table}>
          <div className={s.tableCol}>
            <p className={s.tableHead}>Public on the network</p>
            <ul className={s.list}>
              <li>A random committee id</li>
              <li>Round numbers and due dates</li>
              <li>Which phone signed which half</li>
            </ul>
          </div>
          <div className={s.tableCol}>
            <p className={s.tableHead}>Encrypted for your group</p>
            <ul className={s.list}>
              <li>Names and the committee&apos;s name</li>
              <li>Amounts, payment method, notes</li>
              <li>Dispute reasons</li>
            </ul>
          </div>
          <div className={s.tableCol}>
            <p className={s.tableHead}>Never on the network</p>
            <ul className={s.list}>
              <li>Your money: it stays on UPI or cash</li>
              <li>Phone numbers, UPI IDs</li>
              <li>The group key (only in the invite link and on members&apos; phones)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section className={s.section}>
        <p className={s.eyebrow}>Questions</p>
        <div className={s.faq}>
          {[
            ["Does my money go through Turn?", "No. You pay each other on UPI or in cash, exactly as today. Turn only records who paid and who confirmed."],
            ["Do I need crypto or a wallet?", "No. Your phone creates a key when you tap Start. On this test network the small fee for saving records is covered for you."],
            ["What if I change phones?", "Download a backup file from Settings and restore it on the new phone."],
            ["Can the organiser change the rules later?", "No. The amount and turn order are saved read-only when the committee starts. Every member's app checks results against them."],
            ["Is this live with real money?", "It runs on Arkiv's Tiramisu test network for the Arkiv Global Tour challenge. Please use made-up names while testing."],
          ].map(([q, a]) => (
            <details key={q} className={s.faqItem}>
              <summary className={s.faqQ}>{q}</summary>
              <p className={s.cardText}>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ───────────── Final CTA ───────────── */}
      <section className={s.final}>
        <Seal state="confirmed" size={88} label="sealed" />
        <h2 className={s.h2}>Start your committee in a minute.</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/app" className={s.ctaPrimary}>Open Turn</Link>
          <Link href="/verify" className={s.ctaGhostLight}>Check any committee</Link>
        </div>
      </section>

      <footer className={s.footer}>
        <span>Turn · built on <a href="https://arkiv.network" className="underline" target="_blank" rel="noreferrer">Arkiv</a> (Tiramisu testnet)</span>
        <span className="flex gap-4">
          <a href="https://github.com/avishrakshe/Turn---Arkiv-" className="underline" target="_blank" rel="noreferrer">GitHub · MIT</a>
          <Link href="/verify" className="underline">Verify</Link>
        </span>
      </footer>
    </div>
  )
}
