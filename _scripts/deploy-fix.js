const { Client } = require('ssh2');

const SERVER = {
  host: '8.138.176.174',
  port: 22,
  username: 'root',
  password: '20040618Aa',
  readyTimeout: 15000,
};

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout: ${label || cmd.substring(0, 60)}`));
    }, 600000); // 10 min timeout for build
    
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timeout); return reject(err); }
      let stdout = '', stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
      });
    });
  });
}

async function run(conn, cmd, label) {
  console.log(`\n[STEP] ${label}`);
  const r = await exec(conn, cmd, label);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('Warning:') && !r.stderr.includes('warning')) console.log('STDERR:', r.stderr);
  if (r.code !== 0 && r.code !== null) console.log(`Exit code: ${r.code}`);
  return r;
}

async function main() {
  const conn = new Client();
  
  try {
    await new Promise((resolve, reject) => {
      conn.on('ready', resolve);
      conn.on('error', reject);
      conn.connect(SERVER);
    });
    console.log('=== SSH connected, fixing deployment issues ===\n');

    // ============== FIX 1: Docker registry mirror ==============
    await run(conn,
      `mkdir -p /etc/docker && cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.m.daocloud.io",
    "https://dockerhub.azk8s.cn"
  ]
}
EOF
systemctl daemon-reload && systemctl restart docker && echo "Docker mirror configured and restarted"`,
      'FIX 1: Configure Docker registry mirrors (China)');

    // Wait for Docker to restart
    await run(conn, 'sleep 5 && docker info 2>/dev/null | grep -A3 "Registry Mirrors"', 'Verify Docker mirrors');

    // Make sure MySQL container is still running after Docker restart
    await run(conn,
      'docker start docker_mysql8 2>/dev/null; sleep 3; docker ps --format "{{.Names}} {{.Status}}" | grep mysql',
      'Ensure MySQL container is running');

    // ============== FIX 2: Database migration ==============
    // Try adding each column separately, ignore errors if already exists
    const columns = [
      { name: 'email_verified', def: "TINYINT(1) DEFAULT 0 COMMENT 'email verified'" },
      { name: 'verification_code', def: "VARCHAR(10) DEFAULT NULL COMMENT 'verification code'" },
      { name: 'verification_expires', def: "TIMESTAMP NULL DEFAULT NULL COMMENT 'code expires'" },
      { name: 'email_verify_sent_at', def: "TIMESTAMP NULL DEFAULT NULL COMMENT 'last sent time'" },
    ];

    for (const col of columns) {
      const checkR = await exec(conn,
        `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='agent_report' AND TABLE_NAME='users' AND COLUMN_NAME='${col.name}';" 2>&1`
      );
      const exists = checkR.stdout.trim().includes('1');
      
      if (!exists) {
        const addR = await run(conn,
          `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "ALTER TABLE users ADD COLUMN ${col.name} ${col.def};" 2>&1`,
          `FIX 2: Add column ${col.name}`);
      } else {
        console.log(`[SKIP] Column ${col.name} already exists`);
      }
    }

    // Mark existing users as verified
    await run(conn,
      `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 agent_report -e "UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0;" 2>&1`,
      'FIX 2: Mark existing users as email verified');

    // Verify columns
    await run(conn,
      `docker exec docker_mysql8 mysql -u root -pgw_yhy_1229 -e "DESCRIBE agent_report.users;" 2>&1`,
      'FIX 2: Verify users table schema');

    // ============== FIX 3: Rebuild Docker image with mirrors ==============
    console.log('\n[STEP] FIX 3: Rebuilding Docker image (2-5 mins)...');
    const buildResult = await exec(conn,
      'cd /opt/note-prompt && docker build --no-cache -t note-prompt:latest . 2>&1',
      'Docker build');
    
    // Show last 20 lines of build output
    const lines = buildResult.stdout.split('\n');
    const tailLines = lines.slice(Math.max(0, lines.length - 20));
    console.log(tailLines.join('\n'));
    if (buildResult.stderr) console.log('STDERR:', buildResult.stderr);

    if (buildResult.code !== 0) {
      console.error('\n❌ Docker build failed! Showing last 40 lines:');
      console.log(lines.slice(Math.max(0, lines.length - 40)).join('\n'));
      conn.end();
      process.exit(1);
    }
    console.log('✅ Docker image built successfully');

    // ============== FIX 4: Restart all containers ==============
    await run(conn,
      'cd /opt/note-prompt && docker compose down 2>&1 && docker compose up -d 2>&1',
      'FIX 4: Restart all containers with new image');

    await run(conn, 'sleep 8', 'Wait for startup...');

    await run(conn,
      'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
      'Container status');

    // Test connectivity
    await run(conn,
      'curl -s http://localhost:80/api/health 2>/dev/null || echo "Health check failed"',
      'Test health endpoint');

    // Check app logs for any errors
    await run(conn,
      'docker logs note-prompt-app 2>&1 | tail -20',
      'App container logs');

    conn.end();
    console.log('\n=== Fixes applied ===');
    console.log('Remaining: User needs to create Alibaba Cloud Security Group with ports 80/443 open');
  } catch (e) {
    console.error('\n!!! ERROR:', e.message);
    conn.end();
    process.exit(1);
  }
}

main();
