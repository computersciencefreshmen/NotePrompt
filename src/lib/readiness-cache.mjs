/**
 * Coalesces concurrent readiness probes and briefly caches both healthy and
 * unhealthy results. The injected clock keeps the policy deterministic in
 * tests and avoids coupling it to HTTP or database code.
 *
 * @param {{
 *   probe: () => Promise<void>,
 *   ttlMs: number,
 *   now?: () => number,
 *   onError?: (error: unknown) => void,
 * }} options
 */
export function createCachedReadinessProbe({
  probe,
  ttlMs,
  now = Date.now,
  onError = () => {},
}) {
  if (typeof probe !== 'function') throw new TypeError('probe must be a function')
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new TypeError('ttlMs must be non-negative')

  /** @type {{ ready: boolean, checkedAt: number } | null} */
  let latestSnapshot = null
  /** @type {Promise<{ ready: boolean, checkedAt: number }> | null} */
  let pendingCheck = null

  return async function getReadiness() {
    const currentTime = now()
    const cacheAge = latestSnapshot ? currentTime - latestSnapshot.checkedAt : null
    if (latestSnapshot && cacheAge !== null && cacheAge >= 0 && cacheAge < ttlMs) {
      return latestSnapshot
    }
    if (pendingCheck) return pendingCheck

    const check = Promise.resolve()
      .then(probe)
      .then(
        () => ({ ready: true, checkedAt: now() }),
        error => {
          onError(error)
          return { ready: false, checkedAt: now() }
        },
      )
      .then(snapshot => {
        latestSnapshot = snapshot
        return snapshot
      })
      .finally(() => {
        if (pendingCheck === check) pendingCheck = null
      })

    pendingCheck = check
    return check
  }
}
