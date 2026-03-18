const { Client } = require('ssh2')

const hash = '$2b$10$hwpXVMXrlBQNtCfZhHphi.IlaEJ52AvWl9wMA5zqw1eVlPrLq7cBq'
// Escape $ for shell interpretation
const escapedHash = hash.replace(/\$/g, '\\$')

const conn = new Client()
conn.on('ready', () => {
  console.log('SSH Connected')
  
  const commands = [
    // Use escaped hash in the UPDATE command
    `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "UPDATE users SET password_hash='${escapedHash}' WHERE username='admin';"`,
    // Verify the hash was stored correctly
    `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "SELECT id,username,password_hash,is_admin,is_active FROM users WHERE username='admin';"`,
  ]
  
  let idx = 0
  function runNext() {
    if (idx >= commands.length) {
      conn.end()
      return
    }
    const cmd = commands[idx++]
    console.log('>>> ' + cmd.substring(0, 80) + '...')
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error('exec err:', err); conn.end(); return }
      let out = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { process.stderr.write(d) })
      stream.on('close', () => {
        console.log(out)
        runNext()
      })
    })
  }
  runNext()
}).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' })
