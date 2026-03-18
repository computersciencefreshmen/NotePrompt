const { Client } = require('ssh2');
const conn = new Client();
function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if(e) return rej(e);
      let o='',er='';
      s.on('data',d=>{o+=d});
      s.stderr.on('data',d=>{er+=d});
      s.on('close',code=>{res({stdout:o.trim(),stderr:er.trim(),code})});
    });
  });
}
async function main() {
  await new Promise((r,j)=>{conn.on('ready',r);conn.on('error',j);conn.connect({host:'8.138.176.174',port:22,username:'root',password:'20040618Aa',readyTimeout:10000})});
  console.log('SSH connected\n');

  // Create public dir and favicon inside the running container
  const script = `
const fs = require('fs');
try { fs.mkdirSync('/app/public', { recursive: true }); } catch(e) {}
const w = 16, h = 16;
const imgSize = w * h * 4;
const hdrSize = 6, entSize = 16, bmpHdr = 40;
const buf = Buffer.alloc(hdrSize + entSize + bmpHdr + imgSize, 0);
let o = 0;
buf.writeUInt16LE(0, o); o+=2;
buf.writeUInt16LE(1, o); o+=2;
buf.writeUInt16LE(1, o); o+=2;
buf.writeUInt8(w, o); o+=1;
buf.writeUInt8(h, o); o+=1;
buf.writeUInt8(0, o); o+=1;
buf.writeUInt8(0, o); o+=1;
buf.writeUInt16LE(1, o); o+=2;
buf.writeUInt16LE(32, o); o+=2;
buf.writeUInt32LE(bmpHdr+imgSize, o); o+=4;
buf.writeUInt32LE(hdrSize+entSize, o); o+=4;
buf.writeUInt32LE(bmpHdr, o); o+=4;
buf.writeInt32LE(w, o); o+=4;
buf.writeInt32LE(h*2, o); o+=4;
buf.writeUInt16LE(1, o); o+=2;
buf.writeUInt16LE(32, o); o+=2;
buf.writeUInt32LE(0, o); o+=4;
buf.writeUInt32LE(imgSize, o); o+=4;
o+=16;
for(let y=0;y<h;y++){for(let x=0;x<w;x++){
  const fy=h-1-y;
  const cx=x-7.5,cy=fy-7.5,d=Math.sqrt(cx*cx+cy*cy);
  let r=0x1E,g=0x91,b=0x7A,a=0xFF;
  if(d>8.5){a=0;r=g=b=0}else if(d>7.5){a=0x80}
  buf.writeUInt8(b,o);o++;buf.writeUInt8(g,o);o++;buf.writeUInt8(r,o);o++;buf.writeUInt8(a,o);o++;
}}
fs.writeFileSync('/app/public/favicon.ico',buf);
console.log('OK');
`;
  const b64 = Buffer.from(script).toString('base64');

  // Execute as root user in container to bypass permission issues
  let r = await exec(conn, `docker exec -u root note-prompt-app sh -c "echo '${b64}' | base64 -d > /tmp/gen.js && node /tmp/gen.js"`);
  console.log('Generate:', r.stdout, r.stderr);

  // Chown back to nextjs
  r = await exec(conn, 'docker exec -u root note-prompt-app chown -R nextjs:nextjs /app/public');
  console.log('Chown:', r.stdout || 'OK');

  // Test
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code} %{size_download}bytes" https://noteprompt.cn/favicon.ico');
  console.log('Favicon test:', r.stdout);

  // Also push the Dockerfile fix and favicon to git, then update server repo
  console.log('\n=== Updating server repo ===');
  // Update Dockerfile on server
  const dockerfile = require('fs').readFileSync('c:\\\\Users\\\\Henry\\\\Desktop\\\\毕业设计\\\\note-prompt\\\\Dockerfile', 'utf8');
  const dfB64 = Buffer.from(dockerfile).toString('base64');
  r = await exec(conn, `echo '${dfB64}' | base64 -d > /opt/note-prompt/Dockerfile`);
  console.log('Dockerfile updated on server');

  // Copy favicon to server repo
  const favicon = require('fs').readFileSync('c:\\\\Users\\\\Henry\\\\Desktop\\\\毕业设计\\\\note-prompt\\\\public\\\\favicon.ico');
  const favB64 = favicon.toString('base64');
  r = await exec(conn, `mkdir -p /opt/note-prompt/public && echo '${favB64}' | base64 -d > /opt/note-prompt/public/favicon.ico`);
  console.log('Favicon copied to server repo');

  // Final test
  console.log('\n=== Final Tests ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/favicon.ico');
  console.log('favicon:', r.stdout);
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/');
  console.log('homepage:', r.stdout);
  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/send-verification -H "Content-Type: application/json" -d '{"email":"nonexist@test.com"}'`);
  console.log('send-verification:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
