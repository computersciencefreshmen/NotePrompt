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
  createMigrationContext,
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
  assert.match(output, /010\s+pending/)
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
  assert.deepEqual(
    ['source_prompt_id', 'editor_mode', 'payload', 'schema_version', 'publication_state']
      .filter(column => requirements.tables.public_prompts.includes(column)),
    ['source_prompt_id', 'editor_mode', 'payload', 'schema_version', 'publication_state']
  )
  assert.equal(requirements.schemaVersion, 10)
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

test('publication identity migration is additive, byte-strict, and one-to-one', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'database/migrations/010_stabilize_prompt_publications.cjs'),
    'utf8'
  )

  for (const column of [
    'source_prompt_id',
    'publication_state',
    'editor_mode',
    'payload',
    'schema_version',
  ]) {
    assert.match(source, new RegExp(`ensureColumn\\(\\s*'public_prompts',\\s*'${column}'`))
  }
  assert.match(source, /uq_public_prompts_source[\s\S]*\['source_prompt_id'\][\s\S]*unique: true/)
  assert.match(source, /FOREIGN KEY \(source_prompt_id\) REFERENCES user_prompts\(id\) ON DELETE SET NULL/)
  assert.match(source, /ENUM\('published', 'withdrawn'\) NOT NULL DEFAULT 'published'/)
  assert.match(source, /ENUM\('normal', 'professional'\) NOT NULL DEFAULT 'normal'/)
  assert.match(source, /BINARY source\.title = BINARY publication\.title/)
  assert.match(source, /BINARY source\.content = BINARY publication\.content/)
  assert.match(source, /BINARY source\.description = BINARY publication\.description/)
  assert.match(source, /source\.category_id <=> publication\.category_id/)
  assert.match(source, /PARTITION BY candidate\.public_prompt_id/)
  assert.match(source, /PARTITION BY candidate\.source_prompt_id/)
  assert.match(source, /source_candidate_count = 1[\s\S]*publication_candidate_count = 1/)
  assert.match(source, /publication\.source_prompt_id IS NULL[\s\S]*claimed\.id IS NULL/)
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/)
})

test('publication identity migration fails closed on abnormal existing provenance', async () => {
  const migration = require('../database/migrations/010_stabilize_prompt_publications.cjs')
  const assertSafe = migration._test.assertExistingProvenanceIsSafe
  const contextFor = violation => ({
    query: async sql => [[{
      violation_count: violation === 'dangling' && sql.includes('LEFT JOIN user_prompts')
        ? 1
        : violation === 'ownership' && sql.includes('publication.author_id <> source.user_id')
          ? 1
          : violation === 'duplicate' && sql.includes('duplicate_sources')
            ? 1
            : 0,
    }]],
  })

  await assert.doesNotReject(assertSafe(contextFor(null)))
  await assert.rejects(
    assertSafe(contextFor('dangling')),
    /without a private source/
  )
  await assert.rejects(
    assertSafe(contextFor('ownership')),
    /ownership mismatch/
  )
  await assert.rejects(
    assertSafe(contextFor('duplicate')),
    /linked to multiple publications/
  )
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
    const migration010 = require('../database/migrations/010_stabilize_prompt_publications.cjs')
    const migrationContext = createMigrationContext(validationConnection)
    // Simulate a process interruption after additive columns committed but before
    // secondary indexes and the provenance foreign key were installed.
    await validationConnection.execute(
      'ALTER TABLE public_prompts DROP FOREIGN KEY fk_public_prompts_source'
    )
    await validationConnection.execute(
      'ALTER TABLE public_prompts DROP INDEX uq_public_prompts_source'
    )
    await validationConnection.execute(
      'ALTER TABLE public_prompts DROP INDEX idx_public_prompts_state_created'
    )

    const insertUser = async suffix => {
      const [result] = await validationConnection.execute(
        `INSERT INTO users
           (username, email, password_hash, email_verified, is_active)
         VALUES (?, ?, ?, 1, 1)`,
        [`migration010_${suffix}`, `migration010_${suffix}@example.test`, 'fixture-hash']
      )
      return Number(result.insertId)
    }
    const insertPrivatePrompt = async (userId, title, content, description = null) => {
      const [result] = await validationConnection.execute(
        `INSERT INTO user_prompts
           (title, content, description, user_id, category_id)
         VALUES (?, ?, ?, ?, NULL)`,
        [title, content, description, userId]
      )
      return Number(result.insertId)
    }
    const insertPublication = async (
      userId,
      title,
      content,
      description = null,
      sourcePromptId = null
    ) => {
      const [result] = await validationConnection.execute(
        `INSERT INTO public_prompts
           (source_prompt_id, title, content, description, author_id, category_id)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [sourcePromptId, title, content, description, userId]
      )
      return Number(result.insertId)
    }

    const firstUserId = await insertUser('first')
    const secondUserId = await insertUser('second')
    const exactSourceId = await insertPrivatePrompt(
      firstUserId,
      'Exact publication',
      'Exact byte content',
      'Exact description'
    )
    const exactPublicationId = await insertPublication(
      firstUserId,
      'Exact publication',
      'Exact byte content',
      'Exact description'
    )
    await insertPrivatePrompt(firstUserId, 'Byte Strict', 'same content')
    const caseDifferentPublicationId = await insertPublication(
      firstUserId,
      'byte strict',
      'same content'
    )
    await insertPrivatePrompt(firstUserId, 'Null differs', 'same content', null)
    const nullDifferentPublicationId = await insertPublication(
      firstUserId,
      'Null differs',
      'same content',
      ''
    )
    await insertPrivatePrompt(firstUserId, 'Two sources', 'ambiguous content')
    await insertPrivatePrompt(firstUserId, 'Two sources', 'ambiguous content')
    const twoSourcesPublicationId = await insertPublication(
      firstUserId,
      'Two sources',
      'ambiguous content'
    )
    await insertPrivatePrompt(firstUserId, 'Two publications', 'ambiguous content')
    const firstDuplicatePublicationId = await insertPublication(
      firstUserId,
      'Two publications',
      'ambiguous content'
    )
    const secondDuplicatePublicationId = await insertPublication(
      firstUserId,
      'Two publications',
      'ambiguous content'
    )
    await insertPrivatePrompt(firstUserId, 'Owner boundary', 'same content')
    const crossOwnerPublicationId = await insertPublication(
      secondUserId,
      'Owner boundary',
      'same content'
    )

    await migration010.up(migrationContext)
    await migration010.up(migrationContext)

    const fixturePublicationIds = [
      exactPublicationId,
      caseDifferentPublicationId,
      nullDifferentPublicationId,
      twoSourcesPublicationId,
      firstDuplicatePublicationId,
      secondDuplicatePublicationId,
      crossOwnerPublicationId,
    ]
    const [publicationRows] = await validationConnection.execute(
      `SELECT id, source_prompt_id, publication_state, editor_mode, payload, schema_version
         FROM public_prompts
        WHERE id IN (${fixturePublicationIds.map(() => '?').join(', ')})
        ORDER BY id`,
      fixturePublicationIds
    )
    const publicationsById = new Map(
      publicationRows.map(row => [Number(row.id), row])
    )
    assert.equal(Number(publicationsById.get(exactPublicationId).source_prompt_id), exactSourceId)
    for (const detachedId of fixturePublicationIds.filter(id => id !== exactPublicationId)) {
      assert.equal(publicationsById.get(detachedId).source_prompt_id, null)
    }
    assert.equal(publicationsById.get(exactPublicationId).publication_state, 'published')
    assert.equal(publicationsById.get(exactPublicationId).editor_mode, 'normal')
    assert.equal(publicationsById.get(exactPublicationId).payload, null)
    assert.equal(Number(publicationsById.get(exactPublicationId).schema_version), 1)

    const [foreignKeyRows] = await validationConnection.execute(
      `SELECT DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'public_prompts'
          AND CONSTRAINT_NAME = 'fk_public_prompts_source'`
    )
    assert.deepEqual(foreignKeyRows.map(row => row.DELETE_RULE), ['SET NULL'])

    await validationConnection.execute(
      'DELETE FROM user_prompts WHERE id = ?',
      [exactSourceId]
    )
    const [detachedRows] = await validationConnection.execute(
      'SELECT source_prompt_id FROM public_prompts WHERE id = ?',
      [exactPublicationId]
    )
    assert.equal(detachedRows.length, 1)
    assert.equal(detachedRows[0].source_prompt_id, null)

    const uniqueSourceId = await insertPrivatePrompt(
      firstUserId,
      'Unique source',
      'Unique content'
    )
    await insertPublication(
      firstUserId,
      'Unique source snapshot',
      'Unique content snapshot',
      null,
      uniqueSourceId
    )
    await assert.rejects(
      insertPublication(
        firstUserId,
        'Duplicate source snapshot',
        'Duplicate source content',
        null,
        uniqueSourceId
      ),
      error => error?.code === 'ER_DUP_ENTRY'
    )

    const invalidSourceId = await insertPrivatePrompt(
      firstUserId,
      'Invalid ownership',
      'Invalid ownership content'
    )
    const invalidPublicationId = await insertPublication(
      secondUserId,
      'Detached title',
      'Detached content',
      null,
      invalidSourceId
    )
    await assert.rejects(
      migration010.up(migrationContext),
      /ownership mismatch/
    )
    await validationConnection.execute(
      'DELETE FROM public_prompts WHERE id = ?',
      [invalidPublicationId]
    )
  } finally {
    await validationConnection.end()
  }
})
