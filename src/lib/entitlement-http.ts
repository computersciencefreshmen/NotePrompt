import 'server-only'

import { NextResponse } from 'next/server'
import { isEntitlementLimitError } from './entitlement-policy'

export function entitlementLimitResponse(error: unknown) {
  if (!isEntitlementLimitError(error)) return null

  const resourceLabel = error.resource === 'prompt' ? '提示词' : '文件夹'
  return NextResponse.json(
    {
      success: false,
      error: `当前方案最多可创建 ${error.limit} 个${resourceLabel}`,
      code: error.code,
      data: {
        resource: error.resource,
        limit: error.limit,
      },
    },
    { status: 409 },
  )
}
