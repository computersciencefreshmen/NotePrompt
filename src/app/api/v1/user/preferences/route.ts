import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import db from '@/lib/mysql-database'
import {
  mergeUserPreferences,
  normalizeUserPreferencesRow,
  parseUserPreferencesUpdate,
  serializePreferenceExtras,
} from '@/lib/user-preferences'

const MAX_PREFERENCES_BODY_BYTES = 16 * 1024

async function readPreferences(userId: number) {
  const result = await db.query(
    `SELECT locale, theme, default_editor_mode, preferences
     FROM user_preferences
     WHERE user_id = ?`,
    [userId],
  )
  return normalizeUserPreferencesRow(
    (result.rows as Record<string, unknown>[])[0],
  )
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    return NextResponse.json({ success: true, data: await readPreferences(auth.user.id) })
  } catch (error) {
    console.error('Get user preferences error:', error)
    return NextResponse.json(
      { success: false, error: '获取偏好设置失败' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request)
  if ('error' in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  try {
    const input = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_PREFERENCES_BODY_BYTES,
    )
    const update = parseUserPreferencesUpdate(input)
    const merged = mergeUserPreferences(await readPreferences(auth.user.id), update)

    await db.query(
      `INSERT INTO user_preferences
         (user_id, locale, theme, default_editor_mode, preferences)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         locale = VALUES(locale),
         theme = VALUES(theme),
         default_editor_mode = VALUES(default_editor_mode),
         preferences = VALUES(preferences),
         updated_at = CURRENT_TIMESTAMP`,
      [
        auth.user.id,
        merged.locale,
        merged.theme,
        merged.defaultEditorMode,
        serializePreferenceExtras(merged),
      ],
    )

    return NextResponse.json({
      success: true,
      data: merged,
      message: '偏好设置已保存',
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    if (error instanceof TypeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      )
    }
    console.error('Update user preferences error:', error)
    return NextResponse.json(
      { success: false, error: '保存偏好设置失败' },
      { status: 500 },
    )
  }
}
