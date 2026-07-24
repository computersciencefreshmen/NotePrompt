'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const migrationPath = path.join(
  projectRoot,
  'database/migrations/011_attest_public_folder_snapshot_origins.cjs'
)
const migration = require(migrationPath)
const requirements = require('../database/schema-requirements.json')
const { loadMigrations } = require('../scripts/lib/mysql-migration-runner.cjs')

const validColumnRows = () => [
  {
    COLUMN_NAME: 'snapshot_origin',
    DATA_TYPE: 'enum',
    COLUMN_TYPE: "enum('legacy_unverified','folder_publication','moderated_publication')",
    IS_NULLABLE: 'NO',
    COLUMN_DEFAULT: 'legacy_unverified',
    EXTRA: '',
  },
  {
    COLUMN_NAME: 'source_public_prompt_id',
    DATA_TYPE: 'int',
    COLUMN_TYPE: 'int',
    IS_NULLABLE: 'YES',
    COLUMN_DEFAULT: null,
    EXTRA: '',
  },
]

function statisticsRows(definitions) {
  return [...definitions.entries()].flatMap(([name, definition]) => (
    definition.columns.map((column, index) => ({
      INDEX_NAME: name,
      NON_UNIQUE: definition.unique ? 0 : 1,
      INDEX_TYPE: definition.type || 'BTREE',
      SEQ_IN_INDEX: index + 1,
      IS_VISIBLE: definition.visible || 'YES',
      COLUMN_NAME: column,
    }))
  ))
}

function createReplayContext() {
  const state = {
    columns: new Map(),
    indexes: new Map(),
    hasForeignKey: false,
    executedSql: [],
  }

  return {
    state,
    context: {
      async ensureColumn(tableName, columnName, definition) {
        assert.equal(tableName, 'public_folder_prompts')
        if (state.columns.has(columnName)) return false
        state.columns.set(columnName, definition)
        return true
      },

      async query(sql) {
        if (sql.includes('information_schema.COLUMNS')) {
          return [validColumnRows(), []]
        }
        if (sql.includes('information_schema.STATISTICS')) {
          return [statisticsRows(state.indexes), []]
        }
        if (sql.includes("snapshot_origin <> 'legacy_unverified'")) {
          return [[{ violation_count: 0 }], []]
        }
        if (
          sql.includes('information_schema.KEY_COLUMN_USAGE key_usage')
          && sql.includes("key_usage.COLUMN_NAME = 'source_public_prompt_id'")
        ) {
          return [state.hasForeignKey ? [{
            CONSTRAINT_NAME: 'fk_public_folder_prompts_publication',
            REFERENCED_TABLE_NAME: 'public_prompts',
            REFERENCED_COLUMN_NAME: 'id',
            DELETE_RULE: 'SET NULL',
            UPDATE_RULE: 'NO ACTION',
            constraint_column_count: 1,
          }] : [], []]
        }
        if (
          sql.includes('information_schema.REFERENTIAL_CONSTRAINTS')
          && sql.includes("CONSTRAINT_NAME = 'fk_public_folder_prompts_publication'")
        ) {
          return [[{ violation_count: 0 }], []]
        }
        throw new Error(`Unexpected migration query: ${sql}`)
      },

      async exec(sql) {
        assert.doesNotMatch(
          sql,
          /^\s*(?:UPDATE|INSERT|DELETE|REPLACE)\b/i,
          'Migration 011 must not infer or rewrite legacy snapshot provenance'
        )
        state.executedSql.push(sql)

        const indexMatch = sql.match(
          /ADD\s+(UNIQUE\s+)?INDEX\s+`([^`]+)`\s+\(([^)]+)\)/i
        )
        if (indexMatch) {
          state.indexes.set(indexMatch[2], {
            unique: Boolean(indexMatch[1]),
            columns: [...indexMatch[3].matchAll(/`([^`]+)`/g)].map(match => match[1]),
          })
        }
        if (sql.includes('ADD CONSTRAINT fk_public_folder_prompts_publication')) {
          state.hasForeignKey = true
        }
      },
    },
  }
}

test('migration 011 is discovered and extends the canonical snapshot contract', () => {
  const discovered = loadMigrations()
  const migration011 = discovered.find(candidate => candidate.version === '011')

  assert.ok(migration011)
  assert.equal(migration011.name, 'attest_public_folder_snapshot_origins')
  assert.equal(requirements.schemaVersion, 11)
  assert.equal(requirements.requiredMigrations.at(-1), '011')
  assert.deepEqual(
    ['source_public_prompt_id', 'snapshot_origin'].filter(column => (
      requirements.tables.public_folder_prompts.includes(column)
    )),
    ['source_public_prompt_id', 'snapshot_origin']
  )
})

test('migration 011 is additive and never guesses legacy snapshot provenance', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(
    source,
    /ensureColumn\(\s*'public_folder_prompts',\s*'snapshot_origin',\s*"ENUM\('legacy_unverified', 'folder_publication', 'moderated_publication'\) NOT NULL DEFAULT 'legacy_unverified'"/
  )
  assert.match(
    source,
    /ensureColumn\(\s*'public_folder_prompts',\s*'source_public_prompt_id',\s*'INT NULL'/
  )
  assert.doesNotMatch(source, /^\s*UPDATE\s+/im)
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|REPLACE)\s+INTO\s+public_folder_prompts\b/i
  )
  assert.doesNotMatch(source, /\bSET\s+(?:snapshot\.)?snapshot_origin\s*=/i)
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/)
})

test('migration 011 declares exact lookup, folder-publication identity, and detach semantics', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(
    source,
    /idx_public_folder_prompts_publication[\s\S]*\['source_public_prompt_id'\]/
  )
  assert.match(
    source,
    /uq_public_folder_prompt_publication[\s\S]*\['public_folder_id', 'source_public_prompt_id'\][\s\S]*unique: true/
  )
  assert.match(
    source,
    /FOREIGN KEY \(source_public_prompt_id\) REFERENCES public_prompts\(id\) ON DELETE SET NULL ON UPDATE NO ACTION/
  )
})

test('snapshot origin column validation accepts only the exact two definitions', async () => {
  const validate = migration._test.assertSnapshotOriginColumns
  const contextFor = rows => ({
    query: async () => [rows, []],
  })

  await assert.doesNotReject(validate(contextFor(validColumnRows())))

  const invalidCases = [
    ['missing snapshot_origin', rows => rows.filter(row => row.COLUMN_NAME !== 'snapshot_origin')],
    ['origin enum', rows => {
      rows[0].COLUMN_TYPE = "enum('legacy_unverified','folder_publication')"
      return rows
    }],
    ['origin nullability', rows => {
      rows[0].IS_NULLABLE = 'YES'
      return rows
    }],
    ['origin default', rows => {
      rows[0].COLUMN_DEFAULT = 'folder_publication'
      return rows
    }],
    ['origin generated expression', rows => {
      rows[0].EXTRA = 'DEFAULT_GENERATED'
      return rows
    }],
    ['missing source_public_prompt_id', rows => (
      rows.filter(row => row.COLUMN_NAME !== 'source_public_prompt_id')
    )],
    ['source type', rows => {
      rows[1].COLUMN_TYPE = 'bigint'
      return rows
    }],
    ['source nullability', rows => {
      rows[1].IS_NULLABLE = 'NO'
      return rows
    }],
    ['source default', rows => {
      rows[1].COLUMN_DEFAULT = '0'
      return rows
    }],
  ]

  for (const [label, mutate] of invalidCases) {
    const rows = structuredClone(validColumnRows())
    await assert.rejects(
      validate(contextFor(mutate(rows))),
      /incompatible public_folder_prompts column definition/,
      label
    )
  }
})

test('pending migration accepts only entirely unclaimed legacy snapshot origins', async () => {
  const validate = migration._test.assertPendingSnapshotOriginsAreUnclaimed
  const capturedSql = []
  const contextFor = violationCount => ({
    query: async sql => {
      capturedSql.push(sql)
      return [[{ violation_count: violationCount }], []]
    },
  })

  await assert.doesNotReject(validate(contextFor(0)))
  assert.match(capturedSql[0], /snapshot_origin <> 'legacy_unverified'/)
  assert.match(capturedSql[0], /OR source_public_prompt_id IS NOT NULL/)

  for (const label of ['non-legacy origin', 'pre-filled public source']) {
    await assert.rejects(
      validate(contextFor(1)),
      /non-default snapshot_origin.*non-null source_public_prompt_id/,
      label
    )
  }
  await assert.rejects(validate(contextFor('not-a-count')), /could not verify/)
})

test('exact index helper rejects incompatible named and source-only unique indexes', async () => {
  const ensureExactIndex = migration._test.ensureExactIndex
  const contextFor = definitions => {
    const executed = []
    return {
      executed,
      query: async () => [statisticsRows(definitions), []],
      exec: async sql => executed.push(sql),
    }
  }

  const exactLookup = createReplayContext().state.indexes
  exactLookup.set('idx_public_folder_prompts_publication', {
    columns: ['source_public_prompt_id'],
    unique: false,
  })
  const exactContext = contextFor(exactLookup)
  assert.equal(await ensureExactIndex(
    exactContext,
    'public_folder_prompts',
    'idx_public_folder_prompts_publication',
    ['source_public_prompt_id']
  ), false)
  assert.deepEqual(exactContext.executed, [])

  const wrongNamed = new Map([[
    'idx_public_folder_prompts_publication',
    { columns: ['public_folder_id'], unique: false },
  ]])
  await assert.rejects(
    ensureExactIndex(
      contextFor(wrongNamed),
      'public_folder_prompts',
      'idx_public_folder_prompts_publication',
      ['source_public_prompt_id']
    ),
    /incompatible index named/
  )

  const overConstrained = new Map([[
    'unexpected_unique_source',
    { columns: ['source_public_prompt_id'], unique: true },
  ]])
  await assert.rejects(
    ensureExactIndex(
      contextFor(overConstrained),
      'public_folder_prompts',
      'idx_public_folder_prompts_publication',
      ['source_public_prompt_id']
    ),
    /incompatible unique index/
  )

  const conflictingCardinality = new Map([
    [
      'idx_public_folder_prompts_publication',
      { columns: ['source_public_prompt_id'], unique: false },
    ],
    [
      'unexpected_unique_source',
      { columns: ['source_public_prompt_id'], unique: true },
    ],
  ])
  await assert.rejects(
    ensureExactIndex(
      contextFor(conflictingCardinality),
      'public_folder_prompts',
      'idx_public_folder_prompts_publication',
      ['source_public_prompt_id']
    ),
    /incompatible unique index/
  )

  for (const [label, name, unique, error] of [
    [
      'named invisible index', 'idx_public_folder_prompts_publication', false, /incompatible index named/,
    ],
    [
      'equivalent invisible index', 'another_publication_lookup', false, /incompatible invisible index/,
    ],
    [
      'invisible source-only unique index', 'unexpected_unique_source', true, /incompatible unique index/,
    ],
  ]) {
    const invisible = new Map([[
      name,
      {
        columns: ['source_public_prompt_id'],
        unique,
        visible: 'NO',
      },
    ]])
    await assert.rejects(
      ensureExactIndex(
        contextFor(invisible),
        'public_folder_prompts',
        'idx_public_folder_prompts_publication',
        ['source_public_prompt_id']
      ),
      error,
      label
    )
  }

  assert.throws(
    () => migration._test.indexDefinitions([
      { INDEX_NAME: 'mixed_metadata', NON_UNIQUE: 1, INDEX_TYPE: 'BTREE', IS_VISIBLE: 'YES', COLUMN_NAME: 'public_folder_id' },
      { INDEX_NAME: 'mixed_metadata', NON_UNIQUE: 1, INDEX_TYPE: 'BTREE', IS_VISIBLE: 'NO', COLUMN_NAME: 'source_public_prompt_id' },
    ]),
    /inconsistent metadata/
  )
})

test('publication foreign key helper creates the exact relation and rejects abnormal metadata', async () => {
  const ensureForeignKey = migration._test.ensureSourcePublicationForeignKey
  const contextFor = ({ foreignKeys = [], nameCollision = 0 } = {}) => {
    const executed = []
    return {
      executed,
      query: async sql => (
        sql.includes('KEY_COLUMN_USAGE key_usage')
          ? [foreignKeys, []]
          : [[{ violation_count: nameCollision }], []]
      ),
      exec: async sql => executed.push(sql),
    }
  }
  const exact = {
    CONSTRAINT_NAME: 'fk_public_folder_prompts_publication',
    REFERENCED_TABLE_NAME: 'public_prompts',
    REFERENCED_COLUMN_NAME: 'id',
    DELETE_RULE: 'SET NULL',
    UPDATE_RULE: 'NO ACTION',
    constraint_column_count: 1,
  }

  const existing = contextFor({ foreignKeys: [exact] })
  assert.equal(await ensureForeignKey(existing), false)
  assert.deepEqual(existing.executed, [])

  const missing = contextFor()
  assert.equal(await ensureForeignKey(missing), true)
  assert.equal(missing.executed.length, 1)
  assert.match(
    missing.executed[0],
    /FOREIGN KEY \(source_public_prompt_id\) REFERENCES public_prompts\(id\) ON DELETE SET NULL ON UPDATE NO ACTION/
  )

  for (const [label, patch] of [
    ['wrong target', { REFERENCED_TABLE_NAME: 'user_prompts' }],
    ['wrong target column', { REFERENCED_COLUMN_NAME: 'source_prompt_id' }],
    ['wrong delete rule', { DELETE_RULE: 'CASCADE' }],
    ['wrong update rule', { UPDATE_RULE: 'CASCADE' }],
    ['restrict update rule', { UPDATE_RULE: 'RESTRICT' }],
    ['composite relation', { constraint_column_count: 2 }],
  ]) {
    await assert.rejects(
      ensureForeignKey(contextFor({ foreignKeys: [{ ...exact, ...patch }] })),
      /incompatible foreign key/,
      label
    )
  }
  await assert.rejects(
    ensureForeignKey(contextFor({ nameCollision: 1 })),
    /assigned to another foreign key/
  )
})

test('migration 011 expands an empty origin state and replays without row rewrites or duplicate DDL', async () => {
  const { context, state } = createReplayContext()

  await migration.up(context)
  assert.equal(
    state.columns.get('snapshot_origin'),
    "ENUM('legacy_unverified', 'folder_publication', 'moderated_publication') NOT NULL DEFAULT 'legacy_unverified'"
  )
  assert.equal(state.columns.get('source_public_prompt_id'), 'INT NULL')
  assert.deepEqual(
    state.indexes.get('idx_public_folder_prompts_publication'),
    { unique: false, columns: ['source_public_prompt_id'] }
  )
  assert.deepEqual(
    state.indexes.get('uq_public_folder_prompt_publication'),
    { unique: true, columns: ['public_folder_id', 'source_public_prompt_id'] }
  )
  assert.equal(state.hasForeignKey, true)

  const firstExecutionCount = state.executedSql.length
  await migration.up(context)
  assert.equal(state.executedSql.length, firstExecutionCount)
})
