import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import db from '@/lib/mysql-database'
import { toSafeUserDto } from '@/lib/auth-security'
import { getCuratedPublicPromptById } from '@/lib/curated-public-prompts'
import {
  assertExportBudget,
  assertExportResponseSize,
  ExportSizeError,
} from '@/lib/export-policy'

interface ExportBudgetRow {
  total_prompts?: number | string
  total_folders?: number | string
  published_favorites?: number | string
  curated_favorites?: number | string
  total_imported_folders?: number | string
  total_prompt_tags?: number | string
  source_bytes?: number | string
}

function readCount(value: number | string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

// GET - 导出用户数据
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const userId = auth.user.id
    const user = await db.getUserById(userId)
    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    }

    // Reject oversized online exports before loading large TEXT/JSON columns into memory.
    const budgetResult = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM user_prompts WHERE user_id = ?) AS total_prompts,
         (SELECT COUNT(*) FROM folders WHERE user_id = ?) AS total_folders,
         (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?) AS published_favorites,
         (SELECT COUNT(*) FROM curated_prompt_favorites WHERE user_id = ?) AS curated_favorites,
         (SELECT COUNT(*) FROM user_imported_folders WHERE user_id = ?) AS total_imported_folders,
         (SELECT COUNT(*)
            FROM user_prompt_tags prompt_tag
            JOIN user_prompts prompt ON prompt.id = prompt_tag.user_prompt_id
           WHERE prompt.user_id = ?) AS total_prompt_tags,
         COALESCE((
           SELECT SUM(
             OCTET_LENGTH(COALESCE(prompt.title, ''))
             + OCTET_LENGTH(COALESCE(prompt.content, ''))
             + OCTET_LENGTH(COALESCE(prompt.description, ''))
             + OCTET_LENGTH(COALESCE(CAST(prompt.payload AS CHAR), ''))
           )
           FROM user_prompts prompt
           WHERE prompt.user_id = ?
         ), 0) + COALESCE((
           SELECT SUM(
             OCTET_LENGTH(COALESCE(public_prompt.title, ''))
             + OCTET_LENGTH(COALESCE(public_prompt.content, ''))
             + OCTET_LENGTH(COALESCE(public_prompt.description, ''))
           )
           FROM user_favorites favorite
           JOIN public_prompts public_prompt ON public_prompt.id = favorite.public_prompt_id
           WHERE favorite.user_id = ?
         ), 0) AS source_bytes`,
      [userId, userId, userId, userId, userId, userId, userId, userId],
    )
    const budget = (budgetResult.rows as ExportBudgetRow[])[0] || {}
    const totalPrompts = readCount(budget.total_prompts)
    const totalFolders = readCount(budget.total_folders)
    const publishedFavoritesCount = readCount(budget.published_favorites)
    const curatedFavoritesCount = readCount(budget.curated_favorites)
    const totalFavorites = publishedFavoritesCount + curatedFavoritesCount
    const totalImportedFolders = readCount(budget.total_imported_folders)
    const totalPromptTags = readCount(budget.total_prompt_tags)
    const recordCount = totalPrompts
      + totalFolders
      + totalFavorites
      + totalImportedFolders
      + totalPromptTags
    const sourceBytes = Number(budget.source_bytes) || 0
    assertExportBudget(recordCount, sourceBytes)

    const [
      foldersResult,
      promptsResult,
      tagsResult,
      favoritesResult,
      curatedFavoritesResult,
      importedFoldersResult,
    ] = await Promise.all([
      db.query(
        `SELECT id, name, created_at, updated_at
           FROM folders
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [userId],
      ),
      db.query(
        `SELECT prompt.id, prompt.title, prompt.content, prompt.description,
                prompt.editor_mode, prompt.payload, prompt.schema_version,
                folder.name AS folder_name, prompt.created_at, prompt.updated_at
           FROM user_prompts prompt
           LEFT JOIN folders folder ON prompt.folder_id = folder.id
          WHERE prompt.user_id = ?
          ORDER BY prompt.updated_at DESC`,
        [userId],
      ),
      db.query(
        `SELECT prompt_tag.user_prompt_id, tag.name
           FROM user_prompt_tags prompt_tag
           JOIN user_prompts prompt ON prompt.id = prompt_tag.user_prompt_id
           JOIN tags tag ON tag.id = prompt_tag.tag_id
          WHERE prompt.user_id = ?
          ORDER BY prompt_tag.user_prompt_id ASC, tag.name ASC`,
        [userId],
      ),
      db.query(
        `SELECT public_prompt.id, public_prompt.title, public_prompt.content,
                public_prompt.description, public_prompt.category_id,
                public_prompt.views_count, favorite.created_at AS favorited_at
           FROM user_favorites favorite
           JOIN public_prompts public_prompt ON favorite.public_prompt_id = public_prompt.id
          WHERE favorite.user_id = ?
          ORDER BY favorite.created_at DESC`,
        [userId],
      ),
      db.query(
        `SELECT favorite.catalog_id, favorite.created_at AS favorited_at, catalog.views_count
           FROM curated_prompt_favorites favorite
           JOIN curated_catalog_entries catalog ON catalog.catalog_id = favorite.catalog_id
          WHERE favorite.user_id = ?
          ORDER BY favorite.created_at DESC`,
        [userId],
      ),
      db.query(
        `SELECT id, name, created_at
           FROM user_imported_folders
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [userId],
      ),
    ])

    const folders = (foldersResult.rows as Record<string, unknown>[]).map(folder => ({
      id: folder.id,
      name: folder.name,
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    }))

    const tagsByPrompt = new Map<number, Array<{ name: string }>>()
    for (const row of tagsResult.rows as Array<{ user_prompt_id: number | string; name: string }>) {
      const promptId = Number(row.user_prompt_id)
      if (!Number.isSafeInteger(promptId) || promptId <= 0) continue
      const tags = tagsByPrompt.get(promptId) || []
      tags.push({ name: row.name })
      tagsByPrompt.set(promptId, tags)
    }

    const prompts = (promptsResult.rows as Record<string, unknown>[]).map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description,
      editor_mode: prompt.editor_mode,
      payload: prompt.payload,
      schema_version: prompt.schema_version,
      folder_name: prompt.folder_name,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at,
      tags: tagsByPrompt.get(Number(prompt.id)) || [],
    }))

    const publishedFavorites = (favoritesResult.rows as Record<string, unknown>[]).map(favorite => ({
      id: favorite.id,
      source: 'published' as const,
      title: favorite.title,
      content: favorite.content,
      description: favorite.description,
      category_id: favorite.category_id,
      views_count: Number(favorite.views_count) || 0,
      favorited_at: favorite.favorited_at,
    }))
    const curatedFavorites = (curatedFavoritesResult.rows as Record<string, unknown>[]).flatMap(row => {
      const prompt = getCuratedPublicPromptById(Number(row.catalog_id))
      return prompt
        ? [{
            id: prompt.id,
            source: 'curated' as const,
            title: prompt.title,
            content: prompt.content,
            description: prompt.description,
            category: prompt.category,
            tags: prompt.tags,
            views_count: Number(row.views_count) || 0,
            favorited_at: row.favorited_at,
          }]
        : []
    })
    const favorites = [...publishedFavorites, ...curatedFavorites].sort((left, right) => (
      new Date(String(right.favorited_at)).getTime() - new Date(String(left.favorited_at)).getTime()
    ))

    const importedFolders = (importedFoldersResult.rows as Record<string, unknown>[]).map(folder => ({
      id: folder.id,
      name: folder.name,
      imported_at: folder.created_at,
    }))
    const exportData = {
      user: toSafeUserDto(user),
      folders,
      prompts,
      favorites,
      imported_folders: importedFolders,
      stats: {
        total_prompts: totalPrompts,
        total_folders: totalFolders,
        total_favorites: totalFavorites,
        total_imported_folders: totalImportedFolders,
      },
    }
    const responseBody = { success: true, data: exportData }
    assertExportResponseSize(responseBody)

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof ExportSizeError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        {
          status: error.status,
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        },
      )
    }
    console.error('User data export failed')
    return NextResponse.json(
      { success: false, error: '导出数据失败' },
      { status: 500 },
    )
  }
}
