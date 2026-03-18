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
      stream.on('close', () => {
        if (out.trim()) console.log(out.trim())
        if (errOut.trim() && !errOut.includes('Using a password')) console.log('[stderr]', errOut.trim())
        resolve({ out, errOut })
      })
    })
  })
}

async function main() {
  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log('=== SSH Connected ===\n')
      try {
        // Check which DB the app connects to
        console.log('--- Check .env.local DB config ---')
        await exec(conn, 'grep -i "mysql\\|database\\|db_" /opt/note-prompt/.env.local 2>/dev/null')
        
        // Check the docker-compose for DB config
        console.log('\n--- Check docker-compose DB network ---')
        await exec(conn, 'grep -A5 -i "mysql\\|database" /opt/note-prompt/docker-compose.yml 2>/dev/null | head -20')
        
        // Check running mysql containers
        console.log('\n--- Running MySQL containers ---')
        await exec(conn, 'docker ps --format "{{.Names}} {{.Ports}}" | grep -i mysql')
        
        // Check the admin user password hash in docker_mysql8
        console.log('\n--- Admin user in docker_mysql8 ---')
        await exec(conn, `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "SELECT id,username,LEFT(password_hash,30) as hash_prefix,is_admin,is_active,email_verified FROM users WHERE username='admin';"`)
        
        // Check if there's another MySQL instance
        console.log('\n--- All MySQL containers ---')
        await exec(conn, 'docker ps -a --format "{{.Names}} {{.Status}}" | grep -i mysql')
        
        // Check the app container logs for DB connection
        console.log('\n--- App container recent logs ---')
        await exec(conn, 'docker logs note-prompt-app --tail 30 2>&1 | grep -i "database\\|mysql\\|connect\\|error\\|login" | tail -15')

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
