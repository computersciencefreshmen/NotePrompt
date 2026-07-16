'use strict'

module.exports = {
  description: 'Separate administrative suspension from pending email verification',

  async up(ctx) {
    await ctx.ensureColumn('users', 'admin_disabled_at', 'TIMESTAMP NULL')
    await ctx.ensureIndex('users', 'idx_users_admin_disabled_at', ['admin_disabled_at'])

    // Legacy is_active=0 rows are ambiguous: they may be pending verification or
    // explicitly suspended. Preserve security by migrating them as suspended.
    // An administrator can review and re-enable a genuine pending account; the
    // normal verification flow will then remain required when enabled.
    await ctx.exec(
      `UPDATE users
          SET admin_disabled_at = COALESCE(admin_disabled_at, CURRENT_TIMESTAMP)
        WHERE is_active = 0`
    )
  },
}
