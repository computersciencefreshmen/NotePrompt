import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runbook = fs.readFileSync(
  new URL('../docs/operations/credential-exposure-recovery.md', import.meta.url),
  'utf8',
)
const deployGuide = fs.readFileSync(new URL('../DEPLOY.md', import.meta.url), 'utf8')
const qualityGuide = fs.readFileSync(
  new URL('../docs/engineering/release-quality-gates.md', import.meta.url),
  'utf8',
)

test('credential rotation and old-value invalidation precede history rewriting', () => {
  const rotationGate = runbook.indexOf('Gate A：先轮换并证明旧凭据失效')
  const rewriteGate = runbook.indexOf('Gate C：隔离副本与一次性历史重写')
  const forcePushGate = runbook.indexOf('Gate E：唯一受控 force push')

  assert.ok(rotationGate > 0)
  assert.ok(rewriteGate > rotationGate)
  assert.ok(forcePushGate > rewriteGate)
  assert.match(runbook, /旧 key\/密码被拒绝/)
  assert.match(runbook, /旧账号认证失败/)
  assert.match(runbook, /旧 key 在供应商侧显示 revoked\/invalid/)
  assert.match(runbook, /不得复制密码、私钥、token/)
})

test('the rewrite requires a fresh isolated mirror and complete ref evidence', () => {
  assert.match(runbook, /git-filter-repo >= 2\.47/)
  assert.match(runbook, /git clone --mirror/)
  assert.match(runbook, /refs\/pull\/\*/)
  assert.match(runbook, /--sensitive-data-removal/)
  assert.match(runbook, /--paths-from-file/)
  assert.match(runbook, /--replace-text/)
  assert.match(runbook, /git rev-parse --git-dir/)
  assert.match(runbook, /\$GIT_DIR\/filter-repo\/changed-refs/)
  assert.doesNotMatch(runbook, /保存 `\.git\/filter-repo\/changed-refs`/)
  assert.match(runbook, /First Changed Commit\(s\)/)
  assert.match(runbook, /git fsck --full/)
  assert.match(runbook, /--log-opts='--all'/)
  assert.match(runbook, /--redact/)
  assert.match(runbook, /remote-refs-t0\.txt/)
  assert.match(runbook, /remote-refs-tpush\.txt/)

  assert.ok((runbook.match(/set -euo pipefail/g) || []).length >= 6)
  assert.match(runbook, /test -s "\$INCIDENT_ROOT\/evidence\/remote-refs-t0\.txt"/)
  assert.match(runbook, /test -s "\$INCIDENT_ROOT\/evidence\/remote-refs-tpush\.txt"/)
})

test('force push remains an explicit owner action with external cleanup', () => {
  assert.match(runbook, /本手册不是执行授权/)
  assert.match(runbook, /执行当下仍需仓库所有者再次确认/)
  assert.match(runbook, /git push --force --mirror origin/)
  assert.match(runbook, /GitHub Support/)
  assert.match(runbook, /fork owner/)
  assert.match(runbook, /cached commit views/)
  assert.match(runbook, /orphaned LFS/)
  assert.match(runbook, /VERIFIED_RUN_ID/)
  assert.match(runbook, /VERIFIED_ARTIFACT_ID/)
  assert.match(runbook, /VERIFIED_CACHE_ID/)
  assert.match(runbook, /禁止编写无边界批量循环/)
  assert.match(runbook, /expected-heads-tags\.txt/)
  assert.match(runbook, /remote-heads-tags-after\.txt/)
  assert.match(runbook, /--refs --heads --tags/)
  assert.match(runbook, /cmp[\s\S]*expected-heads-tags\.txt[\s\S]*remote-heads-tags-after\.txt/)
})

test('completion requires fresh clones and an enforced release gate', () => {
  assert.match(runbook, /所有协作者删除旧 clone 后重新 clone/)
  assert.match(runbook, /Release Quality \/ Release gate/)
  assert.match(runbook, /required check/)
  assert.match(runbook, /未通过时无法合并/)
  assert.match(runbook, /Stage 1C 才能关闭/)

  assert.match(deployGuide, /credential-exposure-recovery\.md/)
  assert.match(qualityGuide, /credential-exposure-recovery\.md/)
})
