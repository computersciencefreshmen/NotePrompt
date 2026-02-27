import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

/**
 * POST /api/v1/db/migrate
 * 执行数据库迁移 - 添加邮箱验证相关字段
 */
export async function POST(request: NextRequest) {
  try {
    console.log('开始执行数据库迁移...')

    // 检查是否已经包含 email_verified 字段
    const checkColumn = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'email_verified'
    `)

    if (checkColumn.rows && checkColumn.rows.length > 0) {
      return NextResponse.json({
        success: true,
        message: '数据库已经是最新版本，无需迁移'
      })
    }

    // 执行迁移 - 添加邮箱验证相关字段
    await db.query(`
      ALTER TABLE users
      ADD COLUMN email_verified BOOLEAN DEFAULT false COMMENT '邮箱是否已验证',
      ADD COLUMN verification_code VARCHAR(10) NULL COMMENT '邮箱验证码',
      ADD COLUMN verification_expires TIMESTAMP NULL COMMENT '验证码过期时间',
      ADD COLUMN verification_attempts INT DEFAULT 0 COMMENT '验证尝试次数',
      ADD COLUMN email_verify_sent_at TIMESTAMP NULL COMMENT '最后发送验证码的时间',
      ADD INDEX idx_verification_code (verification_code),
      ADD INDEX idx_verification_expires (verification_expires)
    `)

    // 更新现有用户的默认状态
    await db.query(`
      UPDATE users SET
        is_active = false,
        email_verified = false
      WHERE is_admin = 0
    `)

    console.log('数据库迁移完成')

    return NextResponse.json({
      success: true,
      message: '数据库迁移成功完成',
      changes: [
        'email_verified字段已添加',
        'verification_code字段已添加',
        'verification_expires字段已添加',
        'verification_attempts字段已添加',
        'email_verify_sent_at字段已添加',
        '相关索引已创建',
        '现有用户状态已更新'
      ]
    })

  } catch (error) {
    console.error('Database migration error:', error)
    return NextResponse.json({
      success: false,
      error: '数据库迁移失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
