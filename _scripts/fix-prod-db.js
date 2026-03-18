const { Client } = require('ssh2')

const conn = new Client()
const SERVER = { host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' }

function exec(conn, cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { out += d.toString() })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, code }) })
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('=== Connected to production server ===\n')

      try {
        // 1. Add missing columns to user_prompts
        console.log('--- Step 1: Add mode and is_public columns to user_prompts ---')
        const sql1 = `
          ALTER TABLE user_prompts 
          ADD COLUMN mode VARCHAR(20) DEFAULT 'basic' AFTER category_id,
          ADD COLUMN is_public TINYINT(1) DEFAULT 0 AFTER mode;
        `
        const r1 = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "${sql1}" 2>&1`)
        console.log(r1.out || '(success)')

        // 2. Create prompt_versions table
        console.log('\n--- Step 2: Create prompt_versions table ---')
        const sql2 = `
          CREATE TABLE IF NOT EXISTS prompt_versions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            prompt_id INT NOT NULL,
            user_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            content TEXT NOT NULL,
            version_number INT NOT NULL DEFAULT 1,
            change_summary VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_prompt_id (prompt_id),
            INDEX idx_user_id (user_id),
            FOREIGN KEY (prompt_id) REFERENCES user_prompts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
        const r2 = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "${sql2}" 2>&1`)
        console.log(r2.out || '(success)')

        // 3. Verify
        console.log('\n--- Step 3: Verify changes ---')
        const r3 = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "DESCRIBE user_prompts;" 2>/dev/null`)
        console.log('user_prompts columns:')
        console.log(r3.out)

        const r4 = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "DESCRIBE prompt_versions;" 2>/dev/null`)
        console.log('prompt_versions columns:')
        console.log(r4.out)

        // 4. Quick API test
        console.log('\n--- Step 4: Test API health ---')
        const r5 = await exec(conn, `curl -sk https://noteprompt.cn/api/v1/health-check 2>/dev/null`)
        console.log(r5.out)

        console.log('\n=== Database migration complete ===')
        conn.end()
        resolve()
      } catch (err) {
        console.error('Migration Error:', err)
        conn.end()
        reject(err)
      }
    }).connect(SERVER)
  })
}

main().catch(console.error)
