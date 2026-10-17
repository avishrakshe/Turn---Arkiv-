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
    const fire = (why: "created" | "extended" | "owner") => {
      clearTimeout(timer)
      // Coalesce a batch (many events in one block) into one re-read.
      timer = setTimeout(() => ref.current?.onChange(why), 600)
    }
    const start = () => {
      if (stopped) return
      const client = eventsClient()
      ref.current?.onHealth?.(true)
      unwatch = client.watchEntityEvents({
        onEntityCreated: (e) => { if (ref.current?.anyCreator || ref.current?.creators.has(e.owner.toLowerCase())) fire("created") },
        onExpiryExtended: (e) => { if (ref.current?.keys.has(e.entityKey.toLowerCase())) fire("extended") },
        onOwnershipTransferred: (e) => { if (ref.current?.keys.has(e.entityKey.toLowerCase())) fire("owner") },
        onError: () => {
          // Socket dropped: re-read (we may have missed events) and reconnect.
          ref.current?.onHealth?.(false)
          unwatch?.()
          fire("created")
          clearTimeout(retry)
          retry = setTimeout(start, 5_000)
        },
      })
    }
    start()
    return () => { stopped = true; unwatch?.(); clearTimeout(timer); clearTimeout(retry) }
  }, [enabled])
}
