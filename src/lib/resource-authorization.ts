export type OwnedResource = {
  id?: unknown
  user_id?: unknown
}

export function parsePositiveResourceId(value: unknown): number | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!/^[1-9]\d*$/.test(normalized)) return null
    const parsed = Number(normalized)
    return Number.isSafeInteger(parsed) ? parsed : null
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return null
  }

  return value
}

export function isOwnedResource<T extends OwnedResource>(
  resource: T | null | undefined,
  userId: number,
): resource is T {
  return resource != null && Number(resource.user_id) === userId
}

export async function findOwnedResource<T extends OwnedResource>(
  lookup: (id: number) => Promise<T | null | undefined>,
  id: number,
  userId: number,
): Promise<T | null> {
  const resource = await lookup(id)
  return isOwnedResource(resource, userId) ? resource : null
}

export function normalizeResourceIds(values: unknown[]): number[] | null {
  const parsedIds: number[] = []
  const seen = new Set<number>()

  for (const value of values) {
    const id = parsePositiveResourceId(value)
    if (id == null || seen.has(id)) return null
    seen.add(id)
    parsedIds.push(id)
  }

  return parsedIds
}

export function hasCompleteOwnership<T extends OwnedResource>(
  resources: T[],
  requestedIds: number[],
  userId: number,
): boolean {
  if (resources.length !== requestedIds.length) return false

  const requested = new Set(requestedIds)
  const matched = new Set<number>()

  for (const resource of resources) {
    const resourceId = parsePositiveResourceId(resource.id)
    if (
      resourceId == null ||
      !requested.has(resourceId) ||
      matched.has(resourceId) ||
      !isOwnedResource(resource, userId)
    ) {
      return false
    }
    matched.add(resourceId)
  }

  return matched.size === requested.size
}
