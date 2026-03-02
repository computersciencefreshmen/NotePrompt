import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// Pro 升级门槛配置
const PRO_UPGRADE_THRESHOLDS = {
  public_prompts: 10,    // 发布 10 个公共提示词
  total_prompts: 20,     // 创建 20 个提示词（含私有）
  favorites_received: 5, // 获得 5 次收藏
}

// GET - 获取升级进度
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const userId = auth.user.id

    // 并行查询各项贡献数据
    const [
      publicPromptsResult,
      totalPromptsResult,
      favoritesReceivedResult,
      publicFoldersResult,
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM public_prompts WHERE author_id = ?', [String(userId)]),
      db.query('SELECT COUNT(*) as count FROM user_prompts WHERE user_id = ?', [String(userId)]),
      db.query(`
        SELECT COUNT(*) as count FROM user_favorites uf 
        JOIN public_prompts pp ON uf.public_prompt_id = pp.id 
        WHERE pp.author_id = ?
      `, [String(userId)]),
      db.query('SELECT COUNT(*) as count FROM public_folders WHERE user_id = ?', [String(userId)]),
    ])

    const publicPrompts = (publicPromptsResult.rows as { count: number }[])[0].count
    const totalPrompts = (totalPromptsResult.rows as { count: number }[])[0].count
    const favoritesReceived = (favoritesReceivedResult.rows as { count: number }[])[0].count
    const publicFolders = (publicFoldersResult.rows as { count: number }[])[0].count

    // 计算升级条件满足情况
    const conditions = {
      public_prompts: {
        current: publicPrompts,
        required: PRO_UPGRADE_THRESHOLDS.public_prompts,
        met: publicPrompts >= PRO_UPGRADE_THRESHOLDS.public_prompts,
        label: '发布公共提示词',
      },
      total_prompts: {
        current: totalPrompts,
        required: PRO_UPGRADE_THRESHOLDS.total_prompts,
        met: totalPrompts >= PRO_UPGRADE_THRESHOLDS.total_prompts,
        label: '创建提示词总数',
      },
      favorites_received: {
        current: favoritesReceived,
        required: PRO_UPGRADE_THRESHOLDS.favorites_received,
        met: favoritesReceived >= PRO_UPGRADE_THRESHOLDS.favorites_received,
        label: '获得收藏数',
      },
    }

    // 需要满足所有条件中的至少 2 项
    const conditionsMet = Object.values(conditions).filter(c => c.met).length
    const canUpgrade = conditionsMet >= 2

    return NextResponse.json({
      success: true,
      data: {
        currentType: auth.user.user_type,
        canUpgrade,
        conditionsMet,
        conditionsRequired: 2,
        conditions,
        extras: {
          publicFolders,
        }
      }
    })
  } catch (error) {
    console.error('获取升级进度失败:', error)
    return NextResponse.json(
      { success: false, error: '获取升级进度失败' },
      { status: 500 }
    )
  }
}

// POST - 执行升级到 Pro
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const userId = auth.user.id

    // 检查当前类型
    if (auth.user.user_type === 'pro' || auth.user.user_type === 'admin') {
      return NextResponse.json({
        success: false,
        error: auth.user.user_type === 'admin' ? '管理员账号无需升级' : '您已经是 Pro 用户'
      }, { status: 400 })
    }

    // 重新验证升级条件
    const [publicPromptsResult, totalPromptsResult, favoritesReceivedResult] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM public_prompts WHERE author_id = ?', [String(userId)]),
      db.query('SELECT COUNT(*) as count FROM user_prompts WHERE user_id = ?', [String(userId)]),
      db.query(`
        SELECT COUNT(*) as count FROM user_favorites uf 
        JOIN public_prompts pp ON uf.public_prompt_id = pp.id 
        WHERE pp.author_id = ?
      `, [String(userId)]),
    ])

    const publicPrompts = (publicPromptsResult.rows as { count: number }[])[0].count
    const totalPrompts = (totalPromptsResult.rows as { count: number }[])[0].count
    const favoritesReceived = (favoritesReceivedResult.rows as { count: number }[])[0].count

    let met = 0
    if (publicPrompts >= PRO_UPGRADE_THRESHOLDS.public_prompts) met++
    if (totalPrompts >= PRO_UPGRADE_THRESHOLDS.total_prompts) met++
    if (favoritesReceived >= PRO_UPGRADE_THRESHOLDS.favorites_received) met++

    if (met < 2) {
      return NextResponse.json({
        success: false,
        error: '未满足升级条件，需要满足至少 2 项贡献要求'
      }, { status: 400 })
    }

    // 执行升级
    await db.query('UPDATE users SET user_type = ? WHERE id = ?', ['pro', String(userId)])

    return NextResponse.json({
      success: true,
      message: '恭喜！您已成功升级为 Pro 用户',
      data: {
        newType: 'pro'
      }
    })
  } catch (error) {
    console.error('升级失败:', error)
    return NextResponse.json(
      { success: false, error: '升级失败，请稍后重试' },
      { status: 500 }
    )
  }
}
