export class WorkQueueCapacityError extends Error {
  constructor() {
    super('Work queue capacity reached')
    this.name = 'WorkQueueCapacityError'
  }
}

export class WorkQueueTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for work capacity')
    this.name = 'WorkQueueTimeoutError'
  }
}

export class WorkQueueAbortedError extends Error {
  constructor() {
    super('Aborted while waiting for work capacity')
    this.name = 'WorkQueueAbortedError'
  }
}

type Waiter = {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
  signal?: AbortSignal
  abortHandler?: () => void
  settled: boolean
}

export class BoundedWorkPool {
  private active = 0
  private readonly waiters: Waiter[] = []
  private readonly concurrency: number
  private readonly maxQueued: number
  private readonly maxWaitMs: number

  constructor(
    concurrency: number,
    maxQueued: number,
    maxWaitMs: number,
  ) {
    for (const [name, value] of Object.entries({ concurrency, maxQueued, maxWaitMs })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`)
      }
    }
    this.concurrency = concurrency
    this.maxQueued = maxQueued
    this.maxWaitMs = maxWaitMs
  }

  private settleWaiter(waiter: Waiter, error?: Error) {
    if (waiter.settled) return false
    waiter.settled = true

    const index = this.waiters.indexOf(waiter)
    if (index >= 0) this.waiters.splice(index, 1)
    if (waiter.timer) {
      clearTimeout(waiter.timer)
      waiter.timer = null
    }
    if (waiter.signal && waiter.abortHandler) {
      waiter.signal.removeEventListener('abort', waiter.abortHandler)
      waiter.abortHandler = undefined
    }

    if (error) waiter.reject(error)
    else waiter.resolve()
    return true
  }

  private acquire(signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject(new WorkQueueAbortedError())
    }
    if (this.active < this.concurrency) {
      this.active += 1
      return Promise.resolve()
    }
    if (this.waiters.length >= this.maxQueued) {
      return Promise.reject(new WorkQueueCapacityError())
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: null,
        signal,
        settled: false,
      }
      waiter.timer = setTimeout(() => {
        this.settleWaiter(waiter, new WorkQueueTimeoutError())
      }, this.maxWaitMs)
      if (signal) {
        waiter.abortHandler = () => {
          this.settleWaiter(waiter, new WorkQueueAbortedError())
        }
        signal.addEventListener('abort', waiter.abortHandler, { once: true })
      }
      this.waiters.push(waiter)
      if (signal?.aborted) waiter.abortHandler?.()
    })
  }

  private release() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0]
      if (this.settleWaiter(waiter)) return
      this.waiters.shift()
    }
    this.active -= 1
  }

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      return await work()
    } finally {
      this.release()
    }
  }
}
