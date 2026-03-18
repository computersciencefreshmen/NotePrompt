const { Client } = require('ssh2')
const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', () => resolve({ out: out.trim(), err: errOut.trim() }))
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      try {
        const mysql = async (sql) => {
          const r = await exec(conn, `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "${sql.replace(/"/g, '\\"')}"`)
          return r.out
        }

        console.log('=== Fix 1: Create ai_usage_daily table ===')
        await mysql(`
          CREATE TABLE IF NOT EXISTS ai_usage_daily (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            usage_date DATE NOT NULL,
            optimize_count INT DEFAULT 0,
            generate_count INT DEFAULT 0,
            total_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_date (user_id, usage_date),
            INDEX idx_user_id (user_id),
            INDEX idx_usage_date (usage_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)
        const check1 = await mysql("SHOW TABLES LIKE 'ai_usage_daily';")
        console.log('ai_usage_daily exists:', check1.includes('ai_usage_daily') ? 'YES' : 'NO')

        console.log('\n=== Fix 2: Reset fake view counts ===')
        await mysql("UPDATE public_prompts SET views_count = 0;")
        const check2 = await mysql("SELECT id, views_count FROM public_prompts ORDER BY id LIMIT 5;")
        console.log('View counts after reset:')
        console.log(check2)

        console.log('\n=== Done ===')
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
