#!/usr/bin/env node
'use strict'

const {
  applyMigrations,
  inspectStatus,
  loadMigrations,
} = require('./lib/mysql-migration-runner.cjs')

const USAGE = `Usage: node scripts/mysql-migrate.cjs <command>

Commands:
  plan    Print the offline migration plan without opening a database connection
  status  Compare the database migration history with this checkout
  up      Apply every pending migration in version order
  help    Show this help message

Connection variables:
  MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE
  MYSQL_MIGRATION_USER, MYSQL_MIGRATION_PASSWORD (preferred)
  MYSQL_USER, MYSQL_PASSWORD (fallback for direct runner use)
`

function migrationEnvironment(environment) {
  const env = { ...environment }

  if (environment.MYSQL_MIGRATION_USER) {
    env.MYSQL_USER = environment.MYSQL_MIGRATION_USER
  }
  if (Object.prototype.hasOwnProperty.call(environment, 'MYSQL_MIGRATION_PASSWORD')) {
    env.MYSQL_PASSWORD = environment.MYSQL_MIGRATION_PASSWORD
  }

  return env
}

function printPlan(plan) {
  for (const migration of plan) {
    const marker = migration.status === 'applied' ? 'applied' : 'pending'
    process.stdout.write(`${migration.version}  ${marker.padEnd(7)}  ${migration.name} - ${migration.description}\n`)
  }
}

async function main() {
  const command = process.argv[2] || 'status'

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE)
    return
  }

  if (command === 'plan') {
    const plan = loadMigrations().map(migration => ({ ...migration, status: 'pending' }))
    printPlan(plan)
    process.stdout.write('\nOffline plan only; no database connection was opened.\n')
    return
  }

  if (command === 'status') {
    printPlan(await inspectStatus({ env: migrationEnvironment(process.env) }))
    return
  }

  if (command === 'up') {
    const result = await applyMigrations({
      env: migrationEnvironment(process.env),
      log: message => process.stdout.write(`${message}\n`),
    })
    if (result.completed.length === 0) {
      process.stdout.write('Schema is already up to date.\n')
    } else {
      process.stdout.write(`Applied migrations: ${result.completed.join(', ')}\n`)
    }
    return
  }

  throw new Error(`Unknown command: ${command}\n\n${USAGE}`)
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  USAGE,
  migrationEnvironment,
}
