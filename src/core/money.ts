/** ₹ with Indian digit grouping: 100000 → "₹1,00,000". Whole rupees only. */
const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })
export const inr = (rupees: number) => `₹${fmt.format(Math.round(rupees))}`

/**
 * Bid arithmetic, all in whole rupees (floors so no one is asked for a fractional rupee).
 * pot = N × amount; discount = pot × bps / 10000; share = discount / (N − 1) for every other member.
 */
export function bidSplit(amountInr: number, members: number, discountBps: number) {
  const pot = amountInr * members
  const discount = Math.floor((pot * discountBps) / 10_000)
  const share = members > 1 ? Math.floor(discount / (members - 1)) : 0
  const due = amountInr - share
  return { pot, discount, share, due, payout: due * (members - 1) }
}
