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

type Waiter = {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
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

  private acquire() {
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
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter)
          if (index >= 0) this.waiters.splice(index, 1)
          reject(new WorkQueueTimeoutError())
        }, this.maxWaitMs),
      }
      this.waiters.push(waiter)
    })
  }

  private release() {
    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve()
      return
    }
    this.active -= 1
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await work()
    } finally {
      this.release()
    }
  }
}
