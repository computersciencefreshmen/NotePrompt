export type ReservationSettlementState = 'pending' | 'committed' | 'rolled-back'

/**
 * Settles a compensating reservation exactly once. The state transition happens
 * before invoking the callback so concurrent commit/rollback attempts cannot
 * both mutate the backing counters.
 */
export class ReservationSettlement {
  private state: ReservationSettlementState = 'pending'

  get currentState() {
    return this.state
  }

  commit(onCommit: () => void) {
    if (this.state !== 'pending') return false
    this.state = 'committed'
    onCommit()
    return true
  }

  async rollback(onRollback: () => Promise<void> | void) {
    if (this.state !== 'pending') return false
    this.state = 'rolled-back'
    await onRollback()
    return true
  }
}
