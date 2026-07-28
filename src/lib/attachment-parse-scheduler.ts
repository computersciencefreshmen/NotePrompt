import {
  BoundedWorkPool,
  WorkQueueCapacityError,
  WorkQueueTimeoutError,
} from './bounded-work-pool.ts'

export type AttachmentParseAdmissionScope = 'account' | 'global'
export type AttachmentParseAdmissionReason = 'capacity' | 'timeout'

export class AttachmentParseAdmissionError extends Error {
  readonly scope: AttachmentParseAdmissionScope
  readonly reason: AttachmentParseAdmissionReason

  constructor(scope: AttachmentParseAdmissionScope, reason: AttachmentParseAdmissionReason) {
    super(`${scope} attachment parse ${reason}`)
    this.name = 'AttachmentParseAdmissionError'
    this.scope = scope
    this.reason = reason
  }
}

type AttachmentParseSchedulerOptions = {
  globalConcurrency?: number
  globalMaxQueued?: number
  accountConcurrency?: number
  accountMaxQueued?: number
  maxWaitMs?: number
}

type AccountPoolEntry = {
  pool: BoundedWorkPool
  references: number
}

function queueBusyReason(error: unknown): AttachmentParseAdmissionReason | null {
  if (error instanceof WorkQueueCapacityError) return 'capacity'
  if (error instanceof WorkQueueTimeoutError) return 'timeout'
  return null
}

export class AttachmentParseScheduler {
  private readonly globalPool: BoundedWorkPool
  private readonly accountPools = new Map<number, AccountPoolEntry>()
  private readonly accountConcurrency: number
  private readonly accountMaxQueued: number
  private readonly maxWaitMs: number

  constructor(options: AttachmentParseSchedulerOptions = {}) {
    const globalConcurrency = options.globalConcurrency ?? 2
    const globalMaxQueued = options.globalMaxQueued ?? 4
    this.accountConcurrency = options.accountConcurrency ?? 1
    this.accountMaxQueued = options.accountMaxQueued ?? 1
    this.maxWaitMs = options.maxWaitMs ?? 3_000
    this.globalPool = new BoundedWorkPool(globalConcurrency, globalMaxQueued, this.maxWaitMs)
    // Construct once to apply the same fail-closed numeric validation to account settings.
    void new BoundedWorkPool(this.accountConcurrency, this.accountMaxQueued, this.maxWaitMs)
  }

  private getAccountPool(accountId: number) {
    let entry = this.accountPools.get(accountId)
    if (!entry) {
      entry = {
        pool: new BoundedWorkPool(
          this.accountConcurrency,
          this.accountMaxQueued,
          this.maxWaitMs,
        ),
        references: 0,
      }
      this.accountPools.set(accountId, entry)
    }
    entry.references += 1
    return entry
  }

  private releaseAccountPool(accountId: number, entry: AccountPoolEntry) {
    entry.references -= 1
    if (entry.references === 0 && this.accountPools.get(accountId) === entry) {
      this.accountPools.delete(accountId)
    }
  }

  private async runGlobal<T>(work: () => Promise<T>, signal?: AbortSignal) {
    try {
      return await this.globalPool.run(work, signal)
    } catch (error) {
      const reason = queueBusyReason(error)
      if (reason) throw new AttachmentParseAdmissionError('global', reason)
      throw error
    }
  }

  async run<T>(accountId: number, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      throw new RangeError('accountId must be a positive safe integer')
    }

    const entry = this.getAccountPool(accountId)
    try {
      try {
        return await entry.pool.run(() => this.runGlobal(work, signal), signal)
      } catch (error) {
        if (error instanceof AttachmentParseAdmissionError) throw error
        const reason = queueBusyReason(error)
        if (reason) throw new AttachmentParseAdmissionError('account', reason)
        throw error
      }
    } finally {
      this.releaseAccountPool(accountId, entry)
    }
  }
}

export const attachmentParseScheduler = new AttachmentParseScheduler()
