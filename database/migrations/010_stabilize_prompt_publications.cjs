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
    throw new Error(`Migration 010 could not verify ${label}`)
  }
  return count
}

async function assertExistingProvenanceIsSafe(ctx) {
  const [danglingRows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM public_prompts publication
       LEFT JOIN user_prompts source
         ON source.id = publication.source_prompt_id
      WHERE publication.source_prompt_id IS NOT NULL
        AND source.id IS NULL`
  )
  const danglingCount = readViolationCount(danglingRows, 'publication provenance references')
  if (danglingCount > 0) {
    throw new Error(
      `Migration 010 refused ${danglingCount} publication provenance reference(s) without a private source`
    )
  }

  const [ownershipRows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM public_prompts publication
       JOIN user_prompts source
         ON source.id = publication.source_prompt_id
      WHERE publication.source_prompt_id IS NOT NULL
        AND publication.author_id <> source.user_id`
  )
  const ownershipCount = readViolationCount(ownershipRows, 'publication provenance ownership')
  if (ownershipCount > 0) {
    throw new Error(
      `Migration 010 refused ${ownershipCount} publication provenance ownership mismatch(es)`
    )
  }

  const [duplicateRows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM (
         SELECT source_prompt_id
           FROM public_prompts
          WHERE source_prompt_id IS NOT NULL
          GROUP BY source_prompt_id
         HAVING COUNT(*) > 1
       ) duplicate_sources`
  )
  const duplicateCount = readViolationCount(duplicateRows, 'duplicate publication provenance')
  if (duplicateCount > 0) {
    throw new Error(
      `Migration 010 refused ${duplicateCount} private source(s) linked to multiple publications`
    )
  }
}

async function assertPublicationColumns(ctx) {
  const [rows] = await ctx.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'public_prompts'
        AND COLUMN_NAME IN (
          'source_prompt_id',
          'publication_state',
          'editor_mode',
          'payload',
          'schema_version'
        )`
  )
  const columns = new Map(rows.map(row => [String(row.COLUMN_NAME), row]))
  const source = columns.get('source_prompt_id')
  const state = columns.get('publication_state')
  const editorMode = columns.get('editor_mode')
  const payload = columns.get('payload')
  const schemaVersion = columns.get('schema_version')

  const invalid = []
  if (
    !source
    || String(source.DATA_TYPE).toLowerCase() !== 'int'
    || String(source.IS_NULLABLE).toUpperCase() !== 'YES'
    || String(source.COLUMN_TYPE).toLowerCase() !== 'int'
  ) {
    invalid.push('source_prompt_id')
  }
  if (
    !state
    || String(state.COLUMN_TYPE).toLowerCase() !== "enum('published','withdrawn')"
    || String(state.IS_NULLABLE).toUpperCase() !== 'NO'
    || String(state.COLUMN_DEFAULT) !== 'published'
  ) {
    invalid.push('publication_state')
  }
  if (
    !editorMode
    || String(editorMode.COLUMN_TYPE).toLowerCase() !== "enum('normal','professional')"
    || String(editorMode.IS_NULLABLE).toUpperCase() !== 'NO'
    || String(editorMode.COLUMN_DEFAULT) !== 'normal'
  ) {
    invalid.push('editor_mode')
  }
  if (
    !payload
    || String(payload.DATA_TYPE).toLowerCase() !== 'json'
    || String(payload.IS_NULLABLE).toUpperCase() !== 'YES'
  ) {
    invalid.push('payload')
  }
  if (
    !schemaVersion
    || String(schemaVersion.COLUMN_TYPE).toLowerCase() !== 'int unsigned'
    || String(schemaVersion.IS_NULLABLE).toUpperCase() !== 'NO'
    || String(schemaVersion.COLUMN_DEFAULT) !== '1'
  ) {
    invalid.push('schema_version')
  }

  if (invalid.length > 0) {
    throw new Error(
      `Migration 010 found incompatible public_prompts column definition(s): ${invalid.join(', ')}`
    )
  }
}

function indexDefinitions(rows) {
  const definitions = new Map()
  for (const row of rows) {
    const name = String(row.INDEX_NAME)
    const definition = definitions.get(name) || {
      columns: [],
      nonUnique: Number(row.NON_UNIQUE),
      type: String(row.INDEX_TYPE).toUpperCase(),
    }
    definition.columns.push(String(row.COLUMN_NAME))
    definitions.set(name, definition)
  }
  return definitions
}

function indexMatches(definition, columns, unique) {
  return Boolean(
    definition
    && definition.type !== 'FULLTEXT'
    && definition.nonUnique === (unique ? 0 : 1)
    && definition.columns.length === columns.length
    && definition.columns.every((column, index) => column === columns[index])
  )
}

async function ensureExactIndex(ctx, tableName, indexName, columns, { unique = false } = {}) {
  const [rows] = await ctx.query(
    `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tableName]
  )
  const definitions = indexDefinitions(rows)
  const namedDefinition = definitions.get(indexName)
  if (namedDefinition && !indexMatches(namedDefinition, columns, unique)) {
    throw new Error(
      `Migration 010 found an incompatible index named ${tableName}.${indexName}`
    )
  }
  if (namedDefinition || [...definitions.values()].some(
    definition => indexMatches(definition, columns, unique)
  )) {
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

async function ensureSourceForeignKey(ctx) {
  const [rows] = await ctx.query(
    `SELECT key_usage.CONSTRAINT_NAME,
            key_usage.REFERENCED_TABLE_NAME,
            key_usage.REFERENCED_COLUMN_NAME,
            referential.DELETE_RULE,
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
        AND key_usage.TABLE_NAME = 'public_prompts'
        AND key_usage.COLUMN_NAME = 'source_prompt_id'
        AND key_usage.REFERENCED_TABLE_NAME IS NOT NULL`
  )

  const exact = rows.filter(row => (
    String(row.REFERENCED_TABLE_NAME) === 'user_prompts'
    && String(row.REFERENCED_COLUMN_NAME) === 'id'
    && String(row.DELETE_RULE).toUpperCase() === 'SET NULL'
    && Number(row.constraint_column_count) === 1
  ))
  if (rows.length > 0 && (rows.length !== 1 || exact.length !== 1)) {
    throw new Error(
      'Migration 010 found an incompatible foreign key on public_prompts.source_prompt_id'
    )
  }
  if (exact.length === 1) return false

  const [nameRows] = await ctx.query(
    `SELECT COUNT(*) AS violation_count
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = 'fk_public_prompts_source'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`
  )
  if (readViolationCount(nameRows, 'foreign-key constraint names') > 0) {
    throw new Error(
      'Migration 010 found fk_public_prompts_source assigned to another foreign key'
    )
  }

  await ctx.exec(
    `ALTER TABLE public_prompts
     ADD CONSTRAINT fk_public_prompts_source
     FOREIGN KEY (source_prompt_id) REFERENCES user_prompts(id) ON DELETE SET NULL`
  )
  return true
}

module.exports = {
  description: 'Give user prompt publications stable private-source identity and snapshot fields',

  async up(ctx) {
    // Additive definitions keep the old application compatible while the release is stopped
    // between schema expansion and the source-aware publication cutover.
    await ctx.ensureColumn('public_prompts', 'source_prompt_id', 'INT NULL')
    await ctx.ensureColumn(
      'public_prompts',
      'publication_state',
      "ENUM('published', 'withdrawn') NOT NULL DEFAULT 'published'"
    )
    await ctx.ensureColumn(
      'public_prompts',
      'editor_mode',
      "ENUM('normal', 'professional') NOT NULL DEFAULT 'normal'"
    )
    await ctx.ensureColumn('public_prompts', 'payload', 'JSON NULL')
    await ctx.ensureColumn(
      'public_prompts',
      'schema_version',
      'INT UNSIGNED NOT NULL DEFAULT 1'
    )
    await assertPublicationColumns(ctx)

    // A partially applied/manual provenance column is authoritative only when its references,
    // ownership, and one-source/one-publication cardinality are already safe. Never guess how
    // to repair an abnormal non-null relationship.
    await assertExistingProvenanceIsSafe(ctx)

    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_prompt_source_candidates')
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_prompt_source_links')
    await ctx.exec(
      `CREATE TEMPORARY TABLE tmp_public_prompt_source_candidates (
         public_prompt_id INT NOT NULL,
         source_prompt_id INT NOT NULL,
         PRIMARY KEY (public_prompt_id, source_prompt_id),
         INDEX idx_tmp_public_prompt_source (source_prompt_id)
       ) ENGINE=InnoDB`
    )

    // BINARY comparisons are intentional. The database's utf8mb4_unicode_ci collation is
    // case/accent insensitive and may ignore trailing spaces, none of which is strong enough
    // evidence for claiming historical provenance. NULL descriptions remain distinct from ''.
    await ctx.exec(
      `INSERT INTO tmp_public_prompt_source_candidates
         (public_prompt_id, source_prompt_id)
       SELECT publication.id, source.id
         FROM public_prompts publication
         JOIN user_prompts source
           ON source.user_id = publication.author_id
          AND BINARY source.title = BINARY publication.title
          AND BINARY source.content = BINARY publication.content
          AND (
            (source.description IS NULL AND publication.description IS NULL)
            OR (
              source.description IS NOT NULL
              AND publication.description IS NOT NULL
              AND BINARY source.description = BINARY publication.description
            )
          )
          AND source.category_id <=> publication.category_id
         LEFT JOIN public_prompts claimed
           ON claimed.source_prompt_id = source.id
        WHERE publication.source_prompt_id IS NULL
          AND claimed.id IS NULL`
    )
    await ctx.exec(
      `CREATE TEMPORARY TABLE tmp_public_prompt_source_links (
         public_prompt_id INT NOT NULL PRIMARY KEY,
         source_prompt_id INT NOT NULL,
         UNIQUE INDEX uq_tmp_public_prompt_source (source_prompt_id)
       ) ENGINE=InnoDB`
    )
    await ctx.exec(
      `INSERT INTO tmp_public_prompt_source_links
         (public_prompt_id, source_prompt_id)
       SELECT public_prompt_id, source_prompt_id
         FROM (
           SELECT candidate.public_prompt_id,
                  candidate.source_prompt_id,
                  COUNT(*) OVER (
                    PARTITION BY candidate.public_prompt_id
                  ) AS source_candidate_count,
                  COUNT(*) OVER (
                    PARTITION BY candidate.source_prompt_id
                  ) AS publication_candidate_count
             FROM tmp_public_prompt_source_candidates candidate
         ) ranked_candidates
        WHERE source_candidate_count = 1
          AND publication_candidate_count = 1`
    )
    await ctx.exec(
      `UPDATE public_prompts publication
       JOIN tmp_public_prompt_source_links verified
         ON verified.public_prompt_id = publication.id
          SET publication.source_prompt_id = verified.source_prompt_id
        WHERE publication.source_prompt_id IS NULL`
    )
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_prompt_source_links')
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_prompt_source_candidates')

    await assertExistingProvenanceIsSafe(ctx)
    await ensureExactIndex(
      ctx,
      'public_prompts',
      'uq_public_prompts_source',
      ['source_prompt_id'],
      { unique: true }
    )
    await ensureExactIndex(
      ctx,
      'public_prompts',
      'idx_public_prompts_state_created',
      ['publication_state', 'created_at', 'id']
    )
    await ensureSourceForeignKey(ctx)
  },

  _test: {
    assertExistingProvenanceIsSafe,
    readViolationCount,
  },
}
