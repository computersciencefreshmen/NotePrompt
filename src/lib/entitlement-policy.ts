export type EntitlementEnvironment = Record<string, string | undefined>
export type EntitlementUserType = 'free' | 'pro' | 'admin'
export type EntitlementResource = 'prompt' | 'folder'

export type DatabaseEntitlementPrincipal = Readonly<{
  user_type?: unknown
  is_admin?: unknown
}>

export const ENTITLEMENT_LIMIT_ERROR_CODE = 'ENTITLEMENT_LIMIT_REACHED' as const

export class EntitlementLimitError extends Error {
  readonly code = ENTITLEMENT_LIMIT_ERROR_CODE
  readonly resource: EntitlementResource
  readonly limit: number

  constructor(resource: EntitlementResource, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new RangeError('Entitlement limits must be non-negative safe integers')
    }

    super(`${resource} entitlement limit reached`)
    this.name = 'EntitlementLimitError'
    this.resource = resource
    this.limit = limit
  }
}

export function isEntitlementLimitError(value: unknown): value is EntitlementLimitError {
  if (value instanceof EntitlementLimitError) return true
  if (value == null || typeof value !== 'object') return false

  const candidate = value as Partial<EntitlementLimitError>
  return (
    candidate.name === 'EntitlementLimitError' &&
    candidate.code === ENTITLEMENT_LIMIT_ERROR_CODE &&
    (candidate.resource === 'prompt' || candidate.resource === 'folder') &&
    Number.isSafeInteger(candidate.limit) &&
    Number(candidate.limit) >= 0
  )
}

function databaseAdminFlag(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function resolveEntitlementUserType(
  principal: DatabaseEntitlementPrincipal,
): EntitlementUserType {
  if (databaseAdminFlag(principal.is_admin) || principal.user_type === 'admin') {
    return 'admin'
  }
  if (principal.user_type === 'pro') return 'pro'
  return 'free'
}

export const CONTRIBUTION_UPGRADE_THRESHOLDS = Object.freeze({
  public_prompts: 10,
  total_prompts: 20,
  favorites_received: 5,
})

export const FREE_AI_MONTHLY_LIMIT = 10
export const DEFAULT_PRO_AI_MONTHLY_LIMIT = 100
export const MIN_PRO_AI_MONTHLY_LIMIT = 1
export const MAX_PRO_AI_MONTHLY_LIMIT = 10_000

export type UserLimits = {
  max_prompts: number
  max_ai_usage_per_month: number
  max_folders: number
}

export const FREE_USER_LIMITS: Readonly<UserLimits> = Object.freeze({
  max_prompts: 50,
  max_ai_usage_per_month: FREE_AI_MONTHLY_LIMIT,
  max_folders: 10,
})

export const ADMIN_USER_LIMITS: Readonly<UserLimits> = Object.freeze({
  max_prompts: -1,
  max_ai_usage_per_month: -1,
  max_folders: -1,
})

export type ContributionCounts = {
  publicPrompts: number
  totalPrompts: number
  distinctExternalFavoriters: number
}

function normalizeCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function isContributionUpgradeProgramEnabled(
  environment: EntitlementEnvironment = process.env,
) {
  return environment.ENABLE_CONTRIBUTION_UPGRADES?.trim().toLowerCase() === 'true'
}

export function resolveProAiMonthlyLimit(
  environment: EntitlementEnvironment = process.env,
) {
  const rawValue = environment.PRO_AI_MONTHLY_LIMIT?.trim()
  if (!rawValue) return DEFAULT_PRO_AI_MONTHLY_LIMIT

  const parsed = Number(rawValue)
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_PRO_AI_MONTHLY_LIMIT ||
    parsed > MAX_PRO_AI_MONTHLY_LIMIT
  ) {
    return DEFAULT_PRO_AI_MONTHLY_LIMIT
  }
  return parsed
}

export function resolveAiMonthlyLimit(
  userType: EntitlementUserType,
  environment: EntitlementEnvironment = process.env,
) {
  if (userType === 'admin') return -1
  if (userType === 'pro') return resolveProAiMonthlyLimit(environment)
  return FREE_AI_MONTHLY_LIMIT
}

export function resolveProUserLimits(
  environment: EntitlementEnvironment = process.env,
): Readonly<UserLimits> {
  return Object.freeze({
    max_prompts: -1,
    max_ai_usage_per_month: resolveProAiMonthlyLimit(environment),
    max_folders: -1,
  })
}

// 兼容只读常量；需要测试或按显式环境求值时使用 resolveProUserLimits/getUserLimits。
export const PRO_USER_LIMITS = resolveProUserLimits()

export function getUserLimits(
  userType: EntitlementUserType,
  environment: EntitlementEnvironment = process.env,
): Readonly<UserLimits> {
  if (userType === 'admin') return ADMIN_USER_LIMITS
  if (userType === 'pro') return resolveProUserLimits(environment)
  return FREE_USER_LIMITS
}

export function evaluateContributionUpgrade(counts: ContributionCounts) {
  const publicPrompts = normalizeCount(counts.publicPrompts)
  const totalPrompts = normalizeCount(counts.totalPrompts)
  const distinctExternalFavoriters = normalizeCount(counts.distinctExternalFavoriters)
  const conditions = {
    public_prompts: {
      current: publicPrompts,
      required: CONTRIBUTION_UPGRADE_THRESHOLDS.public_prompts,
      met: publicPrompts >= CONTRIBUTION_UPGRADE_THRESHOLDS.public_prompts,
      label: '发布公共提示词',
    },
    total_prompts: {
      current: totalPrompts,
      required: CONTRIBUTION_UPGRADE_THRESHOLDS.total_prompts,
      met: totalPrompts >= CONTRIBUTION_UPGRADE_THRESHOLDS.total_prompts,
      label: '创建提示词总数',
    },
    favorites_received: {
      current: distinctExternalFavoriters,
      required: CONTRIBUTION_UPGRADE_THRESHOLDS.favorites_received,
      met: distinctExternalFavoriters >= CONTRIBUTION_UPGRADE_THRESHOLDS.favorites_received,
      label: '获得不同用户的收藏支持',
    },
  }
  const conditionsMet = Object.values(conditions).filter(condition => condition.met).length
  const conditionsRequired = Object.keys(conditions).length

  return {
    conditions,
    conditionsMet,
    conditionsRequired,
    canUpgrade: conditionsMet === conditionsRequired,
  }
}
