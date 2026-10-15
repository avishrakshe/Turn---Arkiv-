/**
 * Entity creation with reconciliation.
 *
 * - One queue per account: writes from this tab never race each other for a nonce.
 * - Every create carries a random `op_id`. After any error that might have reached the network we
 *   look for that op_id (and the tx receipt, if we have a hash) before saying anything — we never
 *   resend automatically. A user-initiated retry reuses the same op_id, and readers keep only the
 *   earliest record per (creator, op_id), so even a double landing counts once.
 */
import {
  ENTITY_EVENTS_ABI, EntityMutationError, ExpirationTime,
  type CreateEntityParameters, type Expiry, type PublicArkivClient, type WalletArkivClient,
} from "@arkiv-network/sdk"
import { bool, bytes32, key as keyAttr, str, u64 } from "@arkiv-network/sdk/attr"
import { eq } from "@arkiv-network/sdk/query"
import { decodeEventLog, type Hash } from "viem"
import { EMPTY_CONTENT_TYPE, PROJECT, type EntityType } from "./config"
import { ENCRYPTED_CONTENT_TYPE, seal } from "./payload"
import { makeEnvelope, ROUND_TYPES, validateBody, type Address, type BodyOf, type Hex } from "../core/bodies"

const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044"

export type Intent<K extends EntityType = EntityType> = {
  type: K
  circleId: string
  body: BodyOf[K]
  expires: Expiry
  round?: number
  refKey?: Hex
  commit?: Hex
  onTime?: boolean
  isFinal?: boolean
  /** Reuse on a user-initiated retry. */
  opId?: string
}

export type WriteOutcome =
  | { status: "confirmed"; entityKey: Hex; txHash?: Hash; block: bigint; opId: string; reconciled: boolean }
  /** Definitely not applied (rejected before sending, or reverted). Safe to retry. */
  | { status: "failed"; opId: string; reason: string; txHash?: Hash }
  /** Might have landed. Do not resend blindly; retry with the same opId re-checks first. */
  | { status: "unconfirmed"; opId: string; txHash?: Hash; reason: string }

export class NeedsGasError extends Error {
  constructor(readonly address: Address) {
    super("This account has no GLM for writes yet")
    this.name = "NeedsGasError"
  }
}

export const newOpId = (): string => {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("")
}

export async function buildCreate(intent: Intent, by: Address, circleKey: CryptoKey | null, opId: string): Promise<CreateEntityParameters> {
  const needsRound = ROUND_TYPES.includes(intent.type)
  if (needsRound !== (intent.round !== undefined)) throw new Error(`round required exactly for round records (${intent.type})`)
  const attributes: Record<string, ReturnType<typeof str> | ReturnType<typeof u64> | ReturnType<typeof keyAttr> | ReturnType<typeof bytes32> | ReturnType<typeof bool>> = {
    project: str(PROJECT),
    entity_type: str(intent.type),
    circle_id: str(intent.circleId),
    created_at: u64(Date.now()),
    op_id: str(opId),
  }
  if (intent.round !== undefined) attributes.round = u64(intent.round)
  if (intent.refKey) attributes.ref_key = keyAttr(intent.refKey)
  if (intent.commit) attributes.commit = bytes32(intent.commit)
  if (intent.onTime !== undefined) attributes.on_time = bool(intent.onTime)
  if (intent.isFinal !== undefined) attributes.is_final = bool(intent.isFinal)

  const flags = { readonly: intent.type !== "invite", permissionlessExtension: false }
  if (intent.type === "bid_commit") {
    return { payload: new Uint8Array(), contentType: EMPTY_CONTENT_TYPE, attributes, expires: intent.expires, flags }
  }
  if (!circleKey) throw new Error("circle key required")
  const body = validateBody(intent.type, intent.body)
  const envelope = makeEnvelope({ v: 1, t: intent.type, c: intent.circleId, by, ...(needsRound ? { r: intent.round } : {}) }, body)
  return { payload: await seal(circleKey, envelope), contentType: ENCRYPTED_CONTENT_TYPE, attributes, expires: intent.expires, flags }
}

type Reader = Pick<PublicArkivClient, "select" | "getTransactionReceipt" | "getBalance">
type Wallet = Pick<WalletArkivClient, "createEntity">

export class ArkivWriter {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly wallet: Wallet,
    private readonly reader: Reader,
    readonly address: Address,
    private readonly opts: { reconcileAttempts?: number; reconcileDelayMs?: number } = {},
  ) {}

  /** Serialized per writer instance (one per account). */
  create(intent: Intent, circleKey: CryptoKey | null): Promise<WriteOutcome> {
    const run = this.tail.then(() => this.createNow(intent, circleKey))
    this.tail = run.catch(() => undefined)
    return run
  }

  private async createNow(intent: Intent, circleKey: CryptoKey | null): Promise<WriteOutcome> {
    const opId = intent.opId ?? newOpId()
    if (intent.opId) {
      // A retry: maybe the first attempt landed after all.
      const found = await this.findByOpId(opId)
      if (found) return found
    }
    const params = await buildCreate(intent, this.address, circleKey, opId)
    if ((await this.reader.getBalance({ address: this.address })) === 0n) throw new NeedsGasError(this.address)

    try {
      const created = await this.wallet.createEntity(params)
      // createEntity waited for a successful receipt and decoded the key from its EntityCreated log.
      const receipt = await this.reader.getTransactionReceipt({ hash: created.txHash }).catch(() => undefined)
      return { status: "confirmed", entityKey: created.entityKey.toLowerCase() as Hex, txHash: created.txHash,
        block: receipt?.blockNumber ?? 0n, opId, reconciled: false }
    } catch (error) {
      if (!(error instanceof EntityMutationError)) {
        // Encoding/validation errors are thrown before anything is signed.
        return { status: "failed", opId, reason: error instanceof Error ? error.name : "error" }
      }
      return this.reconcile(opId, error.txHash)
    }
  }

  /** Decide what actually happened, without sending anything. */
  async reconcile(opId: string, txHash?: Hash): Promise<WriteOutcome> {
    const attempts = this.opts.reconcileAttempts ?? 5
    const delay = this.opts.reconcileDelayMs ?? 3_000
    for (let i = 0; i < attempts; i++) {
      if (txHash) {
        const receipt = await this.reader.getTransactionReceipt({ hash: txHash }).catch(() => undefined)
        if (receipt?.status === "reverted") return { status: "failed", opId, txHash, reason: "reverted" }
        if (receipt?.status === "success") {
          const created = receipt.logs
            .filter((l) => l.address.toLowerCase() === ARKIV_ADDRESS)
            .map((l) => { try { return decodeEventLog({ abi: ENTITY_EVENTS_ABI, data: l.data, topics: l.topics }) } catch { return undefined } })
            .find((e) => e?.eventName === "EntityCreated")
          if (created?.eventName === "EntityCreated") {
            return { status: "confirmed", entityKey: created.args.entityKey.toLowerCase() as Hex, txHash, block: receipt.blockNumber, opId, reconciled: true }
          }
        }
      }
      const found = await this.findByOpId(opId)
      if (found) return { ...found, ...(txHash && { txHash }) }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay))
    }
    return { status: "unconfirmed", opId, ...(txHash && { txHash }), reason: "not_found_yet" }
  }

  private async findByOpId(opId: string): Promise<WriteOutcome | undefined> {
    const page = await this.reader.select({ key: true, createdAt: true })
      .where(eq("project", str(PROJECT)), eq("op_id", str(opId)))
      .createdBy(this.address)
      .limit(5)
      .fetch()
    const first = [...page.entities].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0))[0]
    if (!first) return undefined
    return { status: "confirmed", entityKey: first.key.toLowerCase() as Hex, block: first.createdAt, opId, reconciled: true }
  }
}

/** Expiration helpers (see arkiv/schema.md "Expiration"). */
export const expiry = {
  circle: (members: number, periodMs: number): Expiry =>
    ExpirationTime.fromDays(Math.ceil((members * periodMs) / 86_400_000) + 90),
  /** Dies with the circle — never before. */
  asCircle: (circleExpiresAt: bigint): Expiry => ExpirationTime.atBlock(circleExpiresAt, { atLeast: ExpirationTime.fromDays(1) }),
  invite: (): Expiry => ExpirationTime.fromHours(48),
  /** Until the estimated end of the reveal window plus a day; at least two days. */
  bidCommit: (msUntilRevealEnd: number): Expiry =>
    ExpirationTime.fromDays(Math.max(2, Math.ceil(Math.max(0, msUntilRevealEnd) / 86_400_000) + 1)),
}
