import { chineseFeaturedPrompts } from '@/data/chinese-featured-prompts'
import { englishFeaturedPrompts } from '@/data/english-featured-prompts'
import { PublicPrompt } from '@/types'
import db from './mysql-database'

const curatedPrompts = [...englishFeaturedPrompts, ...chineseFeaturedPrompts]
const curatedPromptById = new Map(curatedPrompts.map(prompt => [prompt.id, prompt]))

export function getCuratedPublicPrompts(locale: string) {
  return locale === 'en' ? englishFeaturedPrompts : chineseFeaturedPrompts
}

export function getCuratedPublicPromptById(id: number) {
  return curatedPromptById.get(id) || null
}

export function isCuratedPublicPromptId(id: number) {
  return curatedPromptById.has(id)
}

export async function hydrateCuratedPublicPrompts(prompts: PublicPrompt[], userId?: number | null): Promise<PublicPrompt[]> {
  if (prompts.length === 0) return []

  const ids = prompts.map(prompt => prompt.id)
  const placeholders = ids.map(() => '?').join(',')

  const [favoriteResult, persistedResult, userFavoriteResult] = await Promise.all([
    db.query(
      `SELECT public_prompt_id, COUNT(*) as count FROM user_favorites WHERE public_prompt_id IN (${placeholders}) GROUP BY public_prompt_id`,
      ids
    ),
    db.query(
      `SELECT id, views_count FROM public_prompts WHERE id IN (${placeholders})`,
      ids
    ),
    userId
      ? db.query(
          `SELECT public_prompt_id FROM user_favorites WHERE user_id = ? AND public_prompt_id IN (${placeholders})`,
          [userId, ...ids]
        )
      : Promise.resolve({ rows: [] }),
  ])

  const favoriteCounts = new Map(
    (favoriteResult.rows as Array<{ public_prompt_id: number; count: number | string }>).map(row => [
      Number(row.public_prompt_id),
      Number(row.count) || 0,
    ])
  )
  const persistedViews = new Map(
    (persistedResult.rows as Array<{ id: number; views_count: number | string }>).map(row => [
      Number(row.id),
      Number(row.views_count) || 0,
    ])
  )
  const userFavorites = new Set(
    (userFavoriteResult.rows as Array<{ public_prompt_id: number }>).map(row => Number(row.public_prompt_id))
  )

  return prompts.map(prompt => ({
    ...prompt,
    views_count: persistedViews.get(prompt.id) ?? prompt.views_count,
    favorites_count: favoriteCounts.get(prompt.id) ?? 0,
    is_favorited: userFavorites.has(prompt.id),
  }))
}

export async function hydrateCuratedPublicPrompt(prompt: PublicPrompt, userId?: number | null) {
  const [hydratedPrompt] = await hydrateCuratedPublicPrompts([prompt], userId)
  return hydratedPrompt
}

async function getCuratedAuthorId() {
  const adminResult = await db.query(
    `SELECT id FROM users WHERE is_admin = 1 OR user_type = 'admin' ORDER BY is_admin DESC, id ASC LIMIT 1`
  )
  const admin = (adminResult.rows as Array<{ id: number }>)[0]
  if (admin?.id) return Number(admin.id)

  const userResult = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1')
  const user = (userResult.rows as Array<{ id: number }>)[0]
  if (user?.id) return Number(user.id)

  throw new Error('No user is available to own curated public prompts')
}

export async function ensureCuratedPublicPromptPersisted(prompt: PublicPrompt) {
  const authorId = await getCuratedAuthorId()

  await db.query(
    `INSERT INTO public_prompts (id, title, content, description, author_id, views_count, is_featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       content = VALUES(content),
       description = VALUES(description),
       views_count = GREATEST(public_prompts.views_count, VALUES(views_count)),
       is_featured = VALUES(is_featured),
       updated_at = VALUES(updated_at)`,
    [
      prompt.id,
      prompt.title,
      prompt.content,
      prompt.description || null,
      authorId,
      prompt.views_count || 0,
      prompt.is_featured ? 1 : 0,
      prompt.created_at,
      prompt.updated_at,
    ]
  )

  if (prompt.tags.length > 0) {
    await db.addPublicPromptTags(prompt.id, prompt.tags)
  }

  return db.getPublicPromptById(prompt.id)
}
