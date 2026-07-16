
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  PromptEditorStateValidationError,
  composePromptEditorContent,
  normalizePromptEditorState,
  promptEditorTitle,
  withResolvedPromptEditorState,
} from '@/lib/prompt-editor-state'
import { entitlementLimitResponse } from '@/lib/entitlement-http'
import { normalizePromptTagNames, TagValidationError } from '@/lib/tag-policy'

type DbRow = Record<string, unknown>

export async function GET(request: NextRequest) {
  try {
    // 获取认证用户
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    // 先检查用户是否存在
    const userCheck = await db.query('SELECT id, username FROM users WHERE id = ?', [userId])
    if (!Array.isArray(userCheck.rows) || userCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    }
    
    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const folderId = searchParams.get('folder_id')
    const tagName = searchParams.get('tag_name')?.trim() || ''
    const page = Number(searchParams.get('page') || '1')
    const limit = Number(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit

    if (
      !Number.isInteger(page) || page < 1 || page > 1000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      search.length > 200 || tagName.length > 64
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination parameters' },
        { status: 400 }
      )
    }

    let parsedFolderFilterId: number | null = null
    if (folderId && folderId !== 'null' && folderId !== 'undefined') {
      parsedFolderFilterId = parsePositiveResourceId(folderId)
      if (parsedFolderFilterId == null) {
        return NextResponse.json(
          { success: false, error: 'Invalid folder ID' },
          { status: 400 }
        )
      }

      const folder = await db.getOwnedFolderById(parsedFolderFilterId, userId)
      if (!folder) {
        return NextResponse.json(
          { success: false, error: 'Folder not found' },
          { status: 404 }
        )
      }
    }
    
    const conditions = ['up.user_id = ?']
    const filterParams: (string | number)[] = [userId]

    if (search) {
      conditions.push('(up.title LIKE ? OR up.content LIKE ? OR up.description LIKE ?)')
      const searchPattern = `%${search}%`
      filterParams.push(searchPattern, searchPattern, searchPattern)
    }

    if (parsedFolderFilterId != null) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM user_prompt_folders upf_filter
        WHERE upf_filter.user_prompt_id = up.id AND upf_filter.folder_id = ?
      )`)
      filterParams.push(parsedFolderFilterId)
    }

    if (tagName) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM user_prompt_tags upt_filter
        JOIN tags t_filter ON t_filter.id = upt_filter.tag_id
        WHERE upt_filter.user_prompt_id = up.id AND t_filter.name = ?
      )`)
      filterParams.push(tagName)
    }

    const whereClause = conditions.join('\n AND ')
    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM user_prompts up WHERE ${whereClause}`,
      filterParams,
    )
    const totalCount = Number((countResult.rows as DbRow[])[0]?.total || 0)
    const result = await db.query(
      `SELECT up.id, up.title, up.content, up.description, up.category_id,
              up.created_at, up.updated_at, u.username, u.avatar_url
       FROM user_prompts up
       LEFT JOIN users u ON up.user_id = u.id
       WHERE ${whereClause}
       ORDER BY up.created_at DESC, up.id DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, limit, offset],
    )
    const prompts = Array.isArray(result.rows) ? result.rows as DbRow[] : []
    const promptIds = prompts.map(prompt => Number(prompt.id))
    const folderMap = new Map<number, Array<{ id: number; name: string }>>()
    const tagMap = new Map<number, Array<{ id: number; name: string }>>()

    if (promptIds.length > 0) {
      const placeholders = promptIds.map(() => '?').join(', ')
      const [folderResult, tagResult] = await Promise.all([
        db.query(
          `SELECT upf.user_prompt_id, f.id, f.name
           FROM user_prompt_folders upf
           JOIN folders f ON f.id = upf.folder_id
           WHERE upf.user_prompt_id IN (${placeholders}) AND f.user_id = ?
           ORDER BY f.name, f.id`,
          [...promptIds, userId],
        ),
        db.query(
          `SELECT upt.user_prompt_id, t.id, t.name
           FROM user_prompt_tags upt
           JOIN tags t ON t.id = upt.tag_id
           WHERE upt.user_prompt_id IN (${placeholders})
           ORDER BY t.name, t.id`,
          promptIds,
        ),
      ])

      for (const row of folderResult.rows as DbRow[]) {
        const promptId = Number(row.user_prompt_id)
        const folders = folderMap.get(promptId) || []
        folders.push({ id: Number(row.id), name: String(row.name) })
        folderMap.set(promptId, folders)
      }
      for (const row of tagResult.rows as DbRow[]) {
        const promptId = Number(row.user_prompt_id)
        const tags = tagMap.get(promptId) || []
        tags.push({ id: Number(row.id), name: String(row.name) })
        tagMap.set(promptId, tags)
      }
    }

    const processedPrompts = prompts.map(prompt => {
      const promptId = Number(prompt.id)
      const folders = folderMap.get(promptId) || []
      return {
        id: prompt.id as number,
        title: prompt.title as string,
        content: prompt.content as string,
        description: prompt.description as string,
        folder_id: folders[0]?.id ?? null,
        folder_ids: folders.map(folder => folder.id),
        folder_names: folders.map(folder => folder.name),
        category_id: prompt.category_id as number,
        created_at: prompt.created_at as string,
        updated_at: prompt.updated_at as string,
        username: prompt.username as string,
        avatar_url: prompt.avatar_url as string,
        tags: tagMap.get(promptId) || [],
        category: null
      }
    })
    
    const totalPages = Math.ceil(totalCount / limit)
    
    return NextResponse.json({
      success: true,
      data: {
        items: processedPrompts,
        totalPages,
        total: totalCount,
        page,
        limit
      }
    })
  } catch (error) {
    console.error('Get prompts error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prompts' },
      { status: 500 }
    )
  }
}

// POST - 创建新的用户提示词
export async function POST(request: NextRequest) {
  try {
    // 获取认证用户
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id

    const body = await readLimitedJson<Record<string, unknown>>(request, 96 * 1024)
    const allowedFields = new Set([
      'title', 'content', 'description', 'folder_id', 'category_id', 'tags',
      'mode', 'editor_mode', 'payload', 'schema_version', 'is_public',
    ])
    if (Object.keys(body).some(key => !allowedFields.has(key))) {
      return NextResponse.json(
        { success: false, error: '请求包含不支持的字段' },
        { status: 400 },
      )
    }
    const editorState = normalizePromptEditorState({
      editor_mode: body.editor_mode ?? body.mode,
      payload: body.payload,
      schema_version: body.schema_version,
    }, {
      title: body.title,
      content: body.content,
      mode: body.mode,
    })
    const title = promptEditorTitle(editorState)
    const content = composePromptEditorContent(editorState)
    const description = body.description
    const folder_id = body.folder_id
    const category_id = body.category_id
    const tags = body.tags === undefined ? [] : normalizePromptTagNames(body.tags)
    const is_public = body.is_public === true

    let newPrompt

    try {
      // folder_id 和 category_id 可能是 number 或 string，安全转换
      let parsedFolderId: number | null = null
      if (folder_id != null && folder_id !== '') {
        parsedFolderId = parsePositiveResourceId(folder_id)
        if (parsedFolderId == null) {
          return NextResponse.json(
            { success: false, error: 'Invalid folder ID' },
            { status: 400 }
          )
        }

        const folder = await db.getOwnedFolderById(parsedFolderId, userId)
        if (!folder) {
          return NextResponse.json(
            { success: false, error: 'Folder not found' },
            { status: 404 }
          )
        }
      }
      let parsedCategoryId: number | null = null
      if (category_id != null && category_id !== '') {
        parsedCategoryId = parsePositiveResourceId(category_id)
        if (parsedCategoryId == null) {
          return NextResponse.json(
            { success: false, error: 'Invalid category ID' },
            { status: 400 }
          )
        }
      }

      newPrompt = await db.createUserPrompt({
        title,
        content,
        description: typeof description === 'string' ? description : null,
        user_id: userId,
        folder_id: parsedFolderId,
        category_id: parsedCategoryId,
        mode: editorState.editor_mode,
        editor_mode: editorState.editor_mode,
        payload: editorState.payload,
        schema_version: editorState.schema_version,
        is_public,
        tags,
      })

      return NextResponse.json({
        success: true,
        data: withResolvedPromptEditorState(newPrompt as DbRow),
        message: 'Prompt created successfully'
      })
    } catch (dbError) {
      const limitResponse = entitlementLimitResponse(dbError)
      if (limitResponse) return limitResponse
      console.error('Database create failed:', dbError)
      return NextResponse.json(
        { success: false, error: 'Failed to create prompt in database' },
        { status: 500 }
      )
    }

  } catch (error) {
    if (error instanceof RequestPolicyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    if (error instanceof PromptEditorStateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    if (error instanceof TagValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    console.error('Create prompt error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'Failed to create prompt' },
      { status: 500 }
    )
  }
}
