-- 新的MySQL数据库表结构（简化版，移除点赞功能）
-- 确保数据库使用UTF8MB4编码
CREATE DATABASE IF NOT EXISTS agent_report CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agent_report;

-- 用户表（含邮箱验证字段）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分类表（保持不变）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文件夹表（保持不变，但移除默认文件夹创建）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户私有提示词表（新表）
CREATE TABLE IF NOT EXISTS user_prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  user_id INT NOT NULL,
  folder_id INT DEFAULT NULL, -- 允许为空，表示不属于任何文件夹
  category_id INT DEFAULT NULL,
  mode VARCHAR(20) DEFAULT 'normal', -- normal 或 professional
  is_public TINYINT(1) DEFAULT 0, -- 是否公开
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL, -- 文件夹删除不影响提示词
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_folder_id (folder_id),
  INDEX idx_category_id (category_id),
  INDEX idx_created_at (created_at),
  FULLTEXT idx_search (title, content, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公共提示词表（新表，完全独立，移除点赞相关字段）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户收藏表（关联公共提示词）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 标签表（保持不变）
CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户提示词标签关联表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公共提示词标签关联表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户使用统计表（保持不变）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公共文件夹表
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
  INDEX idx_original_folder_id (original_folder_id),
  INDEX idx_featured (is_featured),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户导入文件夹表
CREATE TABLE IF NOT EXISTS user_imported_folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  public_folder_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (public_folder_id) REFERENCES public_folders(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_public_folder (user_id, public_folder_id),
  INDEX idx_user_id (user_id),
  INDEX idx_public_folder_id (public_folder_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入默认分类数据
INSERT INTO categories (name, description, color, sort_order) VALUES
('AI写作', 'AI辅助内容创作和写作优化', '#8b5cf6', 1),
('编程开发', '代码生成、调试和技术文档', '#06b6d4', 2),
('商业营销', '市场推广、产品描述和商业策划', '#10b981', 3),
('学习教育', '知识问答、学习辅导和教学设计', '#f59e0b', 4),
('创意设计', '创意思维、设计灵感和艺术创作', '#ef4444', 5),
('数据分析', '数据处理、分析报告和可视化', '#6366f1', 6),
('生活助手', '日常生活、健康建议和实用工具', '#84cc16', 7),
('专业领域', '法律、医疗、金融等专业咨询', '#f97316', 8);

-- 创建默认管理员用户（密码: admin123）
INSERT INTO users (username, email, password_hash, user_type) VALUES
('admin', 'admin@notePrompt.com', '$2b$10$rQ3yQ3yQ3yQ3yQ3yQ3yQ3O', 'admin');

-- 获取管理员用户ID
SET @admin_id = LAST_INSERT_ID();

-- 创建用户统计记录
INSERT INTO user_usage_stats (user_id) VALUES (@admin_id); 