const { Client } = require('ssh2')
const conn = new Client()
conn.on('ready', () => {
  console.log('SSH Connected')
  const cmd = `curl -sk -X POST https://noteprompt.cn/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123456"}'`
  console.log('>>> Testing admin login...')
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return }
    let out = ''
    stream.on('data', d => { out += d.toString() })
    stream.stderr.on('data', d => {})
    stream.on('close', () => {
      try {
        const data = JSON.parse(out)
        console.log('Success:', data.success)
        if (data.success && data.data) {
          console.log('Token:', data.data.token?.substring(0, 30) + '...')
          console.log('User:', data.data.user?.username, 'Admin:', data.data.user?.is_admin)
        } else {
          console.log('Error:', data.error)
        }
      } catch { console.log('Raw:', out) }
      conn.end()
    })
  })
}).connect({ host: '8.138.176.174', port: 22, username: 'root', password: '20040618Aa' })
