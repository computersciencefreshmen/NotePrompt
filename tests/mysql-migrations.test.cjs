'use strict'

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const requirements = require('../database/schema-requirements.json')
const {
  applyMigrations,
  inspectStatus,
  loadMigrations,
  validateAppliedMigrations,
} = require('../scripts/lib/mysql-migration-runner.cjs')

test('migration discovery is ordered, complete, and version-unique', () => {
  const migrations = loadMigrations()
  assert.deepEqual(migrations.map(migration => migration.version), requirements.requiredMigrations)
  assert.equal(new Set(migrations.map(migration => migration.version)).size, migrations.length)
  for (const migration of migrations) {
    assert.match(migration.checksum, /^[a-f0-9]{64}$/)
    assert.ok(migration.description.length > 10)
  }
})

test('offline plan does not require database configuration', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(projectRoot, 'scripts', 'mysql-migrate.cjs'), 'plan'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '' },
    }
  )
  assert.match(output, /001\s+pending/)
  assert.match(output, /006\s+pending/)
  assert.match(output, /007\s+pending/)
  assert.match(output, /008\s+pending/)
  assert.match(output, /009\s+pending/)
  assert.match(output, /no database connection was opened/i)
})

test('applied migration checksums and history gaps fail closed', () => {
  const migrations = loadMigrations()
  const first = migrations[0]
  assert.throws(
    () => validateAppliedMigrations(migrations, new Map([[
      first.version,
      { name: first.name, checksum: '0'.repeat(64) },
    ]])),
    /checksum differs/
  )

  const second = migrations[1]
  assert.throws(
    () => validateAppliedMigrations(migrations, new Map([[
      second.version,
      { name: second.name, checksum: second.checksum },
    ]])),
    /history has a gap/
  )
})

test('canonical requirements cover the known schema gaps and exclude plaintext API keys', () => {
  assert.ok(requirements.tables.users.includes('session_version'))
  assert.ok(requirements.tables.users.includes('admin_disabled_at'))
  assert.deepEqual(
    ['editor_mode', 'payload', 'schema_version'].filter(column => requirements.tables.user_prompts.includes(column)),
    ['editor_mode', 'payload', 'schema_version']
  )
  for (const tableName of [
    'user_preferences',
    'user_prompt_folders',
    'prompt_versions',
    'api_keys',
    'user_provider_configs',
    'user_usage_stats',
    'ai_usage_daily',
    'public_folder_prompts',
    'curated_catalog_entries',
    'curated_prompt_favorites',
    'curated_prompt_legacy_rows',
  ]) {
    assert.ok(requirements.tables[tableName], `missing ${tableName} contract`)
  }
  assert.ok(requirements.tables.api_keys.includes('api_key_hash'))
  assert.ok(requirements.tables.api_keys.includes('key_prefix'))
  assert.ok(!requirements.tables.api_keys.includes('api_key'))
})

test('legacy API key conversion verifies hashes before removing plaintext storage', async () => {
  const migration = require('../database/migrations/002_reconcile_identity_and_credentials.cjs')
  const events = []
  const fakeContext = {
    ensureColumn: async () => false,
    ensureIndex: async () => false,
    ensureTable: async () => false,
    modifyColumn: async (table, column) => events.push(`modify:${table}.${column}`),
    columnExists: async (table, column) => table === 'api_keys' && column === 'api_key',
    exec: async sql => events.push(sql.includes('SHA2(api_key, 256)') ? 'hash-legacy-key' : 'exec'),
    query: async sql => {
      events.push(sql.includes('cannot') ? 'query' : 'verify-hashes')
      return [[{ count: 0 }], []]
    },
    dropColumn: async (table, column) => events.push(`drop:${table}.${column}`),
  }

  await migration.up(fakeContext)
  const hashIndex = events.indexOf('hash-legacy-key')
  const verifyIndex = events.indexOf('verify-hashes')
  const dropIndex = events.indexOf('drop:api_keys.api_key')
  assert.ok(hashIndex >= 0)
  assert.ok(verifyIndex > hashIndex)
  assert.ok(dropIndex > verifyIndex)
})

test('user tier migration converts premium before narrowing the enum', async () => {
  const migration = require('../database/migrations/005_normalize_user_types.cjs')
  const events = []
  await migration.up({
    modifyColumn: async (_table, _column, definition) => events.push(definition),
    exec: async sql => events.push(sql),
  })
  assert.match(events[0], /premium.*pro/)
  assert.match(events[1], /premium/)
  assert.doesNotMatch(events[2], /premium/)
  assert.match(events[2], /'free', 'pro', 'admin'/)
})

test('migration sources contain no database bootstrap or default privileged account', () => {
  for (const migration of loadMigrations()) {
    const source = fs.readFileSync(migration.filePath, 'utf8')
    assert.doesNotMatch(source, /CREATE\s+DATABASE/i)
    assert.doesNotMatch(source, /^\s*USE\s+/im)
    assert.doesNotMatch(source, /admin123|admin@notePrompt/i)
  }
})

test('application database modules contain no request-time schema mutation', () => {
  for (const relativePath of [
    'src/lib/mysql-database.ts',
    'src/lib/user-provider-config.ts',
    'src/lib/auth.ts',
  ]) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
    assert.doesNotMatch(source, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+(?:TABLE|COLUMN)/i)
    assert.doesNotMatch(source, /ensureAIUsageDailyTable|ensureUserUsageStatsTable|ensureUserProviderConfigTable/)
  }
})

const smokeDatabase = process.env.MYSQL_MIGRATION_TEST_DATABASE
test('empty MySQL schema applies twice and satisfies the runtime contract', {
  skip: smokeDatabase ? false : 'MYSQL_MIGRATION_TEST_DATABASE is not configured',
  timeout: 60_000,
}, async () => {
  assert.match(smokeDatabase, /(test|smoke)/i, 'test database name must contain "test" or "smoke"')

  const mysql = require('mysql2/promise')
  const smokeEnv = {
    ...process.env,
    MYSQL_DATABASE: smokeDatabase,
  }
  const connection = await mysql.createConnection({
    host: smokeEnv.MYSQL_HOST,
    port: Number(smokeEnv.MYSQL_PORT || 3306),
    user: smokeEnv.MYSQL_USER,
    password: smokeEnv.MYSQL_PASSWORD || '',
    database: smokeDatabase,
    multipleStatements: false,
  })

  try {
    const [existingTables] = await connection.execute(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()`
    )
    assert.deepEqual(existingTables, [], 'smoke database must be empty; refusing to alter it')
  } finally {
    await connection.end()
  }

  const firstRun = await applyMigrations({ env: smokeEnv })
  assert.deepEqual(firstRun.completed, requirements.requiredMigrations)
  const secondRun = await applyMigrations({ env: smokeEnv })
  assert.deepEqual(secondRun.completed, [])

  const status = await inspectStatus({ env: smokeEnv })
  assert.ok(status.every(migration => migration.status === 'applied'))

  const validationConnection = await mysql.createConnection({
    host: smokeEnv.MYSQL_HOST,
    port: Number(smokeEnv.MYSQL_PORT || 3306),
    user: smokeEnv.MYSQL_USER,
    password: smokeEnv.MYSQL_PASSWORD || '',
    database: smokeDatabase,
  })
  try {
    const [columns] = await validationConnection.execute(
      `SELECT TABLE_NAME, COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()`
    )
    const actual = new Set(columns.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`))
    for (const [tableName, columnNames] of Object.entries(requirements.tables)) {
      for (const columnName of columnNames) {
        assert.ok(actual.has(`${tableName}.${columnName}`), `missing ${tableName}.${columnName}`)
      }
    }
  } finally {
    await validationConnection.end()
  }
})
