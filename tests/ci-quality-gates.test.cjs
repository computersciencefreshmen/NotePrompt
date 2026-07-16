'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
const workflow = read('.github/workflows/release-quality.yml')

test('release workflow pins every external action and uses least privilege', () => {
  const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map(match => match[1])

  assert.ok(actionReferences.length >= 10)
  for (const actionReference of actionReferences) {
    assert.match(actionReference, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[a-f0-9]{40}$/i)
  }
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.doesNotMatch(workflow, /persist-credentials:\s*true/)
  assert.doesNotMatch(workflow, /continue-on-error/)
  assert.match(workflow, /node-version:\s*\$\{\{ env\.NODE_VERSION \}\}/)
  assert.match(workflow, /NODE_VERSION:\s*"24"/)
})

test('Node quality work is sequential and rejects runtime configuration', () => {
  const qualityJob = workflow.slice(
    workflow.indexOf('  quality:'),
    workflow.indexOf('  mysql-migrations:'),
  )
  const lint = workflow.indexOf('run: npm run lint')
  const tests = workflow.indexOf('run: npm test')
  const build = workflow.indexOf('run: npm run build')

  assert.ok(lint > 0)
  assert.ok(tests > lint)
  assert.ok(build > tests)
  assert.match(workflow, /find \.next\/standalone/)
  assert.match(workflow, /-name '\.env\*'/)
  assert.match(workflow, /-name '\.provider-config\*\.local\.json'/)
  assert.match(workflow, /run: npm run db:plan/)
  assert.doesNotMatch(qualityJob, /JWT_SECRET/)
})

test('Compose validation proves every runtime cryptographic secret is required', () => {
  const loopStart = workflow.indexOf('for required_secret in')
  const requiredSecretLoop = workflow.slice(loopStart, workflow.indexOf('\n          do', loopStart))

  assert.ok(loopStart > 0)
  assert.match(workflow, /env -u "\$\{required_secret\}" docker compose/)

  for (const requiredSecret of [
    'JWT_SECRET',
    'PROVIDER_KEY_ENCRYPTION_SECRET',
    'VERIFICATION_CODE_SECRET',
  ]) {
    assert.match(requiredSecretLoop, new RegExp(`\\b${requiredSecret}\\b`))
  }
})

test('real MySQL migrations start empty, replay, and use a pinned LTS image', () => {
  assert.match(
    workflow,
    /image: mysql:8\.4\.10@sha256:[a-f0-9]{64}/,
  )
  assert.match(workflow, /MYSQL_DATABASE: note_prompt_migration_smoke/)
  assert.match(workflow, /MYSQL_MIGRATION_TEST_DATABASE: note_prompt_migration_smoke/)
  assert.match(workflow, /MYSQL_USER: note_prompt_migrator/)
  assert.match(workflow, /run: npm run test:migrations/)
  assert.doesNotMatch(workflow, /run: npm run db:migrate/)
})

test('security gates scan full history, source, dependencies, and final image', () => {
  assert.match(workflow, /ghcr\.io\/gitleaks\/gitleaks@sha256:[a-f0-9]{64}/)
  assert.match(workflow, /git \. --log-opts="--all HEAD" --redact/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.doesNotMatch(workflow, /baseline|gitleaksignore/i)

  const trivyPin = 'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25'
  assert.equal(workflow.split(trivyPin).length - 1, 2)
  assert.equal((workflow.match(/severity: CRITICAL,HIGH/g) || []).length, 2)
  assert.equal((workflow.match(/ignore-unfixed: false/g) || []).length, 2)
  assert.match(workflow, /run: npm audit --omit=dev --audit-level=high/)
  assert.match(workflow, /scan-type: fs/)
  assert.match(workflow, /scan-type: image/)
  assert.match(workflow, /vuln-type: os,library/)
  assert.match(workflow, /TRIVY_EXIT_ON_EOL: "1"/)
})

test('container build proves commit identity and the aggregate gate is fail-closed', () => {
  assert.match(workflow, /load: true/)
  assert.match(workflow, /APP_VERSION=\$\{\{ github\.sha \}\}/)
  assert.match(workflow, /org\.opencontainers\.image\.revision/)
  assert.match(workflow, /revision[^\n]*GITHUB_SHA|GITHUB_SHA[^\n]*revision/)

  for (const dependency of [
    'quality',
    'mysql-migrations',
    'dependency-security',
    'compose-config',
    'gitleaks-history',
    'trivy-filesystem',
    'container-security',
  ]) {
    assert.match(workflow, new RegExp(`      - ${dependency.replace('-', '\\-')}`))
  }
  assert.match(workflow, /release-gate:\n[\s\S]*?if: \$\{\{ always\(\) \}\}/)
  assert.match(workflow, /if \[\[ "\$\{result\}" != success \]\]/)
})

test('Dependabot tracks Action, npm, and Docker supply-chain updates', () => {
  const dependabot = read('.github/dependabot.yml')

  for (const ecosystem of ['github-actions', 'npm', 'docker']) {
    assert.match(dependabot, new RegExp(`package-ecosystem: ${ecosystem}`))
  }
  assert.match(dependabot, /timezone: Asia\/Shanghai/)
})
