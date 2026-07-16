'use strict'

module.exports = {
  description: 'Normalize account tiers to free, pro, and admin while converting legacy premium rows',

  async up(ctx) {
    await ctx.modifyColumn(
      'users',
      'user_type',
      "ENUM('free', 'premium', 'pro', 'admin') NOT NULL DEFAULT 'free'"
    )
    await ctx.exec("UPDATE users SET user_type = 'pro' WHERE user_type = 'premium'")
    await ctx.modifyColumn(
      'users',
      'user_type',
      "ENUM('free', 'pro', 'admin') NOT NULL DEFAULT 'free'"
    )
  },
}
