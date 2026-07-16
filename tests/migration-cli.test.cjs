'use strict'

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const cliPath = path.join(projectRoot, 'scripts', 'mysql-migrate.cjs')
const { migrationEnvironment } = require('../scripts/mysql-migrate.cjs')

test('migration CLI help documents commands and exits without database configuration', () => {
  const output = execFileSync(process.execPath, [cliPath, '--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH || '' },
  })

  assert.match(output, /plan\s+Print the offline migration plan/)
  assert.match(output, /status\s+Compare the database migration history/)
  assert.match(output, /up\s+Apply every pending migration/)
  assert.match(output, /MYSQL_MIGRATION_USER/)
})

test('migration-only credentials take precedence over application credentials', () => {
  const env = migrationEnvironment({
    MYSQL_USER: 'note_prompt_app',
    MYSQL_PASSWORD: 'app-secret',
    MYSQL_MIGRATION_USER: 'note_prompt_migrator',
    MYSQL_MIGRATION_PASSWORD: 'migration-secret',
  })

  assert.equal(env.MYSQL_USER, 'note_prompt_migrator')
  assert.equal(env.MYSQL_PASSWORD, 'migration-secret')
})

test('direct runner credentials remain a supported explicit fallback', () => {
  const env = migrationEnvironment({
    MYSQL_USER: 'ci_schema_owner',
    MYSQL_PASSWORD: 'ci-secret',
  })

  assert.equal(env.MYSQL_USER, 'ci_schema_owner')
  assert.equal(env.MYSQL_PASSWORD, 'ci-secret')
})
