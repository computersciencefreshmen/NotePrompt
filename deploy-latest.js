const { Client } = require('ssh2')

const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log('>>> ' + cmd)
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString(); process.stdout.write(d) })
      stream.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d) })
      stream.on('close', (code) => {
        clearTimeout(timer)
        resolve({ out, errOut, code })
      })
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('=== SSH Connected ===\n')
      try {
        // 1. Pull latest code
        console.log('--- Step 1: Git Pull ---')
        await exec(conn, 'cd /opt/note-prompt && git pull origin main 2>&1')

        // 2. Rebuild Docker image
        console.log('\n--- Step 2: Docker Build ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose build note-prompt-app 2>&1 | tail -20', 600000)

        // 3. Restart containers
        console.log('\n--- Step 3: Restart Containers ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1')

        // 4. Wait for startup
        console.log('\n--- Step 4: Wait 30s for app startup ---')
        await new Promise(r => setTimeout(r, 30000))

        // 5. Health check
        console.log('\n--- Step 5: Health Check ---')
        await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1')
        await exec(conn, 'curl -sk https://noteprompt.cn/api/v1/health-check 2>/dev/null')

        // 6. Test prompt creation API
        console.log('\n\n--- Step 6: Test API ---')
        await exec(conn, `curl -sk -o /dev/null -w "POST /api/v1/prompts => %{http_code}\\n" -X POST https://noteprompt.cn/api/v1/prompts -H "Content-Type: application/json" -d '{}' 2>/dev/null`)

        console.log('\n=== Deploy Complete ===')
        conn.end()
        resolve()
      } catch (err) {
        console.error('Deploy Error:', err)
        conn.end()
        reject(err)
      }
    }).on('error', (err) => {
      console.error('SSH Connection Error:', err.message)
      reject(err)
    }).connect(SERVER)
  })
}

main().catch(console.error)
