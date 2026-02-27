import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'

export async function POST(request: NextRequest) {
  try {
    console.log('开始创建public_folders表...')
    
    // 创建public_folders表
    await db.query(`
      CREATE TABLE IF NOT EXISTS public_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        user_id INT NOT NULL,
        original_folder_id INT NOT NULL,
        is_featured BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (original_folder_id) REFERENCES folders(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_featured (is_featured),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    
    console.log('public_folders表创建成功')
    
    return NextResponse.json({
      success: true,
      message: 'public_folders表创建成功'
    })

  } catch (error) {
    console.error('创建public_folders表失败:', error)
    return NextResponse.json({
      success: false,
      error: '创建public_folders表失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 