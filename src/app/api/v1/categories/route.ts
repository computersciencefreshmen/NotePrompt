import { NextRequest, NextResponse } from 'next/server'

// 硬编码分类数据，测试用
const categories = [
  { id: 1, name: '写作助手', description: '文案、文章创作', color: 'blue', icon: 'pen', sort_order: 1, is_active: true },
  { id: 2, name: '编程开发', description: '代码生成、调试', color: 'green', icon: 'code', sort_order: 2, is_active: true },
  { id: 3, name: '教育学习', description: '学习计划、知识总结', color: 'purple', icon: 'book', sort_order: 3, is_active: true },
  { id: 4, name: '商业营销', description: '营销策划、商业分析', color: 'orange', icon: 'briefcase', sort_order: 4, is_active: true },
  { id: 5, name: '创意设计', description: '设计理念、创意思维', color: 'pink', icon: 'palette', sort_order: 5, is_active: true },
  { id: 6, name: '其他', description: '未分类提示词', color: 'gray', icon: 'more', sort_order: 99, is_active: true }
]

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      data: categories
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: '获取分类失败' },
      { status: 500 }
    )
  }
}
