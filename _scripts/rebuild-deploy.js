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
        // Rebuild with correct service name
        console.log('--- Rebuild note-prompt-app ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose build --no-cache note-prompt-app 2>&1 | tail -30', 300000)
        
        // Restart
        console.log('\n--- Restart containers ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose down 2>&1 | tail -10')
        await exec(conn, 'cd /opt/note-prompt && docker compose up -d 2>&1')
        
        // Wait
        console.log('\n--- Wait 35s for app to start ---')
        await new Promise(r => setTimeout(r, 35000))
        
        // Check container health
        await exec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep note-prompt')
        
        // Test admin login
        console.log('\n--- Test admin login ---')
        await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123456"}' 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -sk -X POST https://noteprompt.cn/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123456"}' 2>/dev/null`)
        
        // Test pages
        console.log('\n--- Test pages ---')
        const pages = ['/', '/login', '/public-prompts', '/prompts/new']
        for (const p of pages) {
          await exec(conn, `curl -sk -o /dev/null -w "${p} => %{http_code}\\n" "https://noteprompt.cn${p}"`)
        }
        
        console.log('\n=== Deploy Complete ===')
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
