import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTRIBUTION_UPGRADE_THRESHOLDS,
  DEFAULT_PRO_AI_MONTHLY_LIMIT,
  ENTITLEMENT_LIMIT_ERROR_CODE,
  EntitlementLimitError,
  evaluateContributionUpgrade,
  getUserLimits,
  isEntitlementLimitError,
  isContributionUpgradeProgramEnabled,
  resolveAiMonthlyLimit,
  resolveEntitlementUserType,
  resolveProAiMonthlyLimit,
} from '../src/lib/entitlement-policy.ts'

test('database entitlement principals resolve fail-closed with admin precedence', () => {
  assert.equal(resolveEntitlementUserType({ user_type: 'free', is_admin: 1 }), 'admin')
  assert.equal(resolveEntitlementUserType({ user_type: 'pro', is_admin: 'true' }), 'admin')
  assert.equal(resolveEntitlementUserType({ user_type: 'admin', is_admin: 0 }), 'admin')
  assert.equal(resolveEntitlementUserType({ user_type: 'pro', is_admin: 0 }), 'pro')

  for (const user_type of [undefined, null, 'premium', 'PRO', '', 7]) {
    assert.equal(resolveEntitlementUserType({ user_type, is_admin: 0 }), 'free')
  }
})

test('entitlement limit errors carry a stable resource and finite limit contract', () => {
  const error = new EntitlementLimitError('prompt', 50)
  assert.equal(error.name, 'EntitlementLimitError')
  assert.equal(error.code, ENTITLEMENT_LIMIT_ERROR_CODE)
  assert.equal(error.resource, 'prompt')
  assert.equal(error.limit, 50)
  assert.equal(isEntitlementLimitError(error), true)

  assert.equal(isEntitlementLimitError({
    name: 'EntitlementLimitError',
    code: ENTITLEMENT_LIMIT_ERROR_CODE,
    resource: 'folder',
    limit: 10,
  }), true)

  for (const invalid of [
    null,
    new Error('ordinary failure'),
    { name: 'EntitlementLimitError', code: ENTITLEMENT_LIMIT_ERROR_CODE, resource: 'user', limit: 10 },
    { name: 'EntitlementLimitError', code: ENTITLEMENT_LIMIT_ERROR_CODE, resource: 'prompt', limit: -1 },
  ]) {
    assert.equal(isEntitlementLimitError(invalid), false)
  }

  assert.throws(() => new EntitlementLimitError('folder', -1), RangeError)
  assert.throws(() => new EntitlementLimitError('folder', Number.POSITIVE_INFINITY), RangeError)
})

test('contribution upgrades are disabled unless explicitly enabled', () => {
  assert.equal(isContributionUpgradeProgramEnabled({}), false)
  assert.equal(isContributionUpgradeProgramEnabled({ ENABLE_CONTRIBUTION_UPGRADES: '1' }), false)
  assert.equal(isContributionUpgradeProgramEnabled({ ENABLE_CONTRIBUTION_UPGRADES: 'false' }), false)
  assert.equal(isContributionUpgradeProgramEnabled({ ENABLE_CONTRIBUTION_UPGRADES: ' TRUE ' }), true)
})

test('contribution upgrades require every bounded condition', () => {
  const almostEligible = evaluateContributionUpgrade({
    publicPrompts: CONTRIBUTION_UPGRADE_THRESHOLDS.public_prompts,
    totalPrompts: CONTRIBUTION_UPGRADE_THRESHOLDS.total_prompts,
    distinctExternalFavoriters: CONTRIBUTION_UPGRADE_THRESHOLDS.favorites_received - 1,
  })
  assert.equal(almostEligible.conditionsMet, 2)
  assert.equal(almostEligible.conditionsRequired, 3)
  assert.equal(almostEligible.canUpgrade, false)

  const eligible = evaluateContributionUpgrade({
    publicPrompts: CONTRIBUTION_UPGRADE_THRESHOLDS.public_prompts,
    totalPrompts: CONTRIBUTION_UPGRADE_THRESHOLDS.total_prompts,
    distinctExternalFavoriters: CONTRIBUTION_UPGRADE_THRESHOLDS.favorites_received,
  })
  assert.equal(eligible.conditionsMet, 3)
  assert.equal(eligible.canUpgrade, true)
})

test('Pro AI quota is bounded with a safe default and admin alone is unlimited', () => {
  assert.equal(resolveProAiMonthlyLimit({}), DEFAULT_PRO_AI_MONTHLY_LIMIT)
  assert.equal(resolveProAiMonthlyLimit({ PRO_AI_MONTHLY_LIMIT: '250' }), 250)

  for (const invalidValue of ['0', '-1', '10001', '1.5', 'not-a-number']) {
    assert.equal(
      resolveProAiMonthlyLimit({ PRO_AI_MONTHLY_LIMIT: invalidValue }),
      DEFAULT_PRO_AI_MONTHLY_LIMIT,
    )
  }

  assert.equal(resolveAiMonthlyLimit('free', { PRO_AI_MONTHLY_LIMIT: '250' }), 10)
  assert.equal(resolveAiMonthlyLimit('pro', { PRO_AI_MONTHLY_LIMIT: '250' }), 250)
  assert.equal(resolveAiMonthlyLimit('admin', { PRO_AI_MONTHLY_LIMIT: '250' }), -1)

  assert.deepEqual(getUserLimits('free'), {
    max_prompts: 50,
    max_ai_usage_per_month: 10,
    max_folders: 10,
  })
  assert.deepEqual(getUserLimits('pro', { PRO_AI_MONTHLY_LIMIT: '250' }), {
    max_prompts: -1,
    max_ai_usage_per_month: 250,
    max_folders: -1,
  })
  assert.equal(getUserLimits('admin').max_ai_usage_per_month, -1)
})
