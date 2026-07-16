'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('Compose deploys immutable app and migration images with separate database principals', () => {
  const compose = read('docker-compose.yml')

  assert.doesNotMatch(compose, /image:\s*[^\n]*:latest(?:\s|$)/i)
  assert.match(compose, /MIGRATION_IMAGE_TAG:\?Set MIGRATION_IMAGE_TAG/)
  assert.match(compose, /IMAGE_TAG:\?Set IMAGE_TAG/)
  assert.match(compose, /MYSQL_MIGRATION_USER:\?Set MYSQL_MIGRATION_USER/)
  assert.match(compose, /Refusing to share one MySQL account between migrations and the application/)
  assert.match(compose, /condition:\s*service_completed_successfully/)
})

test('production Compose fails closed on Redis and checks database readiness plus revision', () => {
  const compose = read('docker-compose.yml')

  assert.match(compose, /REDIS_URL:\?REDIS_URL is required in production/)
  assert.match(compose, /RATE_LIMIT_ALLOW_MEMORY_FALLBACK:\s*"false"/)
  assert.match(compose, /\/api\/health/)
  assert.match(compose, /b\.status!=='ready'/)
  assert.match(compose, /b\.checks\?\.database!=='up'/)
  assert.match(compose, /b\.version!==process\.env\.APP_VERSION/)
  assert.match(compose, /await c\.ping\(\)!=='PONG'/)
})

test('runtime image contains the migration runner without build-time secret files', () => {
  const dockerfile = read('Dockerfile')
  const dockerignore = read('.dockerignore')

  assert.match(dockerfile, /COPY --from=builder \/app\/scripts\/mysql-migrate\.cjs/)
  assert.match(dockerfile, /COPY --from=builder \/app\/database\/migrations/)
  assert.match(dockerfile, /USER node/)
  assert.match(dockerfile, /apk add --no-cache[\s\S]*poppler-utils/)
  assert.match(dockerfile, /tesseract-ocr-data-eng/)
  assert.match(dockerfile, /tesseract-ocr-data-chi_sim/)
  assert.match(dockerfile, /PDFTOTEXT_PATH=\/usr\/bin\/pdftotext/)
  assert.match(dockerfile, /TESSERACT_PATH=\/usr\/bin\/tesseract/)
  assert.match(dockerignore, /\*\*\/\.env\*/)
  assert.match(dockerignore, /\*\*\/\.provider-config\*\.local\.json/)
  assert.match(dockerignore, /^_scripts\/$/m)
  assert.match(dockerignore, /^deploy\*\.js$/m)
})

test('package scripts expose plan, status, migrate, and migration tests', () => {
  const packageJson = JSON.parse(read('package.json'))

  assert.equal(packageJson.type, 'module')
  assert.equal(packageJson.scripts['db:plan'], 'node scripts/mysql-migrate.cjs plan')
  assert.match(packageJson.scripts['db:status'], /mysql-migrate\.cjs status$/)
  assert.match(packageJson.scripts['db:migrate'], /mysql-migrate\.cjs up$/)
  assert.match(packageJson.scripts.test, /tests\/\*\.test\.cjs/)
})

test('host bootstrap fails closed when firewalld cannot enforce the policy', () => {
  const bootstrap = read('deploy.sh')

  assert.match(bootstrap, /command -v firewall-cmd/)
  assert.match(bootstrap, /firewall-cmd --state/)
  assert.match(bootstrap, /firewalld is not installed/i)
  assert.match(bootstrap, /firewalld is installed but not running/i)
  assert.doesNotMatch(bootstrap, /firewall-cmd[^\n]*(?:2>\/dev\/null|\|\|\s*true)/)
  assert.match(bootstrap, /renewal-hooks\/deploy\/note-prompt/)
  assert.match(bootstrap, /certbot-renew\.timer/)
  assert.match(bootstrap, /note-prompt-certbot-renew\.timer/)
  assert.match(bootstrap, /systemctl enable --now/)
  assert.match(bootstrap, /Bootstrap is not an application release/)
})

test('ACME HTTP edge remains available without application dependencies', () => {
  const compose = read('docker-compose.yml')
  const acmeCompose = read('compose.acme.yml')
  const acmeNginx = read('nginx/acme.conf')

  assert.doesNotMatch(compose, /-\s*["']?80:80["']?/)
  assert.match(compose, /-\s*"443:443"/)
  assert.match(acmeCompose, /name:\s*note-prompt-acme/)
  assert.match(acmeCompose, /-\s*"80:8080"/)
  assert.match(acmeCompose, /CERTBOT_WEBROOT/)
  assert.match(acmeCompose, /read_only:\s*true/)
  assert.match(acmeCompose, /cap_drop:\s*\n\s*- ALL/)
  assert.doesNotMatch(acmeCompose, /depends_on:/)
  assert.doesNotMatch(acmeCompose, /:\?Set |:\?[A-Z_]+ is required/)

  assert.match(acmeNginx, /listen 8080/)
  assert.match(acmeNginx, /location \^~ \/\.well-known\/acme-challenge\//)
  assert.match(acmeNginx, /try_files \$uri =404/)
  assert.match(acmeNginx, /location = \/health/)
})

test('Certbot deploy hook validates and reloads only the application Nginx', () => {
  const hook = read('scripts/certbot-deploy-hook.sh')

  assert.match(hook, /RENEWED_LINEAGE/)
  assert.match(hook, /-checkend "\$\{MIN_VALIDITY_SECONDS\}"/)
  assert.match(hook, /subjectAltName/)
  assert.match(hook, /DNS:\$\{domain\}/)
  assert.match(hook, /openssl x509[^\n]*-pubkey/)
  assert.match(hook, /openssl pkey[^\n]*-pubout/)
  assert.match(hook, /flock -n 9/)
  assert.match(hook, /com\.docker\.compose\.project=/)
  assert.match(hook, /com\.docker\.compose\.service=nginx/)
  assert.match(hook, /docker exec "\$\{NGINX_CONTAINER\}" nginx -t/)
  assert.match(hook, /docker kill --signal=HUP/)
  assert.match(hook, /restore_previous_pair/)
  assert.doesNotMatch(hook, /docker compose/)
  assert.doesNotMatch(hook, /runtime\.env/)
})

test('deployment diagnosis is read-only and does not print runtime secrets', () => {
  const diagnose = read('scripts/deployment-diagnose.sh')
  const deployGuide = read('DEPLOY.md')

  assert.match(diagnose, /ss -lntp/)
  assert.match(diagnose, /docker ps -a/)
  assert.match(diagnose, /firewall-cmd --get-active-zones/)
  assert.match(diagnose, /openssl x509/)
  assert.match(diagnose, /date -u/)
  assert.match(diagnose, /systemctl list-timers/)
  assert.match(diagnose, /CERTBOT_LINEAGE/)
  assert.match(diagnose, /STALE COPY/)
  assert.match(diagnose, /STALE SERVED CERT/)
  assert.match(diagnose, /openssl s_client/)
  assert.match(diagnose, /--output \/dev\/null/)
  assert.doesNotMatch(diagnose, /docker\s+(?:compose\s+)?logs/)
  assert.doesNotMatch(diagnose, /docker\s+inspect[^\n]*\.Config\.Env/)
  assert.doesNotMatch(diagnose, /docker\s+exec[^\n]*\benv\b/)
  assert.doesNotMatch(diagnose, /\b(?:cat|source)\b[^\n]*runtime\.env/)

  assert.match(deployGuide, /scripts\/deployment-diagnose\.sh/)
  assert.match(deployGuide, /阿里云[^\n]*安全组/)
  assert.match(deployGuide, /80[^\n]*443[^\n]*(?:无监听|未监听)/)
  assert.match(deployGuide, /compose\.acme\.yml/)
  assert.match(deployGuide, /certbot reconfigure/)
  assert.match(deployGuide, /tls-certificate-incident\.md/)
})
