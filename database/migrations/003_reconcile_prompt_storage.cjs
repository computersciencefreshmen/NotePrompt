'use strict'

module.exports = {
  description: 'Add prompt folder links, structured editor payloads, and durable prompt versions',

  async up(ctx) {
    await ctx.ensureColumn('categories', 'icon', 'VARCHAR(100) NULL')

    await ctx.ensureColumn('user_prompts', 'mode', "VARCHAR(20) NOT NULL DEFAULT 'normal'")
    await ctx.ensureColumn('user_prompts', 'editor_mode', "ENUM('normal', 'professional') NOT NULL DEFAULT 'normal'")
    await ctx.ensureColumn('user_prompts', 'payload', 'JSON NULL')
    await ctx.ensureColumn('user_prompts', 'schema_version', 'INT UNSIGNED NOT NULL DEFAULT 1')
    await ctx.ensureColumn('user_prompts', 'is_public', 'TINYINT(1) NOT NULL DEFAULT 0')

    await ctx.exec(
      `UPDATE user_prompts
          SET editor_mode = CASE
            WHEN LOWER(COALESCE(mode, '')) IN ('pro', 'professional') THEN 'professional'
            ELSE 'normal'
          END`
    )

    await ctx.ensureTable('user_prompt_folders', `CREATE TABLE user_prompt_folders (
      user_prompt_id INT NOT NULL,
      folder_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_prompt_id, folder_id),
      INDEX idx_user_prompt_folders_folder (folder_id),
      CONSTRAINT fk_user_prompt_folders_prompt FOREIGN KEY (user_prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_prompt_folders_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
    await ctx.ensureColumn('user_prompt_folders', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureIndex('user_prompt_folders', 'uq_user_prompt_folders', ['user_prompt_id', 'folder_id'], { unique: true })
    await ctx.ensureIndex('user_prompt_folders', 'idx_user_prompt_folders_folder', ['folder_id'])

    await ctx.exec(
      `INSERT IGNORE INTO user_prompt_folders (user_prompt_id, folder_id)
       SELECT prompt.id, prompt.folder_id
         FROM user_prompts prompt
         JOIN folders folder
           ON folder.id = prompt.folder_id AND folder.user_id = prompt.user_id
        WHERE prompt.folder_id IS NOT NULL`
    )

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
    await ctx.ensureColumn('prompt_versions', 'change_summary', 'VARCHAR(500) NULL')
    await ctx.ensureColumn('prompt_versions', 'editor_mode', "ENUM('normal', 'professional') NOT NULL DEFAULT 'normal'")
    await ctx.ensureColumn('prompt_versions', 'payload', 'JSON NULL')
    await ctx.ensureColumn('prompt_versions', 'schema_version', 'INT UNSIGNED NOT NULL DEFAULT 1')
    await ctx.ensureColumn('prompt_versions', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureIndex('prompt_versions', 'uq_prompt_versions_number', ['prompt_id', 'version_number'], { unique: true })
    await ctx.ensureIndex('prompt_versions', 'idx_prompt_versions_user', ['user_id'])

    await ctx.exec(
      `UPDATE prompt_versions pv
         JOIN user_prompts up ON up.id = pv.prompt_id
          SET pv.editor_mode = up.editor_mode,
              pv.schema_version = GREATEST(pv.schema_version, up.schema_version)`
    )
  },
}
