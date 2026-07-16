'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'database', 'migrations')
const MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z0-9][a-z0-9_-]*)\.cjs$/
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteIdentifier(identifier) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe MySQL identifier: ${identifier}`)
  }
  return `\`${identifier}\``
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function migrationChecksum(filePath, source, integrityFiles = []) {
  if (!Array.isArray(integrityFiles)) {
    throw new Error(`${path.basename(filePath)} integrityFiles must be an array`)
  }

  const migrationDirectory = path.dirname(filePath)
  const parts = [source]
  for (const relativePath of integrityFiles) {
    if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
      throw new Error(`${path.basename(filePath)} has an invalid integrity file path`)
    }
    const dependencyPath = path.resolve(migrationDirectory, relativePath)
    const relativeToMigrationDirectory = path.relative(migrationDirectory, dependencyPath)
    if (relativeToMigrationDirectory.startsWith('..') || path.isAbsolute(relativeToMigrationDirectory)) {
      throw new Error(`${path.basename(filePath)} integrity file escapes the migration directory`)
    }
    if (!fs.statSync(dependencyPath).isFile()) {
      throw new Error(`${path.basename(filePath)} integrity dependency is not a file: ${relativePath}`)
    }
    parts.push(relativePath, fs.readFileSync(dependencyPath))
  }
  return checksum(Buffer.concat(parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))))
}

function loadMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
  const migrations = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const match = MIGRATION_FILE_PATTERN.exec(entry.name)
    if (!match) continue

    const filePath = path.join(migrationsDir, entry.name)
    const source = fs.readFileSync(filePath, 'utf8')
    delete require.cache[require.resolve(filePath)]
    const migration = require(filePath)

    if (!migration || typeof migration.up !== 'function' || typeof migration.description !== 'string') {
      throw new Error(`${entry.name} must export { description, up }`)
    }

    migrations.push({
      version: match[1],
      name: match[2],
      description: migration.description,
      checksum: migrationChecksum(filePath, source, migration.integrityFiles),
      filePath,
      up: migration.up,
    })
  }

  migrations.sort((left, right) => left.version.localeCompare(right.version, 'en', { numeric: true }))

  const seenVersions = new Set()
  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`)
    }
    seenVersions.add(migration.version)
  }

  if (migrations.length === 0) {
    throw new Error(`No versioned migrations found in ${migrationsDir}`)
  }

  return migrations
}

function connectionConfigFromEnv(env = process.env) {
  const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE']
  const missing = required.filter(name => !env[name])
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`)
  }

  const port = Number(env.MYSQL_PORT || 3306)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be an integer between 1 and 65535')
  }

  return {
    host: env.MYSQL_HOST,
    port,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: '+08:00',
    multipleStatements: false,
  }
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT 1
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName]
  )
  return rows.length > 0
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  )
  return rows.length > 0
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [tableName, indexName]
  )
  return rows.length > 0
}

async function equivalentIndexExists(connection, tableName, columns, options = {}) {
  const [rows] = await connection.execute(
    `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tableName]
  )
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

  return [...definitions.values()].some(definition => {
    if (definition.columns.length !== columns.length) return false
    if (!definition.columns.every((column, index) => column === columns[index])) return false
    if (options.fulltext && definition.type !== 'FULLTEXT') return false
    if (!options.fulltext && definition.type === 'FULLTEXT') return false
    if (options.unique && definition.nonUnique !== 0) return false
    return true
  })
}

function createMigrationContext(connection, log = () => {}) {
  return {
    async exec(sql, parameters = []) {
      log(sql.replace(/\s+/g, ' ').trim())
      return connection.execute(sql, parameters)
    },

    async query(sql, parameters = []) {
      return connection.execute(sql, parameters)
    },

    async ensureTable(tableName, createSql) {
      quoteIdentifier(tableName)
      if (await tableExists(connection, tableName)) return false
      log(`create table ${tableName}`)
      await connection.query(createSql)
      return true
    },

    async ensureColumn(tableName, columnName, definition) {
      if (await columnExists(connection, tableName, columnName)) return false
      log(`add column ${tableName}.${columnName}`)
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`
      )
      return true
    },

    async ensureIndex(tableName, indexName, columns, options = {}) {
      if (
        await indexExists(connection, tableName, indexName)
        || await equivalentIndexExists(connection, tableName, columns, options)
      ) return false
      const type = options.fulltext ? 'FULLTEXT INDEX' : options.unique ? 'UNIQUE INDEX' : 'INDEX'
      const columnSql = columns.map(quoteIdentifier).join(', ')
      log(`add index ${tableName}.${indexName}`)
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(tableName)} ADD ${type} ${quoteIdentifier(indexName)} (${columnSql})`
      )
      return true
    },

    async modifyColumn(tableName, columnName, definition) {
      if (!(await columnExists(connection, tableName, columnName))) {
        throw new Error(`Cannot modify missing column ${tableName}.${columnName}`)
      }
      log(`modify column ${tableName}.${columnName}`)
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${quoteIdentifier(columnName)} ${definition}`
      )
    },

    async dropColumn(tableName, columnName) {
      if (!(await columnExists(connection, tableName, columnName))) return false
      log(`remove legacy column ${tableName}.${columnName}`)
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(tableName)} DROP COLUMN ${quoteIdentifier(columnName)}`
      )
      return true
    },

    tableExists: tableName => tableExists(connection, tableName),
    columnExists: (tableName, columnName) => columnExists(connection, tableName, columnName),
    indexExists: (tableName, indexName) => indexExists(connection, tableName, indexName),
  }
}

async function ensureMigrationsTable(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(32) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_ms INT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}

async function readAppliedMigrations(connection) {
  if (!(await tableExists(connection, 'schema_migrations'))) return new Map()
  const [rows] = await connection.execute(
    'SELECT version, name, checksum, applied_at, execution_ms FROM schema_migrations ORDER BY version'
  )
  return new Map(rows.map(row => [String(row.version), row]))
}

function validateAppliedMigrations(migrations, applied) {
  const knownVersions = new Set(migrations.map(migration => migration.version))
  const unknownVersions = [...applied.keys()].filter(version => !knownVersions.has(version))
  if (unknownVersions.length > 0) {
    throw new Error(`Database contains migrations unknown to this checkout: ${unknownVersions.join(', ')}`)
  }

  let encounteredPending = false
  for (const migration of migrations) {
    const record = applied.get(migration.version)
    if (!record) {
      encounteredPending = true
      continue
    }
    if (encounteredPending) {
      throw new Error(`Migration history has a gap before ${migration.version}`)
    }
    if (String(record.name) !== migration.name) {
      throw new Error(`Migration ${migration.version} name differs from the applied record`)
    }
    if (String(record.checksum) !== migration.checksum) {
      throw new Error(`Migration ${migration.version} checksum differs from the applied record`)
    }
  }
}

function buildPlan(migrations, applied = new Map()) {
  validateAppliedMigrations(migrations, applied)
  return migrations.map(migration => ({
    version: migration.version,
    name: migration.name,
    description: migration.description,
    checksum: migration.checksum,
    status: applied.has(migration.version) ? 'applied' : 'pending',
  }))
}

async function withConnection(options, work) {
  const mysql = require('mysql2/promise')
  const connection = await mysql.createConnection(connectionConfigFromEnv(options.env))
  try {
    return await work(connection)
  } finally {
    await connection.end()
  }
}

async function inspectStatus(options = {}) {
  const migrations = loadMigrations(options.migrationsDir)
  return withConnection(options, async connection => {
    const applied = await readAppliedMigrations(connection)
    return buildPlan(migrations, applied)
  })
}

async function applyMigrations(options = {}) {
  const migrations = loadMigrations(options.migrationsDir)
  const log = options.log || (() => {})
  const lockTimeoutSeconds = Number(options.lockTimeoutSeconds ?? 10)

  return withConnection(options, async connection => {
    const databaseName = connection.config.database
    const lockHash = checksum(String(databaseName)).slice(0, 24)
    const lockName = `note-prompt:migrations:${lockHash}`
    const [lockRows] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [lockName, lockTimeoutSeconds])
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error(`Could not acquire migration lock for ${databaseName}`)
    }

    try {
      await ensureMigrationsTable(connection)
      const applied = await readAppliedMigrations(connection)
      validateAppliedMigrations(migrations, applied)

      const completed = []
      for (const migration of migrations) {
        if (applied.has(migration.version)) continue

        const startedAt = Date.now()
        log(`applying ${migration.version}_${migration.name}`)
        const context = createMigrationContext(connection, log)
        await migration.up(context)
        const executionMs = Date.now() - startedAt
        await connection.execute(
          `INSERT INTO schema_migrations (version, name, checksum, execution_ms)
           VALUES (?, ?, ?, ?)`,
          [migration.version, migration.name, migration.checksum, executionMs]
        )
        completed.push(migration.version)
        log(`applied ${migration.version}_${migration.name} (${executionMs}ms)`)
      }

      return { completed, plan: buildPlan(migrations, await readAppliedMigrations(connection)) }
    } finally {
      await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName])
    }
  })
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  MIGRATION_FILE_PATTERN,
  applyMigrations,
  buildPlan,
  checksum,
  connectionConfigFromEnv,
  createMigrationContext,
  inspectStatus,
  loadMigrations,
  migrationChecksum,
  quoteIdentifier,
  readAppliedMigrations,
  validateAppliedMigrations,
}
