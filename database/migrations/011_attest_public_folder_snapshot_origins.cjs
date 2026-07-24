'use strict'

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteIdentifier(identifier) {
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe MySQL identifier: ${identifier}`)
  }
  return `\`${identifier}\``
}

function readViolationCount(rows, label) {
  const count = Number(rows[0]?.violation_count)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Migration 011 could not verify ${label}`)
  }
  return count
}

async function assertSnapshotOriginColumns(ctx) {
  const [rows] = await ctx.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'public_folder_prompts'
        AND COLUMN_NAME IN ('snapshot_origin', 'source_public_prompt_id')`
  )
  const columns = new Map(rows.map(row => [String(row.COLUMN_NAME), row]))
  const origin = columns.get('snapshot_origin')
  const sourcePublication = columns.get('source_public_prompt_id')
  const invalid = []

  if (
    !origin
    || String(origin.DATA_TYPE).toLowerCase() !== 'enum'
    || String(origin.COLUMN_TYPE).toLowerCase()
      !== "enum('legacy_unverified','folder_publication','moderated_publication')"
    || String(origin.IS_NULLABLE).toUpperCase() !== 'NO'
    || String(origin.COLUMN_DEFAULT) !== 'legacy_unverified'
    || String(origin.EXTRA || '') !== ''
  ) {
    invalid.push('snapshot_origin')
  }

  if (
    !sourcePublication
    || String(sourcePublication.DATA_TYPE).toLowerCase() !== 'int'
    || String(sourcePublication.COLUMN_TYPE).toLowerCase() !== 'int'
    || String(sourcePublication.IS_NULLABLE).toUpperCase() !== 'YES'
    || sourcePublication.COLUMN_DEFAULT !== null
    || String(sourcePublication.EXTRA || '') !== ''
  ) {
    invalid.push('source_public_prompt_id')
  }

  if (invalid.length > 0) {
    throw new Error(
      `Migration 011 found incompatible public_folder_prompts column definition(s): ${invalid.join(', ')}`
    )
  }
}

function indexDefinitions(rows) {
  const definitions = new Map()
  for (const row of rows) {
    const name = String(row.INDEX_NAME)
    const existing = definitions.get(name)
    const metadata = {
      nonUnique: Number(row.NON_UNIQUE),
      type: String(row.INDEX_TYPE).toUpperCase(),
      visible: String(row.IS_VISIBLE).toUpperCase(),
    }
    if (
      existing
      && (
        existing.nonUnique !== metadata.nonUnique
        || existing.type !== metadata.type
        || existing.visible !== metadata.visible
      )
    ) {
      throw new Error(
        `Migration 011 found inconsistent metadata for index ${name}`
      )
    }
    const definition = existing || {
      columns: [],
      ...metadata,
    }
    definition.columns.push(String(row.COLUMN_NAME))
    definitions.set(name, definition)
  }
  return definitions
}

function indexShapeMatches(definition, columns, unique) {
  return Boolean(
    definition
    && definition.type === 'BTREE'
    && definition.nonUnique === (unique ? 0 : 1)
    && definition.columns.length === columns.length
    && definition.columns.every((column, index) => column === columns[index])
  )
}

function indexMatches(definition, columns, unique) {
  return Boolean(
    indexShapeMatches(definition, columns, unique)
    && definition.visible === 'YES'
  )
}

async function ensureExactIndex(ctx, tableName, indexName, columns, { unique = false } = {}) {
  const [rows] = await ctx.query(
    `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, IS_VISIBLE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tableName]
  )
  const definitions = indexDefinitions(rows)
  const namedDefinition = definitions.get(indexName)

  if (
    namedDefinition
    && (
      !indexShapeMatches(namedDefinition, columns, unique)
      || namedDefinition.visible !== 'YES'
    )
  ) {
    throw new Error(
      `Migration 011 found an incompatible index named ${tableName}.${indexName}`
    )
  }

  const invisibleEquivalent = [...definitions.values()].find(
    definition => (
      indexShapeMatches(definition, columns, unique)
      && definition.visible !== 'YES'
    )
  )
  if (invisibleEquivalent) {
    throw new Error(
      `Migration 011 found an incompatible invisible index on ${tableName}.${columns.join(',')}`
    )
  }

  // A unique source-only index would silently impose one-publication/one-snapshot
  // cardinality. That is not equivalent to the required ordinary lookup index.
  if (
    !unique
    && [...definitions.values()].some(
      definition => indexShapeMatches(definition, columns, true)
    )
  ) {
    throw new Error(
      `Migration 011 found an incompatible unique index on ${tableName}.${columns.join(',')}`
    )
  }

  const exactDefinition = [...definitions.values()].find(
    definition => indexMatches(definition, columns, unique)
  )
  if (namedDefinition || exactDefinition) {
    return false
  }

  const type = unique ? 'UNIQUE INDEX' : 'INDEX'
  await ctx.exec(
    `ALTER TABLE ${quoteIdentifier(tableName)}
     ADD ${type} ${quoteIdentifier(indexName)}
     (${columns.map(quoteIdentifier).join(', ')})`
  )
  return true
}

async function assertPendingSnapshotOriginsAreUnclaimed(ctx) {
  const [rows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM public_folder_prompts
      WHERE snapshot_origin <> 'legacy_unverified'
         OR source_public_prompt_id IS NOT NULL`
  )
  const violationCount = readViolationCount(
    rows,
    'pending snapshot origin claims'
  )
  if (violationCount > 0) {
    throw new Error(
      `Migration 011 refused ${violationCount} row(s) with non-default snapshot_origin or non-null source_public_prompt_id`
    )
  }
}

async function ensureSourcePublicationForeignKey(ctx) {
  const [rows] = await ctx.query(
    `SELECT key_usage.CONSTRAINT_NAME,
            key_usage.REFERENCED_TABLE_NAME,
            key_usage.REFERENCED_COLUMN_NAME,
            referential.DELETE_RULE,
            referential.UPDATE_RULE,
            (
              SELECT COUNT(*)
                FROM information_schema.KEY_COLUMN_USAGE constraint_columns
               WHERE constraint_columns.CONSTRAINT_SCHEMA = key_usage.CONSTRAINT_SCHEMA
                 AND constraint_columns.TABLE_NAME = key_usage.TABLE_NAME
                 AND constraint_columns.CONSTRAINT_NAME = key_usage.CONSTRAINT_NAME
            ) AS constraint_column_count
       FROM information_schema.KEY_COLUMN_USAGE key_usage
       JOIN information_schema.REFERENTIAL_CONSTRAINTS referential
         ON referential.CONSTRAINT_SCHEMA = key_usage.CONSTRAINT_SCHEMA
        AND referential.TABLE_NAME = key_usage.TABLE_NAME
        AND referential.CONSTRAINT_NAME = key_usage.CONSTRAINT_NAME
      WHERE key_usage.CONSTRAINT_SCHEMA = DATABASE()
        AND key_usage.TABLE_NAME = 'public_folder_prompts'
        AND key_usage.COLUMN_NAME = 'source_public_prompt_id'
        AND key_usage.REFERENCED_TABLE_NAME IS NOT NULL`
  )

  const exact = rows.filter(row => (
    String(row.REFERENCED_TABLE_NAME) === 'public_prompts'
    && String(row.REFERENCED_COLUMN_NAME) === 'id'
    && String(row.DELETE_RULE).toUpperCase() === 'SET NULL'
    && String(row.UPDATE_RULE).toUpperCase() === 'NO ACTION'
    && Number(row.constraint_column_count) === 1
  ))
  if (rows.length > 0 && (rows.length !== 1 || exact.length !== 1)) {
    throw new Error(
      'Migration 011 found an incompatible foreign key on public_folder_prompts.source_public_prompt_id'
    )
  }
  if (exact.length === 1) return false

  const [nameRows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = 'fk_public_folder_prompts_publication'`
  )
  if (readViolationCount(nameRows, 'foreign-key constraint names') > 0) {
    throw new Error(
      'Migration 011 found fk_public_folder_prompts_publication assigned to another foreign key'
    )
  }

  await ctx.exec(
    `ALTER TABLE public_folder_prompts
     ADD CONSTRAINT fk_public_folder_prompts_publication
     FOREIGN KEY (source_public_prompt_id) REFERENCES public_prompts(id) ON DELETE SET NULL ON UPDATE NO ACTION`
  )
  return true
}

module.exports = {
  description: 'Attest public folder snapshot origins without guessing legacy provenance',

  async up(ctx) {
    // Expansion is deliberately provenance-neutral. Existing rows receive only the
    // explicit legacy_unverified default; this migration never guesses or backfills
    // a publication origin.
    await ctx.ensureColumn(
      'public_folder_prompts',
      'snapshot_origin',
      "ENUM('legacy_unverified', 'folder_publication', 'moderated_publication') NOT NULL DEFAULT 'legacy_unverified'"
    )
    await ctx.ensureColumn(
      'public_folder_prompts',
      'source_public_prompt_id',
      'INT NULL'
    )
    await assertSnapshotOriginColumns(ctx)
    await assertPendingSnapshotOriginsAreUnclaimed(ctx)

    await ensureExactIndex(
      ctx,
      'public_folder_prompts',
      'idx_public_folder_prompts_publication',
      ['source_public_prompt_id']
    )
    await ensureExactIndex(
      ctx,
      'public_folder_prompts',
      'uq_public_folder_prompt_publication',
      ['public_folder_id', 'source_public_prompt_id'],
      { unique: true }
    )
    await ensureSourcePublicationForeignKey(ctx)
  },

  _test: {
    assertPendingSnapshotOriginsAreUnclaimed,
    assertSnapshotOriginColumns,
    ensureExactIndex,
    ensureSourcePublicationForeignKey,
    indexDefinitions,
    indexMatches,
    indexShapeMatches,
    readViolationCount,
  },
}
