'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('migration 009 introduces a fail-closed administrative suspension marker', async () => {
  const migration = require('../database/migrations/009_separate_administrative_suspension.cjs')
  const events = []

  await migration.up({
    ensureColumn: async (table, column, definition) => events.push(`column:${table}.${column}:${definition}`),
    ensureIndex: async (table, index, columns) => events.push(`index:${table}.${index}:${columns.join(',')}`),
    exec: async sql => events.push(sql),
  })

  assert.match(events.join('\n'), /column:users\.admin_disabled_at:TIMESTAMP NULL/)
  assert.match(events.join('\n'), /idx_users_admin_disabled_at/)
  assert.match(events.join('\n'), /SET admin_disabled_at = COALESCE\(admin_disabled_at, CURRENT_TIMESTAMP\)/)
  assert.match(events.join('\n'), /WHERE is_active = 0/)
})

test('admin updates maintain suspension state atomically with is_active', () => {
  const source = read('src/app/api/v1/admin/users/route.ts')

  assert.match(source, /isActive \? 'admin_disabled_at = NULL' : 'admin_disabled_at = NOW\(\)'/)
  assert.match(source, /session_version = COALESCE\(session_version, 1\) \+ 1/)
})

test('verification cannot reactivate an administratively suspended account', () => {
  const sendSource = read('src/app/api/v1/auth/send-verification/route.ts')
  const verifySource = read('src/app/api/v1/auth/verify-email/route.ts')
  const loginSource = read('src/app/api/v1/auth/login/route.ts')

  assert.match(sendSource, /user\.admin_disabled_at/)
  assert.match(verifySource, /!user\?\.admin_disabled_at/)
  assert.match(verifySource, /AND admin_disabled_at IS NULL/)
  assert.ok(loginSource.indexOf('if (dbUser.admin_disabled_at)') < loginSource.indexOf("process.env.ENABLE_EMAIL_VERIFICATION === 'true'"))
})
