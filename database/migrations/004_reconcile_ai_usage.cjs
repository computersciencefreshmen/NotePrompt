'use strict'

module.exports = {
  description: 'Create AI usage ledgers and move legacy aggregate usage into the daily ledger',

  async up(ctx) {
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
    await ctx.ensureColumn('user_usage_stats', 'ai_optimize_count', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('user_usage_stats', 'ai_generate_count', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('user_usage_stats', 'total_ai_usage', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('user_usage_stats', 'monthly_usage', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('user_usage_stats', 'last_reset_date', 'DATE NOT NULL DEFAULT (CURRENT_DATE)')
    await ctx.ensureColumn('user_usage_stats', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('user_usage_stats', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    await ctx.ensureIndex('user_usage_stats', 'uq_user_usage_stats_user', ['user_id'], { unique: true })

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
    await ctx.ensureColumn('ai_usage_daily', 'usage_date', 'DATE NOT NULL')
    await ctx.ensureColumn('ai_usage_daily', 'optimize_count', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('ai_usage_daily', 'generate_count', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('ai_usage_daily', 'total_count', 'INT UNSIGNED NOT NULL DEFAULT 0')
    await ctx.ensureColumn('ai_usage_daily', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ctx.ensureColumn('ai_usage_daily', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    await ctx.ensureIndex('ai_usage_daily', 'uq_ai_usage_daily_user_date', ['user_id', 'usage_date'], { unique: true })
    await ctx.ensureIndex('ai_usage_daily', 'idx_ai_usage_daily_date', ['usage_date'])

    await ctx.exec(
      `UPDATE user_usage_stats
          SET total_ai_usage = GREATEST(
            COALESCE(total_ai_usage, 0),
            COALESCE(ai_optimize_count, 0) + COALESCE(ai_generate_count, 0)
          )`
    )

    await ctx.exec(
      `INSERT INTO ai_usage_daily (user_id, usage_date, optimize_count, generate_count, total_count)
       SELECT stats.user_id,
              CURRENT_DATE,
              COALESCE(stats.monthly_usage, 0),
              0,
              COALESCE(stats.monthly_usage, 0)
         FROM user_usage_stats stats
        WHERE COALESCE(stats.monthly_usage, 0) > 0
          AND COALESCE(stats.last_reset_date, DATE(stats.created_at), CURRENT_DATE) >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
          AND NOT EXISTS (
            SELECT 1
              FROM ai_usage_daily daily
             WHERE daily.user_id = stats.user_id
               AND daily.usage_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
               AND daily.usage_date < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
          )
       ON DUPLICATE KEY UPDATE
         optimize_count = GREATEST(optimize_count, VALUES(optimize_count)),
         total_count = GREATEST(total_count, VALUES(total_count))`
    )

    await ctx.exec(
      `UPDATE user_usage_stats stats
         LEFT JOIN (
           SELECT user_id, SUM(total_count) AS current_month_total
             FROM ai_usage_daily
            WHERE usage_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
              AND usage_date < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
            GROUP BY user_id
         ) daily ON daily.user_id = stats.user_id
          SET stats.monthly_usage = GREATEST(
            COALESCE(stats.monthly_usage, 0),
            COALESCE(daily.current_month_total, 0)
          )`
    )
  },
}
