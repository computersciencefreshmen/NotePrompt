import { createHash } from 'node:crypto'
import { chineseFeaturedPrompts } from '@/data/chinese-featured-prompts'
import { englishFeaturedPrompts } from '@/data/english-featured-prompts'
import { PublicPrompt } from '@/types'
import db from './mysql-database'

export type PublicPromptSource = 'curated' | 'published'

type MutationResult = { affectedRows?: number }

const curatedPrompts = [...englishFeaturedPrompts, ...chineseFeaturedPrompts]
const curatedPromptById = new Map(curatedPrompts.map(prompt => [prompt.id, prompt]))

function catalogFingerprint(prompt: PublicPrompt) {
  return createHash('sha256')
    .update([prompt.title, prompt.content, prompt.description || ''].join(String.fromCharCode(31)), 'utf8')
    .digest('hex')
}

function normalizeLegacyTimestamp(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value)
  if (!match) throw new Error(`Invalid curated catalog timestamp: ${value}`)
  return `${match[1]} ${match[2]}.000`
}

async function ensureCuratedCatalogEntries(prompts: PublicPrompt[]) {
  if (prompts.length === 0) return

  const uniquePrompts = [...new Map(prompts.map(prompt => [prompt.id, prompt])).values()]
  const valueSql = uniquePrompts.map(() => '(?, ?, ?, ?)').join(', ')
  const parameters = uniquePrompts.flatMap(prompt => [
    prompt.id,
    catalogFingerprint(prompt),
    normalizeLegacyTimestamp(prompt.created_at),
    Math.max(0, Number(prompt.views_count) || 0),
  ])
  await db.query(
    `INSERT INTO curated_catalog_entries
       (catalog_id, content_sha256, legacy_published_at, views_count)
     VALUES ${valueSql}
     ON DUPLICATE KEY UPDATE
       content_sha256 = VALUES(content_sha256),
       legacy_published_at = VALUES(legacy_published_at),
       views_count = GREATEST(curated_catalog_entries.views_count, VALUES(views_count))`,
    parameters,
  )
}

export function getCuratedPublicPrompts(locale: string) {
  return locale === 'en' ? englishFeaturedPrompts : chineseFeaturedPrompts
}

export function getAllCuratedPublicPrompts() {
  return curatedPrompts
}

export function getCuratedPublicPromptById(id: number) {
  return curatedPromptById.get(id) || null
}

export function isCuratedPublicPromptId(id: number) {
  return curatedPromptById.has(id)
}

export function resolvePublicPromptSource(
  id: number,
  requestedSource: string | null | undefined,
): PublicPromptSource | null {
  if (requestedSource == null || requestedSource === '') {
    return isCuratedPublicPromptId(id) ? 'curated' : 'published'
  }
  return requestedSource === 'curated' || requestedSource === 'published'
    ? requestedSource
    : null
}

export async function hydrateCuratedPublicPrompts(
  prompts: PublicPrompt[],
  userId?: number | null,
): Promise<PublicPrompt[]> {
  if (prompts.length === 0) return []
  await ensureCuratedCatalogEntries(prompts)

  const ids = prompts.map(prompt => prompt.id)
  const placeholders = ids.map(() => '?').join(',')
  const [favoriteResult, statsResult, userFavoriteResult] = await Promise.all([
    db.query(
      `SELECT catalog_id, COUNT(*) AS count
         FROM curated_prompt_favorites
        WHERE catalog_id IN (${placeholders})
        GROUP BY catalog_id`,
      ids,
    ),
    db.query(
      `SELECT catalog_id, views_count
         FROM curated_catalog_entries
        WHERE catalog_id IN (${placeholders})`,
      ids,
    ),
    userId
      ? db.query(
          `SELECT catalog_id
             FROM curated_prompt_favorites
            WHERE user_id = ? AND catalog_id IN (${placeholders})`,
          [userId, ...ids],
        )
      : Promise.resolve({ rows: [] }),
  ])

  const favoriteCounts = new Map(
    (favoriteResult.rows as Array<{ catalog_id: number; count: number | string }>).map(row => [
      Number(row.catalog_id),
      Number(row.count) || 0,
    ]),
  )
  const persistedViews = new Map(
    (statsResult.rows as Array<{ catalog_id: number; views_count: number | string }>).map(row => [
      Number(row.catalog_id),
      Number(row.views_count) || 0,
    ]),
  )
  const userFavorites = new Set(
    (userFavoriteResult.rows as Array<{ catalog_id: number }>).map(row => Number(row.catalog_id)),
  )

  return prompts.map(prompt => ({
    ...prompt,
    source: 'curated' as const,
    views_count: persistedViews.get(prompt.id) ?? prompt.views_count,
    favorites_count: favoriteCounts.get(prompt.id) ?? 0,
    is_favorited: userFavorites.has(prompt.id),
  }))
}

export async function hydrateCuratedPublicPrompt(prompt: PublicPrompt, userId?: number | null) {
  const [hydratedPrompt] = await hydrateCuratedPublicPrompts([prompt], userId)
  return hydratedPrompt
}

export async function incrementCuratedPromptViews(prompt: PublicPrompt) {
  await ensureCuratedCatalogEntries([prompt])
  const result = await db.query(
    'UPDATE curated_catalog_entries SET views_count = views_count + 1 WHERE catalog_id = ?',
    [prompt.id],
  )
  return Number((result.rows as MutationResult).affectedRows) === 1
}

export async function addCuratedPromptFavorite(userId: number, prompt: PublicPrompt) {
  await ensureCuratedCatalogEntries([prompt])
  const result = await db.query(
    'INSERT IGNORE INTO curated_prompt_favorites (user_id, catalog_id) VALUES (?, ?)',
    [userId, prompt.id],
  )
  return Number((result.rows as MutationResult).affectedRows) === 1
}

export async function removeCuratedPromptFavorite(userId: number, catalogId: number) {
  const result = await db.query(
    'DELETE FROM curated_prompt_favorites WHERE user_id = ? AND catalog_id = ?',
    [userId, catalogId],
  )
  return Number((result.rows as MutationResult).affectedRows) === 1
}

export async function isCuratedPromptFavoritedByUser(userId: number, catalogId: number) {
  const result = await db.query(
    `SELECT 1
       FROM curated_prompt_favorites
      WHERE user_id = ? AND catalog_id = ?
      LIMIT 1`,
    [userId, catalogId],
  )
  return (result.rows as unknown[]).length === 1
}
