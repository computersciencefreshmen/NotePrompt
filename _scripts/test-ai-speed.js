// AI模型响应速度测试脚本
require('dotenv').config({ path: '.env.local' })

const TEST_PROMPT = '请用一句话优化这个提示词：帮我写一篇文章'

const MODELS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3.2 Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 推理' },
    ]
  },
  kimi: {
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: process.env.KIMI_API_KEY,
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 Preview' },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128k' },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32k' },
    ]
  },
  qwen: {
    name: 'Qwen',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY,
    models: [
      { id: 'qwen3-max', name: 'Qwen3 Max' },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus' },
      { id: 'qwen-long', name: 'Qwen Long' },
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
      { id: 'qwen3.5-flash', name: 'Qwen3.5 Flash' },
    ]
  },
  zhipu: {
    name: '智谱GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: process.env.ZHIPU_API_KEY,
    models: [
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash' },
      { id: 'glm-4.6', name: 'GLM-4.6' },
      { id: 'glm-4.5', name: 'GLM-4.5' },
    ]
  }
}

async function testModel(provider, providerConfig, model) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout

  const start = Date.now()
  try {
    const res = await fetch(`${providerConfig.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: TEST_PROMPT }],
        max_tokens: 200,
        temperature: 0.7,
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    const elapsed = Date.now() - start

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { provider, model: model.id, name: model.name, ms: -1, status: `HTTP ${res.status}`, error: errText.substring(0, 120) }
    }

    const data = await res.json()
    const totalMs = Date.now() - start
    const outputLen = data.choices?.[0]?.message?.content?.length || 0

    return { provider, model: model.id, name: model.name, ms: totalMs, status: 'OK', outputLen }
  } catch (err) {
    clearTimeout(timeout)
    const elapsed = Date.now() - start
    const errMsg = err.name === 'AbortError' ? 'TIMEOUT (>60s)' : err.message?.substring(0, 80)
    return { provider, model: model.id, name: model.name, ms: elapsed, status: 'ERROR', error: errMsg }
  }
}

async function main() {
  console.log('=== AI模型响应速度测试 ===')
  console.log(`测试提示词: "${TEST_PROMPT}"`)
  console.log(`超时限制: 60秒`)
  console.log('')

  const results = []

  for (const [providerKey, providerConfig] of Object.entries(MODELS)) {
    if (!providerConfig.apiKey) {
      console.log(`⚠ ${providerConfig.name}: API Key 未配置，跳过`)
      continue
    }
    console.log(`\n--- 测试 ${providerConfig.name} ---`)

    for (const model of providerConfig.models) {
      process.stdout.write(`  ${model.name} (${model.id})... `)
      const result = await testModel(providerKey, providerConfig, model)
      results.push(result)

      if (result.status === 'OK') {
        console.log(`✅ ${result.ms}ms (输出${result.outputLen}字)`)
      } else {
        console.log(`❌ ${result.status} ${result.error || ''} (${result.ms}ms)`)
      }
    }
  }

  // 按响应时间排序
  console.log('\n\n========== 排名结果（按响应速度） ==========')
  const successful = results.filter(r => r.status === 'OK').sort((a, b) => a.ms - b.ms)
  const failed = results.filter(r => r.status !== 'OK')

  console.log('\n✅ 可用模型（按速度排序）:')
  successful.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.provider}] ${r.name} - ${r.ms}ms`)
  })

  if (failed.length > 0) {
    console.log('\n❌ 不可用/超时模型:')
    failed.forEach(r => {
      console.log(`  - [${r.provider}] ${r.name}: ${r.status} ${r.error || ''}`)
    })
  }

  // 输出建议的排序配置
  console.log('\n\n========== 建议的模型排序配置 ==========')
  const orderByProvider = {}
  successful.forEach(r => {
    if (!orderByProvider[r.provider]) orderByProvider[r.provider] = []
    orderByProvider[r.provider].push(r.model)
  })
  // Provider排序：按各provider最快模型的速度
  const providerOrder = Object.entries(orderByProvider)
    .map(([p, models]) => {
      const fastest = successful.find(r => r.provider === p)
      return { provider: p, fastestMs: fastest?.ms || 999999, models }
    })
    .sort((a, b) => a.fastestMs - b.fastestMs)

  console.log(JSON.stringify(providerOrder, null, 2))
}

main().catch(console.error)
