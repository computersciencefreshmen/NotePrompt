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

  // 1. Add missing verification_attempts column
  console.log('=== Adding verification_attempts column ===');
  let r = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "ALTER TABLE users ADD COLUMN verification_attempts INT DEFAULT 0 COMMENT '验证尝试次数';" 2>&1`);
  console.log(r.stdout || r.stderr || 'Column added');

  // Verify
  r = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "SHOW COLUMNS FROM users LIKE 'verification_attempts';" 2>/dev/null`);
  console.log('Verification:', r.stdout);

  // 2. Test send-verification again
  console.log('\n=== Test send-verification ===');
  r = await exec(conn, `curl -s -X POST http://localhost:3000/api/v1/auth/send-verification -H "Content-Type: application/json" -d '{"email":"test@test.com"}'`);
  console.log(r.stdout);

  // 3. Generate a simple favicon.ico (1x1 pixel ICO format) and put it in the app
  // Create a minimal valid favicon.ico (smallest valid ICO: 1x1 pixel, 32-bit)
  console.log('\n=== Creating favicon ===');
  // Use a simple SVG-based approach: create favicon in public dir and rebuild, OR add it directly to running container
  // For now, generate a minimal ICO file using python or node
  const icoHex = '00000100010010100000010020006804000016000000280000001000000020000000010020000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF000000000000000000000000000000000000000000000000000000001E917AFF1E917AFFFFFFFFFFFFFFFFFFFFFF1E917AFF1E917AFF000000000000000000000000000000000000000000000000000000001E917AFF1E917AFFFFFFFFFFFFFFFFFFFFFF1E917AFF1E917AFF0000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFFFFFFFFFFFFFFFFFFFFFF1E917AFF1E917AFF1E917AFF000000000000000000000000000000000000000000000000000000001E917AFF1E917AFFFFFFFFFFFFFFFFFFFFFF1E917AFF1E917AFF0000000000000000000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFF1E917AFF00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF000000000000000000000000000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFF1E917AFF00000000000000000000000000000000000000000000000000000000000000001E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF1E917AFF0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000FFFF0000FC3F0000F81F0000F81F0000F81F0000E00F0000F81F0000FFFF0000FFCF0000FF8F0000E00F0000C0070000FFFF0000FFFF0000FFFF0000FFFF0000';
  
  // Actually, let's just create a simple favicon from the Next.js app icon or skip it
  // Better approach: add a favicon.ico route or put it in public/
  // Let's create a proper one using node on the server
  
  r = await exec(conn, `cat > /tmp/gen_favicon.js << 'SCRIPT'
const fs = require('fs');
// Minimal 16x16 ICO file with teal color (#1E917A) matching the app theme
const width = 16, height = 16;
const bpp = 32;
const imageSize = width * height * 4; // BGRA
const headerSize = 6; // ICONDIR
const entrySize = 16; // ICONDIRENTRY
const bmpHeaderSize = 40; // BITMAPINFOHEADER
const totalSize = headerSize + entrySize + bmpHeaderSize + imageSize;

const buf = Buffer.alloc(totalSize, 0);
let offset = 0;

// ICONDIR
buf.writeUInt16LE(0, offset); offset += 2; // Reserved
buf.writeUInt16LE(1, offset); offset += 2; // Type (1 = ICO)
buf.writeUInt16LE(1, offset); offset += 2; // Count

// ICONDIRENTRY
buf.writeUInt8(width, offset); offset += 1;
buf.writeUInt8(height, offset); offset += 1;
buf.writeUInt8(0, offset); offset += 1; // Colors
buf.writeUInt8(0, offset); offset += 1; // Reserved
buf.writeUInt16LE(1, offset); offset += 2; // Color planes
buf.writeUInt16LE(bpp, offset); offset += 2; // BPP
buf.writeUInt32LE(bmpHeaderSize + imageSize, offset); offset += 4; // Size
buf.writeUInt32LE(headerSize + entrySize, offset); offset += 4; // Offset

// BITMAPINFOHEADER
buf.writeUInt32LE(bmpHeaderSize, offset); offset += 4;
buf.writeInt32LE(width, offset); offset += 4;
buf.writeInt32LE(height * 2, offset); offset += 4; // Double height for ICO
buf.writeUInt16LE(1, offset); offset += 2; // Planes
buf.writeUInt16LE(bpp, offset); offset += 2; // BPP
buf.writeUInt32LE(0, offset); offset += 4; // Compression
buf.writeUInt32LE(imageSize, offset); offset += 4;
buf.writeInt32LE(0, offset); offset += 4;
buf.writeInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;

// Pixel data (BGRA, bottom-to-top)
// Teal: #1E917A => R=0x1E G=0x91 B=0x7A => BGRA: 7A 91 1E FF
// Create a simple "NP" icon shape
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const fy = height - 1 - y; // flip for BMP bottom-up
    let r = 0x1E, g = 0x91, b = 0x7A, a = 0xFF;
    
    // Round corners
    const cx = x - 7.5, cy = fy - 7.5;
    const dist = Math.sqrt(cx*cx + cy*cy);
    if (dist > 8.5) { a = 0x00; r = g = b = 0; }
    else if (dist > 7.5) { a = 0x80; } // anti-alias edge
    
    buf.writeUInt8(b, offset); offset += 1;
    buf.writeUInt8(g, offset); offset += 1;
    buf.writeUInt8(r, offset); offset += 1;
    buf.writeUInt8(a, offset); offset += 1;
  }
}

fs.writeFileSync('/opt/note-prompt/public/favicon.ico', buf);
console.log('Favicon created:', buf.length, 'bytes');
SCRIPT
node /tmp/gen_favicon.js`);
  console.log(r.stdout || r.stderr);

  // Copy favicon into running container
  r = await exec(conn, 'docker cp /opt/note-prompt/public/favicon.ico note-prompt-app:/app/public/favicon.ico 2>&1');
  console.log('Copied to container:', r.stdout || r.stderr || 'OK');

  // 4. Test everything
  console.log('\n=== Final Tests ===');
  r = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://noteprompt.cn/favicon.ico');
  console.log('favicon.ico:', r.stdout);

  r = await exec(conn, `curl -sk -X POST https://noteprompt.cn/api/v1/auth/send-verification -H "Content-Type: application/json" -d '{"email":"nonexistent@test.com"}'`);
  console.log('send-verification (nonexistent):', r.stdout);

  // Test with a real email if any user exists
  r = await exec(conn, `docker exec docker_mysql8 mysql -uroot -pgw_yhy_1229 agent_report -e "SELECT id, username, email, email_verified FROM users LIMIT 5;" 2>/dev/null`);
  console.log('\nExisting users:', r.stdout);

  conn.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
