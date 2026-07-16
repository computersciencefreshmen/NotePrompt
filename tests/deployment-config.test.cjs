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
  assert.match(bootstrap, /Bootstrap is not an application release/)
})

test('deployment diagnosis is read-only and does not print runtime secrets', () => {
  const diagnose = read('scripts/deployment-diagnose.sh')
  const deployGuide = read('DEPLOY.md')

  assert.match(diagnose, /ss -lntp/)
  assert.match(diagnose, /docker ps -a/)
  assert.match(diagnose, /firewall-cmd --get-active-zones/)
  assert.match(diagnose, /openssl x509/)
  assert.match(diagnose, /--output \/dev\/null/)
  assert.doesNotMatch(diagnose, /docker\s+(?:compose\s+)?logs/)
  assert.doesNotMatch(diagnose, /docker\s+inspect[^\n]*\.Config\.Env/)
  assert.doesNotMatch(diagnose, /docker\s+exec[^\n]*\benv\b/)
  assert.doesNotMatch(diagnose, /\b(?:cat|source)\b[^\n]*runtime\.env/)

  assert.match(deployGuide, /scripts\/deployment-diagnose\.sh/)
  assert.match(deployGuide, /阿里云[^\n]*安全组/)
  assert.match(deployGuide, /80[^\n]*443[^\n]*(?:无监听|未监听)/)
})
