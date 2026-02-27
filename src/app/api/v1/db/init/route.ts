import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    // 检查数据库连接
    console.log('开始初始化MySQL数据库...')
    
    // 读取并执行MySQL schema
    
    try {
      // 直接执行预定义的MySQL schema
      const schemaPath = path.join(process.cwd(), 'database', 'mysql-schema-new.sql')
      const schema = fs.readFileSync(schemaPath, 'utf8')

      // 分割SQL语句（按分号分割，跳过注释）
      const statements = schema
        .split(';')
        .map((stmt: string) => stmt.trim())
        .filter((stmt: string) => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'))
      
      console.log(`执行 ${statements.length} 条SQL语句...`)
      
      for (const statement of statements) {
        if (statement.trim()) {
          await db.query(statement)
        }
      }
      
      console.log('MySQL数据库初始化完成')
      
    } catch (schemaError) {
      console.warn('无法读取schema文件，使用手动建表:', schemaError)

      // 备用方案：手动创建表
      await createTablesManually()
    }

    return NextResponse.json({
      success: true,
      message: 'MySQL数据库初始化完成'
    })

  } catch (error) {
    console.error('Database initialization error:', error)
    return NextResponse.json({
      success: false,
      error: 'MySQL数据库初始化失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// 备用手动建表函数
async function createTablesManually() {
  console.log('使用手动建表方式...')
  
  // 创建用户表
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar_url VARCHAR(255),
      user_type ENUM('free', 'premium', 'admin') DEFAULT 'free',
      is_admin BOOLEAN DEFAULT false,
      permissions JSON DEFAULT '["create_prompt", "favorite_prompt"]',
      is_active BOOLEAN DEFAULT true,
      email_verified BOOLEAN DEFAULT false,
      verification_code VARCHAR(10),
      verification_expires TIMESTAMP NULL,
      verification_attempts INT DEFAULT 0,
      email_verify_sent_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_username (username),
      INDEX idx_email (email),
      INDEX idx_verification_code (verification_code),
      INDEX idx_verification_expires (verification_expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建分类表
  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      description TEXT,
      color VARCHAR(7) DEFAULT '#6366f1',
      is_active BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建文件夹表
  await db.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      user_id INT NOT NULL,
      parent_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_parent_id (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建用户私有提示词表
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_prompts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      description TEXT,
      user_id INT NOT NULL,
      folder_id INT DEFAULT NULL,
      category_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_folder_id (folder_id),
      INDEX idx_category_id (category_id),
      INDEX idx_created_at (created_at),
      FULLTEXT idx_search (title, content, description)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建公共提示词表
  await db.query(`
    CREATE TABLE IF NOT EXISTS public_prompts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      description TEXT,
      author_id INT NOT NULL,
      category_id INT DEFAULT NULL,
      views_count INT DEFAULT 0,
      is_featured BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      INDEX idx_author_id (author_id),
      INDEX idx_category_id (category_id),
      INDEX idx_featured (is_featured),
      INDEX idx_created_at (created_at),
      FULLTEXT idx_search (title, content, description)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建用户收藏表
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      public_prompt_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (public_prompt_id) REFERENCES public_prompts(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_public_prompt (user_id, public_prompt_id),
      INDEX idx_user_id (user_id),
      INDEX idx_public_prompt_id (public_prompt_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建标签表
  await db.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建用户提示词标签关联表
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_prompt_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_prompt_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_prompt_tag (user_prompt_id, tag_id),
      INDEX idx_user_prompt_id (user_prompt_id),
      INDEX idx_tag_id (tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建公共提示词标签关联表
  await db.query(`
    CREATE TABLE IF NOT EXISTS public_prompt_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      public_prompt_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (public_prompt_id) REFERENCES public_prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE KEY unique_public_prompt_tag (public_prompt_id, tag_id),
      INDEX idx_public_prompt_id (public_prompt_id),
      INDEX idx_tag_id (tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  // 创建用户使用统计表
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_usage_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      ai_optimize_count INT DEFAULT 0,
      monthly_usage INT DEFAULT 0,
      last_reset_date DATE DEFAULT (CURRENT_DATE),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  console.log('所有表创建完成')
}
