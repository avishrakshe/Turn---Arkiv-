# Demo video script (≤ 3:00)

Setup before recording: three browser windows side by side, each its own "phone":
`https://turn-arkiv.vercel.app` in a normal window (Meera, organiser), an Incognito window (Ravi), a
second Chrome profile (Priya). Phone-sized windows (≈ 400 px wide). A fourth tab has the seeded
"Sharma Family BC" on `/verify`, and a fifth has the Tiramisu explorer.

| Time | Screen | Say (voice-over) |
|---|---|---|
| 0:00–0:20 | Title card, then the home screen ring | "Millions of Indian families and offices run savings committees: BC, kitty, chit. Everyone pays ₹5,000 a month, one person takes the pot. The record is a notebook or a WhatsApp chat. Fights start with 'I paid!' and 'you never sent it', and sometimes the organiser just disappears." |
| 0:20–0:45 | Meera: **Start → Start a committee → Family BC**, 3 members, "Demo (every 10 minutes)", name "Meera S." → *Save rules* | "Turn keeps money on UPI or cash, exactly as today. Arkiv keeps the record. These rules are saved as a read-only record created by Meera's own key. Nobody can change them later, not even Meera." |
| 0:45–1:05 | *Share on WhatsApp* (show the link) → Ravi and Priya open it → *Join* | "The invite link carries the committee's encryption key after the hash, so it never reaches a server. Ravi and Priya join from their own phones; each join is created by their own key. The link itself dies after 48 hours." |
| 1:05–1:15 | Meera: *Everyone's in: lock the member list* | "Once seats fill, the member list is locked. From now on only these three wallets' records count." |
| 1:15–1:45 | Priya: *Pay ₹5,000 · Open UPI app* (UPI sheet opens; cancel) → *I've paid*. **Meera's window updates by itself: toast "Priya just paid ✓"**, pill "Says paid · waiting". Meera: *Received*. Priya's window: "Paid ✓ confirmed by Meera S." | "Priya pays on UPI and taps 'I've paid'. Live over a WebSocket, Meera sees it instantly. The payment is only 'confirmed' when the collector, and only the collector, confirms it. Every record shows who signed it, with a link to the chain." |
| 1:45–2:05 | Ravi: *I've paid* → Meera checks her UPI, nothing arrived → Meera: *Something's wrong → Money not received* on Ravi's row → red "Disputed" on all three screens | "Ravi says he paid, but Meera never got it. Instead of a WhatsApp fight, she files a dispute. It's a permanent record created by her, and Ravi's claim is now marked 'Disputed' for everyone. Any member can do this, and nobody can delete it, not even the organiser." |
| 2:05–2:20 | Ravi: *Keep our record alive* → "Record now kept until …" | "What if the organiser vanishes? Every record allows anyone to extend its life. Ravi, an ordinary member, just renewed every record for 90 more days in one transaction." |
| 2:20–2:45 | `/verify` tab: seeded Sharma Family BC → round 1 confirmed, round 2 claimed / disputed / unpaid. Show "Queries this page ran". | "And you don't need Turn to read it. This page talks to Arkiv directly from the browser, with no key and no Turn server: confirmed payments come from public attributes and the immutable creator of each record. The README has the same as a curl command." |
| 2:45–3:00 | Explorer: open a `pay_ack` entity → creator address, transaction | "On the explorer: the creator and the transaction for every record. Names and amounts are encrypted. Turn on Arkiv: save together, take turns, and keep a record nobody can rewrite." |

Fallbacks during recording: if a write is slow, the button shows "Saving to the shared record…" and
completes in 5–15 s, so cut the wait in editing. If the anonymous RPC budget is hit, the app falls back to
its keyed proxy; `/verify` would show the 429 message instead, so record it from a fresh connection.
