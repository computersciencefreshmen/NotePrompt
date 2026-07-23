import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('credential forms fail safe to POST before client hydration', () => {
  const login = read('src/app/login/page.tsx')
  const register = read('src/app/register/page.tsx')

  assert.match(login, /<form method="post" onSubmit=\{handleSubmit\}/)
  assert.match(register, /<form method="post" onSubmit=\{handleSubmit\}/)
  assert.match(login, /autoComplete="username"/)
  assert.match(login, /autoComplete="current-password"/)
  assert.match(register, /autoComplete="email"/)
  assert.equal((register.match(/autoComplete="new-password"/g) ?? []).length, 2)
})
