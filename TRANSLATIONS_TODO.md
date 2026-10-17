# Translations to review

Hindi strings in [`lib/i18n.tsx`](lib/i18n.tsx) (`const hi`) are machine-assisted drafts written by
an LLM (Claude). They have **not** been reviewed by a native speaker. Before real use, a Hindi speaker
should check every string, especially:

| Key | Draft | Check |
|---|---|---|
| `tagline` | साथ बचाएँ। बारी-बारी पाएँ। | Is "बारी-बारी पाएँ" natural for "take turns (to receive the pot)"? |
| `intro` | आपकी कमेटी का हिसाब, हर सदस्य के पास… | Is "साझा कॉपी" the right image for "shared notebook"? |
| `confirmed` | भुगतान ✓ {name} ने पुष्टि की | Word order with names |
| `claimed` | भुगतान बताया · {name} की पुष्टि बाकी | Is "भुगतान बताया" clear for "says paid"? |
| `disputeHint` | …इसे कोई नहीं मिटा सकता — आयोजक भी नहीं। | Tone |
| `keepAlive` / `keepAliveHint` | हमारा हिसाब बचाए रखें / …90 दिन जुड़ते हैं… | Does "keep alive" translate as intended? |
| `readLimit` | …मुफ़्त पढ़ने की सीमा… | Technical, simplify? |
| `tpl_*` | फ़ैमिली BC, ऑफ़िस कमेटी, किटी पार्टी, शादी फ़ंड | Common usage in Hindi-speaking groups |

Not translated yet (English only): the `/verify` page, the Settings "What's public" table, and
error details from the network.
