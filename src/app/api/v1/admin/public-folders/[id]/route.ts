import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAdminAuth } from '@/lib/auth'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import { parsePositiveResourceId } from '@/lib/resource-authorization'

const MAX_ADMIN_FOLDER_BODY_BYTES = 16 * 1024
const MAX_ADMIN_FOLDER_NAME_CHARS = 100
const MAX_ADMIN_FOLDER_DESCRIPTION_CHARS = 5_000

// PUT - 更新公共文件夹
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 },
      )
    }
    const body = await readLimitedJson<Record<string, unknown>>(
      request,
      MAX_ADMIN_FOLDER_BODY_BYTES,
    )
    if (Object.keys(body).some(key => !['name', 'description', 'is_featured'].includes(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }

    // 更新公共文件夹
    const updateFields: string[] = []
    const updateValues: Array<string | number | null> = []

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > MAX_ADMIN_FOLDER_NAME_CHARS) {
        return NextResponse.json(
          { success: false, error: `名称必须为 1-${MAX_ADMIN_FOLDER_NAME_CHARS} 个字符` },
          { status: 400 },
        )
      }
      updateFields.push('name = ?')
      updateValues.push(body.name.trim())
    }
    if (body.description !== undefined) {
      if (
        body.description !== null &&
        (typeof body.description !== 'string' || body.description.length > MAX_ADMIN_FOLDER_DESCRIPTION_CHARS)
      ) {
        return NextResponse.json(
          { success: false, error: `描述不能超过 ${MAX_ADMIN_FOLDER_DESCRIPTION_CHARS} 个字符` },
          { status: 400 },
        )
      }
      updateFields.push('description = ?')
      updateValues.push(body.description === null ? null : body.description.trim() || null)
    }
    if (body.is_featured !== undefined) {
      if (typeof body.is_featured !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'is_featured 必须是布尔值' },
          { status: 400 },
        )
      }
      updateFields.push('is_featured = ?')
      updateValues.push(body.is_featured ? 1 : 0)
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有提供更新字段' },
        { status: 400 }
      )
    }

    updateFields.push('updated_at = NOW()')
    updateValues.push(id)

    const query = `UPDATE public_folders SET ${updateFields.join(', ')} WHERE id = ?`
    const updateResult = await db.query(query, updateValues)
    const affectedRows = Number((updateResult.rows as { affectedRows?: number }).affectedRows)
    if (affectedRows > 1) throw new Error('Admin folder update affected more than one row')
    if (affectedRows === 0) {
      const existingResult = await db.query('SELECT id FROM public_folders WHERE id = ? LIMIT 1', [id])
      if ((existingResult.rows as Record<string, unknown>[]).length === 0) {
        return NextResponse.json(
          { success: false, error: '公共文件夹不存在' },
          { status: 404 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: '公共文件夹更新成功'
    })
  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    console.error('Update admin public folder error:', error)
    return NextResponse.json(
      { success: false, error: '更新公共文件夹失败' },
      { status: 500 }
    )
  }
}

// DELETE - 管理员删除公共文件夹
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 },
      )
    }

    // 删除公共文件夹
    const deleteResult = await db.query('DELETE FROM public_folders WHERE id = ?', [id])
    if (Number((deleteResult.rows as { affectedRows?: number }).affectedRows) !== 1) {
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: '公共文件夹删除成功'
    })
  } catch (error) {
    console.error('Delete admin public folder error:', error)
    return NextResponse.json(
      { success: false, error: '删除公共文件夹失败' },
      { status: 500 }
    )
  }
}
