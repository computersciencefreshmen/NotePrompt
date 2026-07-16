'use strict'

module.exports = {
  description: 'Reconcile identity, preferences, hashed API keys, and provider configuration storage',

  async up(ctx) {
    await ctx.ensureColumn('users', 'avatar_url', 'VARCHAR(500) NULL')
    await ctx.ensureColumn('users', 'user_type', "ENUM('free', 'premium', 'pro', 'admin') NOT NULL DEFAULT 'free'")
    await ctx.ensureColumn('users', 'is_admin', 'TINYINT(1) NOT NULL DEFAULT 0')
    await ctx.ensureColumn('users', 'permissions', 'JSON NULL')
    await ctx.ensureColumn('users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1')
    await ctx.ensureColumn('users', 'email_verified', 'TINYINT(1) NOT NULL DEFAULT 0')
    await ctx.ensureColumn('users', 'verification_code', 'CHAR(64) NULL')
    await ctx.modifyColumn('users', 'verification_code', 'CHAR(64) NULL')
    await ctx.ensureColumn('users', 'verification_expires', 'TIMESTAMP NULL')
    await ctx.ensureColumn('users', 'verification_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('users', 'email_verify_sent_at', 'TIMESTAMP NULL')
    await ctx.ensureColumn('users', 'session_version', 'INT UNSIGNED NOT NULL DEFAULT 1')
    await ctx.ensureColumn('users', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('users', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    await ctx.ensureIndex('users', 'idx_users_verification_code', ['verification_code'])
    await ctx.ensureIndex('users', 'idx_users_verification_expires', ['verification_expires'])

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
    await ctx.ensureColumn('user_preferences', 'locale', "VARCHAR(16) NOT NULL DEFAULT 'zh-CN'")
    await ctx.ensureColumn('user_preferences', 'theme', "VARCHAR(20) NOT NULL DEFAULT 'system'")
    await ctx.ensureColumn('user_preferences', 'default_editor_mode', "ENUM('normal', 'professional') NOT NULL DEFAULT 'normal'")
    await ctx.ensureColumn('user_preferences', 'preferences', 'JSON NULL')
    await ctx.ensureColumn('user_preferences', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('user_preferences', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

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

    await ctx.ensureColumn('api_keys', 'api_key_hash', 'CHAR(64) NULL')
    await ctx.ensureColumn('api_keys', 'key_prefix', 'VARCHAR(16) NULL')
    await ctx.ensureColumn('api_keys', 'name', "VARCHAR(100) NOT NULL DEFAULT 'Default API key'")
    await ctx.ensureColumn('api_keys', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1')
    await ctx.ensureColumn('api_keys', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('api_keys', 'expires_at', 'TIMESTAMP NULL')
    await ctx.ensureColumn('api_keys', 'last_used_at', 'TIMESTAMP NULL')

    if (await ctx.columnExists('api_keys', 'api_key')) {
      await ctx.modifyColumn('api_keys', 'api_key', 'VARCHAR(255) NULL')
      await ctx.exec(
        `UPDATE api_keys
            SET api_key_hash = COALESCE(api_key_hash, SHA2(api_key, 256)),
                key_prefix = COALESCE(key_prefix, LEFT(api_key, 16))
          WHERE api_key IS NOT NULL AND api_key <> ''`
      )
    }

    await ctx.exec(
      `UPDATE api_keys
          SET key_prefix = CONCAT('legacy_', LEFT(api_key_hash, 8))
        WHERE api_key_hash IS NOT NULL AND (key_prefix IS NULL OR key_prefix = '')`
    )
    const [invalidApiKeys] = await ctx.query(
      `SELECT COUNT(*) AS count
         FROM api_keys
        WHERE api_key_hash IS NULL OR api_key_hash = '' OR key_prefix IS NULL OR key_prefix = ''`
    )
    if (Number(invalidApiKeys[0]?.count) > 0) {
      throw new Error('api_keys contains rows that cannot be converted to hashed credentials')
    }

    await ctx.modifyColumn('api_keys', 'api_key_hash', 'CHAR(64) NOT NULL')
    await ctx.modifyColumn('api_keys', 'key_prefix', 'VARCHAR(16) NOT NULL')
    await ctx.ensureIndex('api_keys', 'uq_api_keys_hash', ['api_key_hash'], { unique: true })
    await ctx.ensureIndex('api_keys', 'idx_api_keys_user', ['user_id'])
    await ctx.ensureIndex('api_keys', 'idx_api_keys_prefix', ['key_prefix'])
    await ctx.dropColumn('api_keys', 'api_key')

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
    await ctx.ensureColumn('user_provider_configs', 'provider', 'VARCHAR(50) NOT NULL')
    await ctx.ensureColumn('user_provider_configs', 'encrypted_api_key', 'TEXT NOT NULL')
    await ctx.ensureColumn('user_provider_configs', 'base_url', 'VARCHAR(500) NULL')
    await ctx.ensureColumn('user_provider_configs', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1')
    await ctx.ensureColumn('user_provider_configs', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('user_provider_configs', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    await ctx.ensureIndex('user_provider_configs', 'uq_user_provider_config', ['user_id', 'provider'], { unique: true })
    await ctx.ensureIndex('user_provider_configs', 'idx_user_provider_active', ['user_id', 'provider', 'is_active'])
  },
}
