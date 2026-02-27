import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// PUT - 更新公共文件夹
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()

    console.log('Update public folder API: Received data:', {
      folderId: id,
      body: body
    })

    // 更新公共文件夹
    const updateFields = []
    const updateValues = []

    if (body.name !== undefined) {
      updateFields.push('name = ?')
      updateValues.push(body.name)
    }
    if (body.description !== undefined) {
      updateFields.push('description = ?')
      updateValues.push(body.description)
    }
    if (body.is_featured !== undefined) {
      updateFields.push('is_featured = ?')
      updateValues.push(body.is_featured)
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
    console.log('Update public folder API: Executing query:', {
      query: query,
      values: updateValues
    })
    await db.query(query, updateValues)

    return NextResponse.json({
      success: true,
      message: '公共文件夹更新成功'
    })
  } catch (error) {
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
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    
    // 检查管理员权限
    if (!auth.user.is_admin) {
      return NextResponse.json(
        { success: false, error: '需要管理员权限' },
        { status: 403 }
      )
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)

    // 删除公共文件夹
    await db.query('DELETE FROM public_folders WHERE id = ?', [id])

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