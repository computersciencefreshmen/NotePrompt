import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROMPT_EDITOR_LIST_MAX_ITEMS,
  PROMPT_EDITOR_PAYLOAD_MAX_BYTES,
  PromptEditorStateValidationError,
  composePromptEditorContent,
  normalizePromptEditorState,
  resolveStoredPromptEditorState,
} from '../src/lib/prompt-editor-state.ts'

const fallback = { title: 'Legacy title', content: 'Legacy content', mode: 'normal' }

test('normal editor state is normalized and composed from objective', () => {
  const state = normalizePromptEditorState({
    editor_mode: 'normal',
    schema_version: 1,
    payload: {
      title: '  Research helper  ',
      objective: 'Summarize the paper',
      context: 'Academic review',
      style: 'academic',
      tone: 'neutral',
      format: 'table',
      examples: 'Example output',
    },
  }, fallback)

  assert.equal(state.editor_mode, 'normal')
  assert.equal(state.payload.title, 'Research helper')
  assert.equal(state.payload.context, 'Academic review')
  assert.equal(composePromptEditorContent(state), 'Summarize the paper')
})

test('professional state preserves every supported structure field', () => {
  const state = normalizePromptEditorState({
    editor_mode: 'professional',
    schema_version: 1,
    payload: {
      title: 'Contract reviewer',
      content: 'Fallback text',
      role: 'You are counsel',
      background: 'Review context',
      task: 'Review the contract',
      format: 'Markdown',
      outputStyle: 'Concise',
      formatRules: ['Use headings'],
      qualityMetrics: ['Cover every clause'],
      acceptanceCriteria: ['Cite clause numbers'],
      constraints: ['Do not invent facts'],
      examples: ['Clause 1: risk'],
      variables: { jurisdiction: 'Applicable jurisdiction' },
    },
  }, fallback)

  assert.equal(state.editor_mode, 'professional')
  assert.deepEqual(state.payload.variables, { jurisdiction: 'Applicable jurisdiction' })
  assert.deepEqual(state.payload.acceptanceCriteria, ['Cite clause numbers'])
  assert.match(composePromptEditorContent(state), /## 角色设定/)
  assert.match(composePromptEditorContent(state), /\{\{jurisdiction\}\}/)
})

test('unknown and prototype-pollution fields are rejected', () => {
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'normal',
    payload: { title: 'Title', objective: 'Task', surprise: true },
  }, fallback), PromptEditorStateValidationError)

  const pollutedPayload = JSON.parse('{"title":"Title","objective":"Task","__proto__":{"admin":true}}')
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'normal',
    payload: pollutedPayload,
  }, fallback), /不安全字段/)

  const pollutedVariables = JSON.parse('{"title":"Title","task":"Task","variables":{"constructor":"x"}}')
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'professional',
    payload: pollutedVariables,
  }, fallback), /不安全字段/)
})

test('mode/payload mismatches and unsupported schema versions are rejected', () => {
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'normal',
    payload: { title: 'Title', task: 'Professional task' },
  }, fallback), /未知字段/)
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'normal',
    schema_version: 2,
    payload: { title: 'Title', objective: 'Task' },
  }, fallback), /不支持的 schema_version/)
})

test('array, string, and total JSON size limits are enforced', () => {
  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'professional',
    payload: {
      title: 'Title',
      task: 'Task',
      constraints: Array.from({ length: PROMPT_EDITOR_LIST_MAX_ITEMS + 1 }, () => 'item'),
    },
  }, fallback), /项目数量限制/)

  assert.throws(() => normalizePromptEditorState({
    editor_mode: 'normal',
    payload: {
      title: 'Title',
      objective: 'x'.repeat(PROMPT_EDITOR_PAYLOAD_MAX_BYTES),
    },
  }, fallback), /长度限制|64 KiB/)
})

test('legacy or invalid stored payload falls back to safe editable state', () => {
  const legacy = resolveStoredPromptEditorState({
    title: 'Legacy',
    content: 'Legacy flattened prompt',
    mode: 'pro',
    payload: null,
    schema_version: 1,
  })
  assert.equal(legacy.editor_mode, 'professional')
  assert.equal(legacy.payload.task, 'Legacy flattened prompt')

  const recovered = resolveStoredPromptEditorState({
    title: 'Recovered',
    content: 'Safe content',
    editor_mode: 'normal',
    payload: { title: 'Injected', objective: 'Task', unknown: 'field' },
    schema_version: 1,
  })
  assert.equal(recovered.editor_mode, 'normal')
  assert.equal(recovered.payload.title, 'Recovered')
  assert.equal(recovered.payload.objective, 'Safe content')
})
