import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'

// GET - 获取公共文件夹详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)

    // 验证ID是否为有效数字
    if (isNaN(id) || id <= 0) {
      return NextResponse.json(
        { success: false, error: '无效的文件夹ID' },
        { status: 400 }
      )
    }

    // 获取文件夹详情
    const folder = await db.getPublicFolderById(id)
    if (!folder) {
      return NextResponse.json(
        { success: false, error: '文件夹不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: folder
    })
  } catch (error) {
    console.error('Get public folder error:', error)
    return NextResponse.json(
      { success: false, error: '获取文件夹失败' },
      { status: 500 }
    )
  }
}

// PUT - 用户编辑自己发布的公共文件夹
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('开始编辑公共文件夹...')
    
    const auth = await requireAuth(request)
    if ('error' in auth) {
      console.log('认证失败:', auth.error)
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()
    console.log('编辑数据:', body)

    // 检查公共文件夹是否存在
    const folder = await db.getPublicFolderById(id)
    if (!folder) {
      console.log('文件夹不存在')
      return NextResponse.json(
        { success: false, error: '公共文件夹不存在' },
        { status: 404 }
      )
    }

    // 检查权限 - 只能编辑自己发布的文件夹
    if ((folder as any).user_id !== userId) {
      console.log('权限检查失败:', { folderUserId: (folder as any).user_id, currentUserId: userId })
      return NextResponse.json(
        { success: false, error: '没有权限编辑此文件夹' },
        { status: 403 }
      )
    }

    // 更新公共文件夹
    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description

    console.log('更新数据:', updateData)

    const query = `
      UPDATE public_folders 
      SET ${Object.keys(updateData).map(key => `${key} = ?`).join(', ')}, updated_at = NOW()
      WHERE id = ?
    `
    const values = [...Object.values(updateData), id]
    console.log('执行查询:', query)
    console.log('查询参数:', values)
    
    await db.query(query, values)
    console.log('更新成功')

    const updatedFolder = await db.getPublicFolderById(id)

    return NextResponse.json({
      success: true,
      data: updatedFolder,
      message: '公共文件夹更新成功'
    })
  } catch (error) {
    console.error('Update public folder error:', error)
    return NextResponse.json(
      { success: false, error: '更新公共文件夹失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 