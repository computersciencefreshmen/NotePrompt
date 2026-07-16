export type MergedPaginationWindow = Readonly<{
  databaseOffset: number
  databaseLimit: number
  localOffset: number
}>

export function mergedPaginationWindow(
  offset: number,
  limit: number,
  sidecarItemCount: number,
): MergedPaginationWindow {
  for (const [name, value] of Object.entries({ offset, limit, sidecarItemCount })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`)
    }
  }
  if (limit === 0) throw new RangeError('limit must be greater than zero')

  const databaseOffset = Math.max(0, offset - sidecarItemCount)
  return Object.freeze({
    databaseOffset,
    databaseLimit: limit + sidecarItemCount,
    localOffset: offset - databaseOffset,
  })
}
