"use client"
/**
 * Live updates: `watchEntityEvents` over a WebSocket transport, with no `fromBlock` (a bigint
 * `fromBlock` would make viem poll). Events only announce keys, so on a relevant event the page
 * re-reads the circle snapshot; nothing is trusted from the event itself.
 */
import { useEffect, useRef } from "react"
import { eventsClient } from "@/src/arkiv/client"

type Watch = {
  /** Lowercase addresses whose new records concern this circle (organiser + members). */
  creators: ReadonlySet<string>
  /** Lowercase keys of this circle's records (for extensions and handovers). */
  keys: ReadonlySet<string>
  /** Before the roster: a join can come from a new address, so any create triggers a re-read. */
  anyCreator?: boolean
  onChange: (why: "created" | "extended" | "owner") => void
  onHealth?: (live: boolean) => void
}

export function useLiveCircle(w: Watch | null) {
  const ref = useRef(w)
  ref.current = w
  const enabled = !!w
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let unwatch: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let last = 0
    let failures = 0
    // Every re-read costs query budget (the anonymous Tiramisu budget is finite), so re-reads are
    // coalesced and spaced at least MIN_GAP apart; reconnects back off exponentially.
    const MIN_GAP = 8_000
    const fire = (why: "created" | "extended" | "owner") => {
      clearTimeout(timer)
      const wait = Math.max(600, last + MIN_GAP - Date.now())
      timer = setTimeout(() => { last = Date.now(); ref.current?.onChange(why) }, wait)
    }
    const start = () => {
      if (stopped) return
      const client = eventsClient()
      ref.current?.onHealth?.(true)
      unwatch = client.watchEntityEvents({
        onEntityCreated: (e) => { failures = 0; if (ref.current?.anyCreator || ref.current?.creators.has(e.owner.toLowerCase())) fire("created") },
        onExpiryExtended: (e) => { failures = 0; if (ref.current?.keys.has(e.entityKey.toLowerCase())) fire("extended") },
        onOwnershipTransferred: (e) => { failures = 0; if (ref.current?.keys.has(e.entityKey.toLowerCase())) fire("owner") },
        onError: (err) => {
          console.warn("[turn-live] watcher error:", err.name, err.message.split("\n")[0])
          // Socket dropped: re-read once (we may have missed events) and reconnect with backoff.
          ref.current?.onHealth?.(false)
          unwatch?.()
          if (failures === 0) fire("created")
          failures++
          clearTimeout(retry)
          retry = setTimeout(start, Math.min(120_000, 5_000 * 2 ** Math.min(failures - 1, 5)))
        },
      })
    }
    start()
    return () => { stopped = true; unwatch?.(); clearTimeout(timer); clearTimeout(retry) }
  }, [enabled])
}
