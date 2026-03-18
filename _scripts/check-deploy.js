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

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('=== SSH Connected ===\n')
      
      try {
        // Check docker-compose service names
        console.log('--- Check docker-compose.yml services ---')
        await exec(conn, 'cd /opt/note-prompt && grep -E "^\\s+\\w+:" docker-compose.yml | head -10')
        
        // Check what source code version is on server
        console.log('\n--- Check git log ---')
        await exec(conn, 'cd /opt/note-prompt && git log --oneline -3')
        
        // Check if the modified files have our changes
        console.log('\n--- Check login redirect fix ---')
        await exec(conn, "cd /opt/note-prompt && grep -n 'public-prompts' src/app/login/page.tsx | head -5")
        
        // Check docker-compose service names more precisely
        console.log('\n--- Docker compose config services ---')
        await exec(conn, 'cd /opt/note-prompt && docker compose config --services 2>&1')
        
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
