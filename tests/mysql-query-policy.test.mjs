import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isRetryableMySQLRead,
  mysqlQueryAttemptLimit,
} from '../src/lib/mysql-query-policy.ts'

test('plain read-only statements may be retried', () => {
  assert.equal(isRetryableMySQLRead('SELECT id FROM users WHERE id = ?'), true)
  assert.equal(isRetryableMySQLRead(' /* trace */\nSHOW TABLES'), true)
  assert.equal(isRetryableMySQLRead('-- comment\nDESCRIBE users'), true)
  assert.equal(isRetryableMySQLRead('EXPLAIN SELECT * FROM users'), true)
  assert.equal(mysqlQueryAttemptLimit('SELECT 1'), 3)
})

test('mutations and ambiguous CTE statements execute at most once', () => {
  for (const sql of [
    'INSERT INTO users (username) VALUES (?)',
    'UPDATE users SET username = ? WHERE id = ?',
    'DELETE FROM users WHERE id = ?',
    'REPLACE INTO tags (id, name) VALUES (?, ?)',
    'WITH selected AS (SELECT 1) SELECT * FROM selected',
  ]) {
    assert.equal(isRetryableMySQLRead(sql), false, sql)
    assert.equal(mysqlQueryAttemptLimit(sql), 1, sql)
  }
})

test('locking, advisory-lock, file-output, and analyzing reads are not retried', () => {
  for (const sql of [
    'SELECT * FROM users WHERE id = ? FOR UPDATE',
    'SELECT * FROM users WHERE id = ? FOR SHARE',
    "SELECT GET_LOCK('migration', 1)",
    "SELECT RELEASE_LOCK('migration')",
    "SELECT * FROM users INTO OUTFILE '/tmp/users'",
    'EXPLAIN ANALYZE SELECT * FROM users',
  ]) {
    assert.equal(isRetryableMySQLRead(sql), false, sql)
  }
})
