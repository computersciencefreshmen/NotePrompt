'use strict'

const CATEGORIES = [
  ['AI写作', 'AI辅助内容创作和写作优化', '#8b5cf6', 1],
  ['编程开发', '代码生成、调试和技术文档', '#06b6d4', 2],
  ['商业营销', '市场推广、产品描述和商业策划', '#10b981', 3],
  ['学习教育', '知识问答、学习辅导和教学设计', '#f59e0b', 4],
  ['创意设计', '创意思维、设计灵感和艺术创作', '#ef4444', 5],
  ['数据分析', '数据处理、分析报告和可视化', '#6366f1', 6],
  ['生活助手', '日常生活、健康建议和实用工具', '#84cc16', 7],
  ['专业领域', '法律、医疗、金融等专业咨询', '#f97316', 8],
]

module.exports = {
  description: 'Seed stable reference categories without creating privileged accounts',

  async up(ctx) {
    for (const [name, description, color, sortOrder] of CATEGORIES) {
      const [rows] = await ctx.query('SELECT id FROM categories WHERE name = ? ORDER BY id LIMIT 1', [name])
      if (rows.length > 0) {
        await ctx.exec(
          `UPDATE categories
              SET description = ?, color = ?, sort_order = ?, is_active = 1
            WHERE id = ?`,
          [description, color, sortOrder, rows[0].id]
        )
      } else {
        await ctx.exec(
          `INSERT INTO categories (name, description, color, sort_order, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          [name, description, color, sortOrder]
        )
      }
    }
  },
}
