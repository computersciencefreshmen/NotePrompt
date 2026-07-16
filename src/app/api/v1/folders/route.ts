import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { entitlementLimitResponse } from '@/lib/entitlement-http'

const MAX_FOLDER_BODY_BYTES = 8 * 1024
const MAX_FOLDER_NAME_CHARS = 100

// GET - 获取用户文件夹列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const folders = await db.getFoldersByUserId(userId)

    return NextResponse.json({
      success: true,
      data: folders
    })
  } catch (error) {
    console.error('Get folders error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹失败' },
      { status: 500 }
    )
  }
}

// POST - 创建新文件夹
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_FOLDER_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['name', 'parent_id'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const { name, parent_id } = body

    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_FOLDER_NAME_CHARS) {
      return NextResponse.json(
        { success: false, error: `文件夹名称必须为 1-${MAX_FOLDER_NAME_CHARS} 个字符` },
        { status: 400 }
      )
    }

    let parentId: number | null = null
    if (parent_id != null && parent_id !== '') {
      parentId = parsePositiveResourceId(parent_id)
      if (parentId == null) {
        return NextResponse.json(
          { success: false, error: '无效的父文件夹ID' },
          { status: 400 }
        )
      }

      const parentFolder = await db.getOwnedFolderById(parentId, userId)
      if (!parentFolder) {
        return NextResponse.json(
          { success: false, error: '父文件夹不存在' },
          { status: 404 }
        )
      }
    }

    const folder = await db.createFolder({
      name: name.trim(),
      user_id: userId,
      parent_id: parentId
    })

    return NextResponse.json({
      success: true,
      data: folder
    })
  } catch (error) {
    const limitResponse = entitlementLimitResponse(error)
    if (limitResponse) return limitResponse
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Create folder error:', error)
    return NextResponse.json(
      { success: false, error: '创建文件夹失败' },
      { status: 500 }
    )
  }
}
