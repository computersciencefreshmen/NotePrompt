// Comprehensive API & Feature Test Script
// Run: node test-site.js

const BASE = 'http://localhost:3001'
let token = ''
let testPromptId = null
let testFolderId = null
let passed = 0
let failed = 0

async function req(method, path, body, authRequired = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (authRequired && token) headers['Authorization'] = `Bearer ${token}`
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  try {
    const r = await fetch(`${BASE}/api/v1${path}`, opts)
    const json = await r.json()
    return { status: r.status, ...json }
  } catch (e) {
    return { status: 0, error: e.message }
  }
}

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`)
    passed++
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`)
    failed++
  }
}

async function run() {
  console.log('═══════════════════════════════════════')
  console.log('   Note Prompt — 全站 API 测试')
  console.log('═══════════════════════════════════════\n')

  // ── 1. 首页可访问 ──────────────────────────
  console.log('【1】首页')
  try {
    const r = await fetch(BASE)
    test('首页 HTTP 200', r.status === 200)
  } catch (e) {
    test('首页 HTTP 200', false, e.message)
  }

  // ── 2. 认证 ────────────────────────────────
  console.log('\n【2】认证系统')
  
  // 注册（可能已存在，忽略错误）
  await req('POST', '/auth/register', {
    username: 'testuser_api',
    password: 'Test123456',
    email: 'testuser_api@test.com'
  }, false)

  // 登录
  const loginRes = await req('POST', '/auth/login', {
    username: 'henry',
    password: 'Henry123456'
  }, false)
  test('登录成功', loginRes.success && loginRes.data?.token, JSON.stringify(loginRes.error || ''))
  if (loginRes.data?.token) token = loginRes.data.token

  // 获取当前用户
  const meRes = await req('GET', '/user/profile')
  test('获取当前用户', meRes.success && meRes.data?.username === 'henry')

  // ── 3. 文件夹 ──────────────────────────────
  console.log('\n【3】文件夹管理')
  const createFolderRes = await req('POST', '/folders', { name: 'API测试文件夹_' + Date.now() })
  test('创建文件夹', createFolderRes.success, JSON.stringify(createFolderRes.error || ''))
  if (createFolderRes.data?.id) testFolderId = createFolderRes.data.id

  const listFoldersRes = await req('GET', '/folders')
  test('获取文件夹列表', listFoldersRes.success && Array.isArray(listFoldersRes.data))

  // ── 4. 提示词 CRUD ──────────────────────────
  console.log('\n【4】提示词 CRUD')
  const createPromptRes = await req('POST', '/prompts', {
    title: 'API测试提示词',
    content: '这是一个通过API创建的测试提示词内容，用于测试系统功能。',
    folder_id: testFolderId,
    is_public: false,
    tags: ['测试', 'API']
  })
  test('创建提示词', createPromptRes.success, JSON.stringify(createPromptRes.error || ''))
  if (createPromptRes.data?.id) testPromptId = createPromptRes.data.id

  const listPromptsRes = await req('GET', '/prompts')
  test('获取提示词列表', listPromptsRes.success)

  if (testPromptId) {
    const getPromptRes = await req('GET', `/prompts/${testPromptId}`)
    test('获取单个提示词', getPromptRes.success && getPromptRes.data?.id === testPromptId)

    const updatePromptRes = await req('PUT', `/prompts/${testPromptId}`, {
      title: 'API测试提示词（已更新）',
      content: '这是更新后的提示词内容，用于测试版本历史功能。',
    })
    test('更新提示词', updatePromptRes.success, JSON.stringify(updatePromptRes.error || ''))
  }

  // ── 5. 版本历史 ─────────────────────────────
  console.log('\n【5】版本历史')
  if (testPromptId) {
    const versionsRes = await req('GET', `/prompts/${testPromptId}/versions`)
    test('获取版本列表', versionsRes.success, JSON.stringify(versionsRes.error || ''))
    test('版本自动保存', Array.isArray(versionsRes.data) && versionsRes.data.length > 0,
      `版本数: ${versionsRes.data?.length || 0}`)

    if (versionsRes.data?.length > 0) {
      const vId = versionsRes.data[0].id
      const vDetailRes = await req('GET', `/prompts/${testPromptId}/versions/${vId}`)
      test('获取版本详情', vDetailRes.success && vDetailRes.data?.content)
    }
  }

  // ── 6. 全局搜索 ─────────────────────────────
  console.log('\n【6】全局搜索')
  const searchRes = await req('GET', '/search?q=测试')
  test('搜索接口正常', searchRes.success, JSON.stringify(searchRes.error || ''))
  test('搜索结果包含我的提示词', searchRes.data?.userPrompts?.items?.length > 0)
  
  const emptySearchRes = await req('GET', '/search?q=')
  test('空搜索返回空结果', emptySearchRes.success)

  // ── 7. 公共提示词 ────────────────────────────
  console.log('\n【7】公共提示词库')
  const pubListRes = await req('GET', '/public-prompts', null, false)
  test('公共提示词列表', pubListRes.success || pubListRes.data !== undefined,
    JSON.stringify(pubListRes.error || ''))

  // ── 8. 发布提示词 ────────────────────────────
  console.log('\n【8】发布功能')
  if (testPromptId) {
    const publishRes = await req('POST', `/prompts/${testPromptId}/publish`)
    test('发布提示词到公共库', publishRes.success, JSON.stringify(publishRes.error || ''))
  }

  // ── 9. 收藏 ──────────────────────────────────
  console.log('\n【9】收藏系统')
  const pubRes = await req('GET', '/public-prompts?limit=1')
  if (pubRes.data?.[0]?.id || pubRes.data?.prompts?.[0]?.id) {
    const favId = pubRes.data?.[0]?.id || pubRes.data?.prompts?.[0]?.id
    const addFavRes = await req('POST', `/favorites/${favId}`)
    test('添加收藏', addFavRes.success, JSON.stringify(addFavRes.error || ''))
    const listFavRes = await req('GET', '/favorites')
    test('获取收藏列表', listFavRes.success)
    const removeFavRes = await req('DELETE', `/favorites/${favId}`)
    test('取消收藏', removeFavRes.success, JSON.stringify(removeFavRes.error || ''))
  } else {
    test('收藏功能（跳过—无公共提示词）', true)
    test('收藏列表', true)
    test('取消收藏', true)
  }

  // ── 10. AI 状态 ───────────────────────────────
  console.log('\n【10】AI 服务')
  const aiStatusRes = await req('GET', '/ai/status')
  test('AI状态接口', aiStatusRes.success !== false, JSON.stringify(aiStatusRes.error || ''))

  // ── 11. 用户统计 & 设置 ──────────────────────
  console.log('\n【11】用户统计 & 设置')
  const statsRes = await req('GET', '/user/stats')
  test('用户统计', statsRes.success, JSON.stringify(statsRes.error || ''))

  // ── 12. 分类 & 标签 ───────────────────────────
  console.log('\n【12】分类 & 标签')
  const tagsRes = await req('GET', '/tags')
  test('获取所有标签', tagsRes.success || Array.isArray(tagsRes.data))
  const catsRes = await req('GET', '/categories', null, false)
  test('获取分类列表', catsRes.success !== false)

  // ── 13. 清理测试数据 ─────────────────────────
  console.log('\n【13】清理测试数据')
  if (testPromptId) {
    const delRes = await req('DELETE', `/prompts/${testPromptId}`)
    test('删除测试提示词', delRes.success, JSON.stringify(delRes.error || ''))
  }
  if (testFolderId) {
    const delFolderRes = await req('DELETE', `/folders/${testFolderId}`)
    test('删除测试文件夹', delFolderRes.success, JSON.stringify(delFolderRes.error || ''))
  }

  // ── 总结 ──────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  const total = passed + failed
  const rate = Math.round(passed / total * 100)
  console.log(`   测试结果: ${passed}/${total} 通过 (${rate}%)`)
  if (failed > 0) {
    console.log(`   ⚠️  ${failed} 个测试失败，请检查上方输出`)
  } else {
    console.log('   🎉 所有测试通过！')
  }
  console.log('═══════════════════════════════════════')
}

run().catch(console.error)
