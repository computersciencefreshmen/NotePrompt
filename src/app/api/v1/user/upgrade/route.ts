import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import {
  evaluateContributionUpgrade,
  isContributionUpgradeProgramEnabled,
  type ContributionCounts,
} from '@/lib/entitlement-policy'

type CountRow = { count?: number | string }

function readCount(rows: unknown) {
  const count = Number((rows as CountRow[])[0]?.count)
  return Number.isSafeInteger(count) && count >= 0 ? count : 0
}

async function getContributionCounts(userId: number): Promise<ContributionCounts> {
  const [publicPromptsResult, totalPromptsResult, externalFavoritersResult] = await Promise.all([
    db.query('SELECT COUNT(*) AS count FROM public_prompts WHERE author_id = ?', [userId]),
    db.query('SELECT COUNT(*) AS count FROM user_prompts WHERE user_id = ?', [userId]),
    db.query(
      `SELECT COUNT(DISTINCT uf.user_id) AS count
         FROM user_favorites uf
         JOIN public_prompts pp ON uf.public_prompt_id = pp.id
        WHERE pp.author_id = ? AND uf.user_id <> ?`,
      [userId, userId],
    ),
  ])

  return {
    publicPrompts: readCount(publicPromptsResult.rows),
    totalPrompts: readCount(totalPromptsResult.rows),
    distinctExternalFavoriters: readCount(externalFavoritersResult.rows),
  }
}

// GET - 获取贡献升级计划状态与进度。
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const programEnabled = isContributionUpgradeProgramEnabled()
    if (!programEnabled) {
      const progress = evaluateContributionUpgrade({
        publicPrompts: 0,
        totalPrompts: 0,
        distinctExternalFavoriters: 0,
      })
      return NextResponse.json({
        success: true,
        data: {
          currentType: auth.user.user_type,
          programEnabled: false,
          ...progress,
          canUpgrade: false,
          extras: { publicFolders: 0 },
        },
      })
    }

    const [counts, publicFoldersResult] = await Promise.all([
      getContributionCounts(auth.user.id),
      db.query('SELECT COUNT(*) AS count FROM public_folders WHERE user_id = ?', [auth.user.id]),
    ])
    const progress = evaluateContributionUpgrade(counts)

    return NextResponse.json({
      success: true,
      data: {
        currentType: auth.user.user_type,
        programEnabled: true,
        ...progress,
        extras: {
          publicFolders: readCount(publicFoldersResult.rows),
        },
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: '获取升级进度失败' },
      { status: 500 },
    )
  }
}

// POST - 执行贡献升级。生产默认关闭，必须由部署环境显式启用。
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    if (!isContributionUpgradeProgramEnabled()) {
      return NextResponse.json(
        { success: false, error: '贡献升级计划当前未开放' },
        { status: 403 },
      )
    }

    if (auth.user.user_type === 'pro' || auth.user.user_type === 'admin') {
      return NextResponse.json({
        success: false,
        error: auth.user.user_type === 'admin' ? '管理员账号无需升级' : '您已经是 Pro 用户',
      }, { status: 400 })
    }

    const progress = evaluateContributionUpgrade(await getContributionCounts(auth.user.id))
    if (!progress.canUpgrade) {
      return NextResponse.json({
        success: false,
        error: `未满足升级条件，需要同时满足全部 ${progress.conditionsRequired} 项贡献要求`,
      }, { status: 400 })
    }

    // 条件复核后的写入仍限制为 free，避免并发角色变更被覆盖。
    const updateResult = await db.query(
      `UPDATE users
          SET user_type = 'pro',
              session_version = COALESCE(session_version, 1) + 1,
              updated_at = NOW()
        WHERE id = ? AND user_type = 'free'`,
      [auth.user.id],
    )
    if (Number((updateResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '账号状态已变化，请重新登录后重试' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      message: '恭喜！您已成功升级为 Pro 用户',
      data: {
        newType: 'pro',
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: '升级失败，请稍后重试' },
      { status: 500 },
    )
  }
}
