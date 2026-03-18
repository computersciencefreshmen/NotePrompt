const { Client } = require('ssh2')

const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log('>>> ' + cmd)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', (code) => {
        if (out.trim()) console.log(out.trim())
        if (errOut.trim()) console.log('[stderr]', errOut.trim())
        resolve({ out, errOut, code })
      })
    })
  })
}

async function deploy() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('=== SSH Connected ===\n')
      
      try {
        // 1. Backup production configs
        console.log('--- Backup configs ---')
        await exec(conn, 'cp /opt/note-prompt/.env.local /tmp/.env.local.bak 2>/dev/null; cp /opt/note-prompt/docker-compose.yml /tmp/docker-compose.yml.bak 2>/dev/null; cp /opt/note-prompt/nginx/nginx.conf /tmp/nginx.conf.bak 2>/dev/null; echo "Backup done"')
        
        // 2. Pull latest code
        console.log('\n--- Pull latest code ---')
        await exec(conn, 'cd /opt/note-prompt && git fetch origin main && git reset --hard origin/main')
        
        // 3. Restore production configs
        console.log('\n--- Restore production configs ---')
        await exec(conn, 'cp /tmp/.env.local.bak /opt/note-prompt/.env.local 2>/dev/null; cp /tmp/docker-compose.yml.bak /opt/note-prompt/docker-compose.yml 2>/dev/null; cp /tmp/nginx.conf.bak /opt/note-prompt/nginx/nginx.conf 2>/dev/null; echo "Restore done"')
        
        // 4. Rebuild and restart
        console.log('\n--- Rebuild app container ---')
        const buildResult = await exec(conn, 'cd /opt/note-prompt && docker compose build --no-cache app 2>&1 | tail -20')
        
        console.log('\n--- Restart containers ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose down 2>&1 | tail -5')
        await exec(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1')
        
        // 5. Wait and verify
        console.log('\n--- Wait for app to start (30s) ---')
        await new Promise(r => setTimeout(r, 30000))
        
        await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep note-prompt')
        
        console.log('\n--- Verify endpoints ---')
        const endpoints = [
          ['Public Prompts', 'https://noteprompt.cn/public-prompts'],
          ['Login Page', 'https://noteprompt.cn/login'],
          ['Login API', 'https://noteprompt.cn/api/v1/auth/login'],
          ['Prompts New', 'https://noteprompt.cn/prompts/new'],
        ]
        for (const [name, url] of endpoints) {
          const result = await exec(conn, `curl -sk -o /dev/null -w "%{http_code}" "${url}"`)
          console.log(`  ${name}: ${result.out.trim()}`)
        }
        
        // 6. Test admin login
        console.log('\n--- Test admin login ---')
        const loginResult = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123456"}' 2>/dev/null | head -c 200`)
        
        console.log('\n=== Deploy Complete ===')
        conn.end()
        resolve()
      } catch (err) {
        console.error('Deploy error:', err)
        conn.end()
        reject(err)
      }
    }).connect(SERVER)
  })
}

deploy().catch(console.error)
