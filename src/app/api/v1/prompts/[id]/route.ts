import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/mysql-database'
import { requireAuth } from '@/lib/auth'
import { parsePositiveResourceId } from '@/lib/resource-authorization'
import { readLimitedJson, RequestPolicyError } from '@/lib/ai-runtime-policy'
import {
  PromptEditorStateValidationError,
  composePromptEditorContent,
  normalizePromptEditorMode,
  normalizePromptEditorState,
  promptEditorTitle,
  resolveStoredPromptEditorState,
  serializePromptEditorPayload,
  withResolvedPromptEditorState,
} from '@/lib/prompt-editor-state'
import { normalizePromptTagNames, TagValidationError } from '@/lib/tag-policy'

function resolveRequestedEditorState(body: Record<string, unknown>, existingPrompt: Record<string, unknown>) {
  const currentState = resolveStoredPromptEditorState(existingPrompt)
  const hasStructuredPayload = Object.hasOwn(body, 'payload')
  const hasStructuredMetadata = Object.hasOwn(body, 'editor_mode') || Object.hasOwn(body, 'schema_version')

  if (hasStructuredMetadata && !hasStructuredPayload) {
    throw new PromptEditorStateValidationError('更新 editor_mode/schema_version 时必须同时提供 payload')
  }
  if (hasStructuredPayload) {
    return normalizePromptEditorState({
      editor_mode: body.editor_mode ?? currentState.editor_mode,
      payload: body.payload,
      schema_version: body.schema_version,
    }, {
      title: body.title ?? existingPrompt.title,
      content: body.content ?? existingPrompt.content,
      mode: currentState.editor_mode,
    })
  }

  const hasLegacyEditorUpdate = Object.hasOwn(body, 'title')
    || Object.hasOwn(body, 'content')
    || Object.hasOwn(body, 'mode')
  if (!hasLegacyEditorUpdate) return currentState

  if (body.title !== undefined && typeof body.title !== 'string') {
    throw new PromptEditorStateValidationError('title 必须是字符串')
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    throw new PromptEditorStateValidationError('content 必须是字符串')
  }

  const requestedMode = body.mode === undefined
    ? currentState.editor_mode
    : normalizePromptEditorMode(body.mode, currentState.editor_mode)
  if (requestedMode !== currentState.editor_mode) {
    return normalizePromptEditorState({ editor_mode: requestedMode, payload: null }, {
      title: body.title ?? existingPrompt.title,
      content: body.content ?? existingPrompt.content,
      mode: requestedMode,
    })
  }

  const title = body.title === undefined ? currentState.payload.title : body.title
  if (currentState.editor_mode === 'normal') {
    return normalizePromptEditorState({
      editor_mode: currentState.editor_mode,
      schema_version: currentState.schema_version,
      payload: {
        ...currentState.payload,
        title,
        objective: body.content === undefined ? currentState.payload.objective : body.content,
      },
    }, { title, content: body.content ?? existingPrompt.content, mode: currentState.editor_mode })
  }
  return normalizePromptEditorState({
    editor_mode: currentState.editor_mode,
    schema_version: currentState.schema_version,
    payload: {
      ...currentState.payload,
      title,
      content: body.content === undefined ? currentState.payload.content : body.content,
      task: body.content === undefined ? currentState.payload.task : body.content,
    },
  }, { title, content: body.content ?? existingPrompt.content, mode: currentState.editor_mode })
}

// GET - 获取单个用户提示词
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id

    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    const prompt = await db.getOwnedUserPromptById(id, userId)

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 获取标签
    const tagsResult = await db.getUserPromptTags(id)
    const tags = tagsResult.map(tag => ({ id: tag.id as number, name: tag.name as string }))

    return NextResponse.json({
      success: true,
      data: {
        ...withResolvedPromptEditorState(prompt),
        tags: tags
      }
    })
  } catch (error) {
    console.error('Get prompt error:', error)
    return NextResponse.json(
      { success: false, error: '获取提示词失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新用户提示词
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }
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
    const normalizedTags = body.tags === undefined
      ? undefined
      : normalizePromptTagNames(body.tags)

    // 对不存在和越权资源统一返回 404，避免泄露提示词是否存在
    const existingPrompt = await db.getOwnedUserPromptById(id, userId)
    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    let folderIdUpdate: number | null | undefined
    if (body.folder_id !== undefined) {
      if (body.folder_id === null || body.folder_id === '') {
        folderIdUpdate = null
      } else {
        const folderId = parsePositiveResourceId(body.folder_id)
        if (folderId == null) {
          return NextResponse.json(
            { success: false, error: '无效的文件夹ID' },
            { status: 400 }
          )
        }

        const folder = await db.getOwnedFolderById(folderId, userId)
        if (!folder) {
          return NextResponse.json(
            { success: false, error: '文件夹不存在' },
            { status: 404 }
          )
        }
        folderIdUpdate = folderId
      }
    }

    const editorState = resolveRequestedEditorState(body, existingPrompt)
    const title = promptEditorTitle(editorState)
    const content = composePromptEditorContent(editorState)
    const previousState = resolveStoredPromptEditorState(existingPrompt)
    const titleChanged = title !== String(existingPrompt.title || '')
    const contentChanged = content !== String(existingPrompt.content || '')
    const structureChanged = serializePromptEditorPayload(editorState) !== serializePromptEditorPayload(previousState)

    let categoryIdUpdate: number | null | undefined
    if (body.category_id !== undefined) {
      if (body.category_id === null || body.category_id === '') {
        categoryIdUpdate = null
      } else {
        categoryIdUpdate = parsePositiveResourceId(body.category_id)
        if (categoryIdUpdate == null) {
          return NextResponse.json({ success: false, error: '无效的分类ID' }, { status: 400 })
        }
      }
    }
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ success: false, error: 'description 必须是字符串' }, { status: 400 })
    }
    if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
      return NextResponse.json({ success: false, error: 'is_public 必须是布尔值' }, { status: 400 })
    }

    const updatedPrompt = await db.updateOwnedUserPromptWithVersion(id, userId, {
      title,
      content,
      editor_mode: editorState.editor_mode,
      payload: editorState.payload,
      schema_version: editorState.schema_version,
      description: body.description as string | null | undefined,
      folder_id: folderIdUpdate,
      category_id: categoryIdUpdate,
      is_public: body.is_public as boolean | undefined,
      tags: normalizedTags,
      change_summary: titleChanged && contentChanged
        ? '修改了标题和内容'
        : titleChanged
          ? '修改了标题'
          : contentChanged
            ? '修改了内容'
            : structureChanged
              ? '修改了结构化编辑内容'
              : '更新提示词',
    })
    if (!updatedPrompt) {
      return NextResponse.json({ success: false, error: '提示词不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: withResolvedPromptEditorState(updatedPrompt)
    })
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
    console.error('Update prompt error:', error)
    return NextResponse.json(
      { success: false, error: '更新提示词失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除用户提示词
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const userId = auth.user.id
    
    const { id: idStr } = await params
    const id = parsePositiveResourceId(idStr)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    // 对不存在和越权资源统一返回 404
    const existingPrompt = await db.getOwnedUserPromptById(id, userId)
    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: '提示词不存在' },
        { status: 404 }
      )
    }

    await db.deleteUserPrompt(id)

    return NextResponse.json({
      success: true,
      data: { id, message: '删除成功' }
    })
  } catch (error) {
    console.error('Delete prompt error:', error)
    return NextResponse.json(
      { success: false, error: '删除提示词失败' },
      { status: 500 }
    )
  }
}
