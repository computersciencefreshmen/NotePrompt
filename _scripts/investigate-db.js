const { Client } = require('ssh2')
const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => {})
      stream.on('close', () => resolve(out.trim()))
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      try {
        const mysql = (sql) => exec(conn, `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -N -e "${sql}"`)
        
        console.log('=== DB Investigation ===\n')
        
        // 1. Check if ai_usage_daily table exists
        console.log('--- ai_usage_daily table ---')
        const t1 = await mysql("SHOW TABLES LIKE 'ai_usage_daily';")
        console.log('Exists:', t1 || 'NO')
        
        // 2. Check view counts on public prompts
        console.log('\n--- Public prompts view counts (top 10) ---')
        const views = await mysql("SELECT id, title, views_count FROM public_prompts ORDER BY views_count DESC LIMIT 10;")
        console.log(views)
        
        // 3. Total public prompts count
        console.log('\n--- Total public prompts ---')
        const total = await mysql("SELECT COUNT(*) FROM public_prompts;")
        console.log('Count:', total)
        
        // 4. Check public folders
        console.log('\n--- Public folders ---')
        const folders = await mysql("SELECT id, name, description FROM public_folders ORDER BY id;")
        console.log(folders || 'None')
        
        // 5. Check categories
        console.log('\n--- Categories ---')
        const cats = await mysql("SELECT id, name FROM categories ORDER BY id;")
        console.log(cats || 'None')
        
        // 6. Check .env.local for AI API keys
        console.log('\n--- AI API keys configured ---')
        const keys = await exec(conn, "grep -E 'API_KEY|DASHSCOPE' /opt/note-prompt/.env.local | sed 's/=.*/=***/'")
        console.log(keys)
        
        // 7. Check public_folders table structure
        console.log('\n--- public_folders table ---')
        const pf = await mysql("SHOW CREATE TABLE public_folders;")
        console.log(pf ? pf.substring(0, 500) : 'Table does not exist')
        
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
