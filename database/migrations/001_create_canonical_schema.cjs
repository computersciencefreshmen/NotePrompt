'use strict'

module.exports = {
  description: 'Create the canonical application tables for an empty MySQL schema',

  async up(ctx) {
    await ctx.ensureTable('users', `CREATE TABLE users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      email VARCHAR(191) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      avatar_url VARCHAR(500) NULL,
      user_type ENUM('free', 'pro', 'admin') NOT NULL DEFAULT 'free',
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      permissions JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      verification_code CHAR(64) NULL,
      verification_expires TIMESTAMP NULL,
      verification_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      email_verify_sent_at TIMESTAMP NULL,
      session_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_users_username (username),
      UNIQUE INDEX uq_users_email (email),
      INDEX idx_users_verification_code (verification_code),
      INDEX idx_users_verification_expires (verification_expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_preferences', `CREATE TABLE user_preferences (
      user_id INT NOT NULL PRIMARY KEY,
      locale VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
      theme VARCHAR(20) NOT NULL DEFAULT 'system',
      default_editor_mode ENUM('normal', 'professional') NOT NULL DEFAULT 'normal',
      preferences JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('api_keys', `CREATE TABLE api_keys (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      api_key_hash CHAR(64) NOT NULL,
      key_prefix VARCHAR(16) NOT NULL,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL DEFAULT 'Default API key',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      last_used_at TIMESTAMP NULL,
      UNIQUE INDEX uq_api_keys_hash (api_key_hash),
      INDEX idx_api_keys_user (user_id),
      INDEX idx_api_keys_prefix (key_prefix),
      CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_provider_configs', `CREATE TABLE user_provider_configs (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(50) NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      base_url VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_user_provider_config (user_id, provider),
      INDEX idx_user_provider_active (user_id, provider, is_active),
      CONSTRAINT fk_user_provider_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('categories', `CREATE TABLE categories (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      description TEXT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
      icon VARCHAR(100) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_categories_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('folders', `CREATE TABLE folders (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      user_id INT NOT NULL,
      parent_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_folders_user (user_id),
      INDEX idx_folders_parent (parent_id),
      CONSTRAINT fk_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_prompts', `CREATE TABLE user_prompts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      description TEXT NULL,
      user_id INT NOT NULL,
      folder_id INT NULL,
      category_id INT NULL,
      mode VARCHAR(20) NOT NULL DEFAULT 'normal',
      editor_mode ENUM('normal', 'professional') NOT NULL DEFAULT 'normal',
      payload JSON NULL,
      schema_version INT UNSIGNED NOT NULL DEFAULT 1,
      is_public TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_prompts_user (user_id),
      INDEX idx_user_prompts_folder (folder_id),
      INDEX idx_user_prompts_category (category_id),
      INDEX idx_user_prompts_created (created_at),
      FULLTEXT INDEX idx_user_prompts_search (title, content, description),
      CONSTRAINT fk_user_prompts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_prompts_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
      CONSTRAINT fk_user_prompts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_prompt_folders', `CREATE TABLE user_prompt_folders (
      user_prompt_id INT NOT NULL,
      folder_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_prompt_id, folder_id),
      INDEX idx_user_prompt_folders_folder (folder_id),
      CONSTRAINT fk_user_prompt_folders_prompt FOREIGN KEY (user_prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_prompt_folders_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('prompt_versions', `CREATE TABLE prompt_versions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      prompt_id INT NOT NULL,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      version_number INT UNSIGNED NOT NULL,
      change_summary VARCHAR(500) NULL,
      editor_mode ENUM('normal', 'professional') NOT NULL DEFAULT 'normal',
      payload JSON NULL,
      schema_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_prompt_versions_number (prompt_id, version_number),
      INDEX idx_prompt_versions_user (user_id),
      CONSTRAINT fk_prompt_versions_prompt FOREIGN KEY (prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
      CONSTRAINT fk_prompt_versions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('public_prompts', `CREATE TABLE public_prompts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      description TEXT NULL,
      author_id INT NOT NULL,
      category_id INT NULL,
      views_count INT UNSIGNED NOT NULL DEFAULT 0,
      is_featured TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_public_prompts_author (author_id),
      INDEX idx_public_prompts_category (category_id),
      INDEX idx_public_prompts_featured (is_featured),
      INDEX idx_public_prompts_created (created_at),
      FULLTEXT INDEX idx_public_prompts_search (title, content, description),
      CONSTRAINT fk_public_prompts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_public_prompts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_favorites', `CREATE TABLE user_favorites (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      public_prompt_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_user_favorites_prompt (user_id, public_prompt_id),
      INDEX idx_user_favorites_public_prompt (public_prompt_id),
      CONSTRAINT fk_user_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_favorites_prompt FOREIGN KEY (public_prompt_id) REFERENCES public_prompts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('tags', `CREATE TABLE tags (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_tags_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_prompt_tags', `CREATE TABLE user_prompt_tags (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_prompt_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_user_prompt_tag (user_prompt_id, tag_id),
      INDEX idx_user_prompt_tags_tag (tag_id),
      CONSTRAINT fk_user_prompt_tags_prompt FOREIGN KEY (user_prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_prompt_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('public_prompt_tags', `CREATE TABLE public_prompt_tags (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      public_prompt_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_public_prompt_tag (public_prompt_id, tag_id),
      INDEX idx_public_prompt_tags_tag (tag_id),
      CONSTRAINT fk_public_prompt_tags_prompt FOREIGN KEY (public_prompt_id) REFERENCES public_prompts(id) ON DELETE CASCADE,
      CONSTRAINT fk_public_prompt_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('public_folders', `CREATE TABLE public_folders (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL,
      user_id INT NOT NULL,
      original_folder_id INT NOT NULL,
      is_featured TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_public_folders_user (user_id),
      INDEX idx_public_folders_original (original_folder_id),
      INDEX idx_public_folders_featured (is_featured),
      INDEX idx_public_folders_created (created_at),
      CONSTRAINT fk_public_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_public_folders_original FOREIGN KEY (original_folder_id) REFERENCES folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_imported_folders', `CREATE TABLE user_imported_folders (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      public_folder_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_user_imported_folder (user_id, public_folder_id),
      INDEX idx_user_imported_folders_public (public_folder_id),
      INDEX idx_user_imported_folders_created (created_at),
      CONSTRAINT fk_user_imported_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_imported_folders_public FOREIGN KEY (public_folder_id) REFERENCES public_folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('user_usage_stats', `CREATE TABLE user_usage_stats (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      ai_optimize_count INT UNSIGNED NOT NULL DEFAULT 0,
      ai_generate_count INT UNSIGNED NOT NULL DEFAULT 0,
      total_ai_usage INT UNSIGNED NOT NULL DEFAULT 0,
      monthly_usage INT UNSIGNED NOT NULL DEFAULT 0,
      last_reset_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_user_usage_stats_user (user_id),
      CONSTRAINT fk_user_usage_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('ai_usage_daily', `CREATE TABLE ai_usage_daily (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      usage_date DATE NOT NULL,
      optimize_count INT UNSIGNED NOT NULL DEFAULT 0,
      generate_count INT UNSIGNED NOT NULL DEFAULT 0,
      total_count INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_ai_usage_daily_user_date (user_id, usage_date),
      INDEX idx_ai_usage_daily_date (usage_date),
      CONSTRAINT fk_ai_usage_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  },
}
