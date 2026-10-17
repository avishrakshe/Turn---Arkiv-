import type { Metadata } from "next"
import Link from "next/link"
import { Seal } from "@/components/seal"
import s from "./landing.module.css"

export const metadata: Metadata = {
  title: { absolute: "Turn · Save together. Take turns." },
  description: "Turn gives India's savings committees (BC, kitty, chit) a shared record nobody can rewrite. Money stays on UPI or cash; the record lives on Arkiv, kept by every member.",
}

const DEMO = "/verify#c=d2ccb6e40b03bc6280b8ea95df17536e&o=0x0cbaaccdcf158845b04d0e770c75248084365e40"

/** What a rotating savings group is called, around the world. */
const NAMES = [
  "BC · India", "Chit fund · India", "Kitty party · India", "Committee · Pakistan", "Dhikuti · Nepal", "Seettu · Sri Lanka",
  "Samity · Bangladesh", "Chama · Kenya", "Esusu · Nigeria", "Susu · Ghana", "Stokvel · South Africa", "Njangi · Cameroon",
  "Equb · Ethiopia", "Hagbad · Somalia", "Gam'eya · Egypt", "Tanda · Mexico", "Pasanaku · Bolivia", "San · Dominican Rep.",
  "Sol · Haiti", "Partner · Jamaica", "Sou-sou · Trinidad", "Tanomoshi · Japan", "Gye · Korea", "Hui · China",
  "Hụi · Vietnam", "Arisan · Indonesia", "Paluwagan · Philippines", "Kutu · Malaysia",
]

const STEPS = [
  { n: "01", title: "Agree", text: "Pick Family BC, Office committee, Kitty party or Wedding fund. Amount and turn order are saved read-only, for everyone, from day one.", seal: "unpaid" as const, tone: s.toneA },
  { n: "02", title: "Invite", text: "Share one WhatsApp link. Each member joins from their own phone, so nobody can invent members or quietly remove one.", seal: "self" as const, tone: s.toneB },
  { n: "03", title: "Pay & seal", text: "Pay on UPI as usual and tap “I’ve paid”. When this round’s collector taps “Received”, the two halves lock into a seal.", seal: "confirmed" as const, tone: s.toneC },
  { n: "04", title: "Keep it", text: "Disputes stay on the record. Any member can keep the whole record alive, and anyone can read it, even without Turn.", seal: "disputed" as const, tone: s.toneD },
]

const PILLARS = [
  { n: "01", kicker: "Security", title: "Signed by the right phone", text: "Every record is created by the member it speaks for, and the network keeps that signature forever. A “Received” from anyone but this round’s collector simply doesn’t count, and forged records are counted and ignored." },
  { n: "02", kicker: "Censorship resistance", title: "Readable without us", text: "If Turn disappeared tomorrow, the ledger would still be on Arkiv. Our verify page and a one-line query read it straight from the network, with no Turn server in between." },
  { n: "03", kicker: "Privacy", title: "The network sees seals, not names", text: "Names, amounts and notes are encrypted with a key that lives only in your invite link and on members’ phones. Money, phone numbers and UPI IDs never touch Turn or the network." },
]

const FAQ = [
  ["Does my money go through Turn?", "No. You pay each other on UPI or in cash, exactly as today. Turn only records who paid and who confirmed it."],
  ["Do I need crypto or a wallet?", "No. Your phone creates its own key when you tap Start. On this test network the tiny fee for saving a record is covered for you."],
  ["Can the organiser change the rules later?", "No. The amount and turn order are saved read-only when the committee starts, and every member’s app checks each round’s result against them."],
  ["What if I change phones?", "Download your backup file from Settings and restore it on the new phone."],
  ["Is this live with real money?", "Turn runs on Arkiv’s Tiramisu test network for the Arkiv Global Tour challenge. Please use made-up names while trying it."],
]

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className={s.arrow}><path d="M3 11 11 3M5 3h6v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

export default function Landing() {
  return (
    <div className={s.page}>
      {/* Nav */}
      <header className={s.nav}>
        <Link href="/" className={s.logo} aria-label="Turn home">Turn</Link>
        <nav className={s.links} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#why">Why Turn</a>
          <a href="#names">Around the world</a>
          <Link href="/verify">Verify</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <Link href="/app" className={s.pill}>Open app <Arrow /></Link>
      </header>

      {/* Hero: giant word */}
      <section className={s.hero}>
        <div className={s.corners}><span>©2026</span><span>ON ARKIV</span></div>
        <h1 className={s.megaWrap}>
          <span className="sr-only">Committee</span>
          {/* SVG text stretched to exactly the content width at every screen size. */}
          <svg viewBox="0 0 1000 286" className={s.mega} aria-hidden preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="megaFill" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#7a210d" />
                <stop offset="0.28" stopColor="#e8562a" />
                <stop offset="0.5" stopColor="#f4a340" />
                <stop offset="0.72" stopColor="#e8562a" />
                <stop offset="1" stopColor="#7a210d" />
                <animateTransform attributeName="gradientTransform" type="translate" values="-0.3 0; 0.3 0; -0.3 0" dur="18s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
            <text x="0" y="276" textLength="1000" lengthAdjust="spacingAndGlyphs" fill="url(#megaFill)" className={s.megaText}>COMMITTEE</text>
          </svg>
        </h1>
      </section>

      {/* Colour band */}
      <section className={s.band}>
        <div className={s.bandCopy}>
          <p className={s.bandText}>
            The shared record for your BC, kitty or office committee. Money stays on UPI or cash; every payment is
            signed by the person who paid <em>and</em> the person who received it. Nobody can edit it, delete it or lose it.
          </p>
          <div className={s.bandCtas}>
            <Link href="/app" className={s.pillLight}>Start a committee <Arrow /></Link>
            <Link href={DEMO} className={s.pillGhost}>See a live record <Arrow /></Link>
          </div>
        </div>
        <div className={s.bandSeal} aria-hidden>
          <Seal state="confirmed" size={220} label="sealed payment" />
        </div>
        <ul className={s.tags} aria-label="What Turn guarantees">
          <li>Two-party confirmation</li>
          <li>Read-only rules</li>
          <li>Disputes nobody can delete</li>
          <li>Any member keeps it alive</li>
          <li>Readable without Turn</li>
        </ul>
      </section>

      {/* Marquee */}
      <section id="names" className={s.marquee} aria-label="What savings committees are called around the world">
        <ul className={s.track}>
          {[...NAMES, ...NAMES].map((n, i) => (
            <li key={i} aria-hidden={i >= NAMES.length}><span className={s.slash}>/</span>{n.toUpperCase()}</li>
          ))}
        </ul>
      </section>

      {/* Statement */}
      <section className={s.statement}>
        <ul className={s.facts}>
          <li>₹1,000 – ₹10,000 / MONTH</li>
          <li>5 – 20 MEMBERS</li>
          <li>ENGLISH · हिन्दी</li>
          <li>NO SIGN-UP</li>
        </ul>
        <p className={s.big}>
          Millions of Indian families save this way, on trust and a notebook. Turn keeps the trust and replaces the
          notebook: a record every member holds, that nobody can quietly rewrite.
        </p>
      </section>

      {/* Process */}
      <section id="how" className={s.dark}>
        <div className={s.darkHead}>
          <h2 className={s.h2Light}>How it<br />works</h2>
          <p className={s.darkLead}>Four steps, the way committees already run. Turn just makes every step provable.</p>
        </div>
        <ol className={s.cards}>
          {STEPS.map((st) => (
            <li key={st.n} className={`${s.card} ${st.tone}`}>
              <span className={s.cardNum}>{st.n}</span>
              <div className={s.cardSeal}><Seal state={st.seal} size={88} label={st.title} /></div>
              <h3 className={s.cardTitle}>{st.title}</h3>
              <p className={s.cardText}>{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pillars */}
      <section id="why" className={s.rows}>
        {PILLARS.map((p) => (
          <article key={p.n} className={s.row}>
            <span className={s.rowNum}>{p.n}</span>
            <div className={s.rowBody}>
              <p className={s.rowKicker}>{p.kicker}</p>
              <h3 className={s.rowTitle}>{p.title}</h3>
              <p className={s.rowText}>{p.text}</p>
            </div>
            <Link href={p.n === "02" ? "/verify" : "/app"} className={s.pillDark}>{p.n === "02" ? "Verify a record" : "Open app"} <Arrow /></Link>
          </article>
        ))}
      </section>

      {/* Stats */}
      <section className={s.stats}>
        <div><strong>2</strong><span>signatures on every payment</span></div>
        <div><strong>0</strong><span>rupees held by Turn</span></div>
        <div><strong>48h</strong><span>until an old invite link dies</span></div>
        <div><strong>+90d</strong><span>any member can add to the record</span></div>
      </section>

      {/* FAQ */}
      <section id="faq" className={s.faqWrap}>
        <h2 className={s.h2}>Questions</h2>
        <div className={s.faq}>
          {FAQ.map(([q, a]) => (
            <details key={q} className={s.faqItem}>
              <summary>{q}<span className={s.plus} aria-hidden>+</span></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footTop}>
          <div className={s.footAbout}>
            <p className={s.footLogo}>Turn</p>
            <p>Save together. Take turns. A shared, tamper-proof record for India&apos;s savings committees, built on Arkiv.</p>
            <Link href="/app" className={s.pill}>Start a committee <Arrow /></Link>
          </div>
          <div className={s.footCols}>
            <div><p className={s.footHead}>App</p><Link href="/app">Open Turn</Link><Link href="/create">Start a committee</Link><Link href="/settings">Settings &amp; backup</Link></div>
            <div><p className={s.footHead}>Proof</p><Link href="/verify">Verify a record</Link><Link href={DEMO}>Live demo committee</Link><a href="https://tiramisu.explorer.arkiv.network" target="_blank" rel="noreferrer">Arkiv explorer</a></div>
            <div><p className={s.footHead}>Project</p><a href="https://github.com/avishrakshe/Turn---Arkiv-" target="_blank" rel="noreferrer">GitHub (MIT)</a><a href="https://github.com/avishrakshe/Turn---Arkiv-/blob/main/arkiv/schema.md" target="_blank" rel="noreferrer">Data schema</a><a href="https://arkiv.network" target="_blank" rel="noreferrer">Arkiv</a></div>
          </div>
        </div>
        <p className={s.giant} aria-hidden>Turn</p>
        <p className={s.footNote}>Tiramisu testnet · use made-up names · money never passes through Turn</p>
      </footer>
    </div>
  )
}
