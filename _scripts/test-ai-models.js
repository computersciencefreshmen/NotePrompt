const { Client } = require('ssh2')
const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ out: 'TIMEOUT', err: '' }), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', () => { clearTimeout(timer); resolve({ out: out.trim(), err: errOut.trim() }) })
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      try {
        // Get API keys from .env.local
        const envResult = await exec(conn, "cat /opt/note-prompt/.env.local")
        const envLines = envResult.out.split('\n')
        const env = {}
        for (const line of envLines) {
          const m = line.match(/^([A-Z_]+)=(.+)$/)
          if (m) env[m[1]] = m[2].trim()
        }
        
        console.log('API Keys found:')
        console.log('  DEEPSEEK_API_KEY:', env.DEEPSEEK_API_KEY ? 'YES' : 'NO')
        console.log('  KIMI_API_KEY:', env.KIMI_API_KEY ? 'YES' : 'NO')
        console.log('  DASHSCOPE_API_KEY:', env.DASHSCOPE_API_KEY ? 'YES' : 'NO')
        console.log('  ZHIPU_API_KEY:', env.ZHIPU_API_KEY ? 'YES' : 'NO')
        
        const models = [
          // DeepSeek
          { provider: 'DeepSeek', model: 'deepseek-chat', name: 'DeepSeek-V3.2 Chat', baseURL: 'https://api.deepseek.com/v1', apiKey: env.DEEPSEEK_API_KEY },
          { provider: 'DeepSeek', model: 'deepseek-reasoner', name: 'DeepSeek-R1 推理', baseURL: 'https://api.deepseek.com/v1', apiKey: env.DEEPSEEK_API_KEY },
          // Kimi
          { provider: 'Kimi', model: 'kimi-k2.5', name: 'Kimi K2.5', baseURL: 'https://api.moonshot.cn/v1', apiKey: env.KIMI_API_KEY },
          { provider: 'Kimi', model: 'kimi-k2-0905-preview', name: 'Kimi K2 Preview', baseURL: 'https://api.moonshot.cn/v1', apiKey: env.KIMI_API_KEY },
          { provider: 'Kimi', model: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', baseURL: 'https://api.moonshot.cn/v1', apiKey: env.KIMI_API_KEY },
          { provider: 'Kimi', model: 'moonshot-v1-128k', name: 'Moonshot V1 128k', baseURL: 'https://api.moonshot.cn/v1', apiKey: env.KIMI_API_KEY },
          { provider: 'Kimi', model: 'moonshot-v1-32k', name: 'Moonshot V1 32k', baseURL: 'https://api.moonshot.cn/v1', apiKey: env.KIMI_API_KEY },
          // Qwen
          { provider: 'Qwen', model: 'qwen3-max', name: 'Qwen3 Max', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY },
          { provider: 'Qwen', model: 'qwen3.5-plus', name: 'Qwen3.5 Plus', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY },
          { provider: 'Qwen', model: 'qwen-long', name: 'Qwen Long', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY },
          { provider: 'Qwen', model: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY },
          { provider: 'Qwen', model: 'qwen3.5-flash', name: 'Qwen3.5 Flash', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY },
          // Zhipu
          { provider: '智谱GLM', model: 'glm-5', name: 'GLM-5', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: env.ZHIPU_API_KEY },
          { provider: '智谱GLM', model: 'glm-4.7', name: 'GLM-4.7', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: env.ZHIPU_API_KEY },
          { provider: '智谱GLM', model: 'glm-4.7-flash', name: 'GLM-4.7-Flash', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: env.ZHIPU_API_KEY },
          { provider: '智谱GLM', model: 'glm-4.6', name: 'GLM-4.6', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: env.ZHIPU_API_KEY },
          { provider: '智谱GLM', model: 'glm-4.5', name: 'GLM-4.5', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: env.ZHIPU_API_KEY },
        ]
        
        const prompt = '请用一句话介绍什么是提示词工程。'
        const results = []
        
        console.log(`\nTesting ${models.length} models...\n`)
        
        for (const m of models) {
          if (!m.apiKey) {
            console.log(`[SKIP] ${m.provider} / ${m.name} - No API key`)
            results.push({ ...m, status: 'NO_KEY', time: Infinity })
            continue
          }
          
          process.stdout.write(`Testing ${m.provider} / ${m.name} (${m.model})... `)
          
          // Build curl command to run from server (closer to China APIs)
          const body = JSON.stringify({
            model: m.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100,
            temperature: 0.7
          }).replace(/'/g, "'\\''")
          
          const curlCmd = `curl -sk -w '\\n%{time_total}' -o /tmp/ai_test_out.txt --max-time 30 -X POST "${m.baseURL}/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer ${m.apiKey}" -d '${body}' 2>/dev/null; echo "---"; cat /tmp/ai_test_out.txt 2>/dev/null`
          
          const start = Date.now()
          const result = await exec(conn, curlCmd, 35000)
          const elapsed = Date.now() - start
          
          // Parse the output
          const parts = result.out.split('---')
          const timePart = parts[0]?.trim()
          const responsePart = parts[1]?.trim() || ''
          
          let curlTime = 0
          try {
            curlTime = parseFloat(timePart) * 1000  // curl time_total is in seconds
          } catch { curlTime = elapsed }
          
          // Check if response is valid
          let status = 'OK'
          let snippet = ''
          try {
            const json = JSON.parse(responsePart)
            if (json.error) {
              status = `ERROR: ${json.error.message?.substring(0, 50) || json.error.code || 'unknown'}`
            } else if (json.choices?.[0]?.message?.content) {
              snippet = json.choices[0].message.content.substring(0, 50)
            } else {
              status = 'NO_CONTENT'
            }
          } catch {
            status = result.out === 'TIMEOUT' ? 'TIMEOUT' : `PARSE_ERR`
          }
          
          const displayTime = Math.round(curlTime)
          console.log(`${displayTime}ms - ${status}${snippet ? ' - ' + snippet : ''}`)
          
          results.push({ provider: m.provider, name: m.name, model: m.model, status, time: curlTime, snippet })
        }
        
        // Sort by speed and display ranking
        const successful = results.filter(r => r.status === 'OK')
        const failed = results.filter(r => r.status !== 'OK')
        
        successful.sort((a, b) => a.time - b.time)
        
        console.log('\n' + '='.repeat(80))
        console.log('AI MODEL SPEED RANKING (from China server)')
        console.log('='.repeat(80))
        console.log(`${'Rank'.padEnd(6)}${'Provider'.padEnd(12)}${'Model'.padEnd(28)}${'Time'.padEnd(10)}Status`)
        console.log('-'.repeat(80))
        
        successful.forEach((r, i) => {
          console.log(`#${(i + 1).toString().padEnd(5)}${r.provider.padEnd(12)}${r.name.padEnd(28)}${Math.round(r.time).toString().padEnd(10)}${r.status}`)
        })
        
        if (failed.length > 0) {
          console.log('\n--- Failed Models ---')
          failed.forEach(r => {
            console.log(`  ${r.provider.padEnd(12)}${r.name.padEnd(28)}${r.status}`)
          })
        }
        
        conn.end()
        resolve()
      } catch (err) {
        console.error('Error:', err)
        conn.end()
        reject(err)
      }
    }).connect(SERVER)
  })
}

main().catch(console.error)
