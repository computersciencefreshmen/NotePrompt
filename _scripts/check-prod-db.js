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
      stream.on('close', () => { clearTimeout(timer); resolve(out) })
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      try {
        // Check user_prompts columns
        console.log('=== user_prompts columns ===')
        const cols = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "DESCRIBE user_prompts;" 2>/dev/null`)
        console.log(cols)

        // Check if prompt_versions table exists
        console.log('=== prompt_versions table ===')
        const versions = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "SHOW TABLES LIKE 'prompt_versions';" 2>/dev/null`)
        console.log(versions || '(table does not exist)')

        // Check if user_prompt_tags table exists
        console.log('=== user_prompt_tags table ===')
        const tags = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "SHOW TABLES LIKE 'user_prompt_tags';" 2>/dev/null`)
        console.log(tags || '(table does not exist)')

        // Show all tables
        console.log('=== All tables ===')
        const tables = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "SHOW TABLES;" 2>/dev/null`)
        console.log(tables)

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
