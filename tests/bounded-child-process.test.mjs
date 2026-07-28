import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  BoundedChildProcessError,
  runBoundedChildProcess,
} from '../src/lib/bounded-child-process.ts'

const fixturePath = path.join(
  import.meta.dirname,
  'fixtures',
  'bounded-child-process-fixture.cjs',
)

const baseOptions = {
  command: process.execPath,
  timeoutMs: 5_000,
  maxStdoutBytes: 16 * 1_024,
  maxStderrBytes: 16 * 1_024,
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function waitForFile(filePath, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await delay(20)
  }
  throw new Error(`Timed out waiting for fixture: ${path.basename(filePath)}`)
}

function isProcessAlive(processId) {
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

function createSyntheticChild() {
  const child = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  let killCalls = 0
  child.pid = undefined
  child.stdout = stdout
  child.stderr = stderr
  child.kill = () => {
    killCalls += 1
    return true
  }
  return { child, stdout, stderr, killCalls: () => killCalls }
}

function hasCode(code) {
  return error => error instanceof BoundedChildProcessError && error.code === code
}

test('fixed arguments remain literal and a shell is never involved', async () => {
  const literal = '$(touch should-not-run); & | > < %PATH%'
  const result = await runBoundedChildProcess({
    ...baseOptions,
    args: [fixturePath, 'echo', literal],
  })
  assert.equal(result.stdout.toString('utf8'), literal)
  assert.deepEqual(Object.keys(result), ['stdout'])
})

test('a pre-aborted signal prevents the child from starting', async () => {
  const controller = new AbortController()
  controller.abort(new Error('sensitive abort reason'))
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'echo', 'must-not-run'],
      signal: controller.signal,
    }),
    hasCode('aborted'),
  )
})

test('non-zero exits expose a fixed error without stderr', async () => {
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'fail-with-secret'],
    }),
    error => {
      assert.ok(hasCode('process_failed')(error))
      assert.equal(error.message, 'Child process failed')
      assert.doesNotMatch(error.message, /CHILD_STDERR_MARKER_7f3a9c2d/)
      return true
    },
  )
})

test('stdout and stderr are rejected incrementally at independent limits', async () => {
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'stdout-overflow'],
      maxStdoutBytes: 2_048,
    }),
    hasCode('stdout_limit_exceeded'),
  )
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'stderr-overflow'],
      maxStderrBytes: 128,
    }),
    error => {
      assert.ok(hasCode('stderr_limit_exceeded')(error))
      assert.doesNotMatch(error.message, /CHILD_STDERR_MARKER_7f3a9c2d/)
      return true
    },
  )
})

test('AbortSignal terminates an active child and returns a fixed error', async () => {
  const controller = new AbortController()
  const running = runBoundedChildProcess({
    ...baseOptions,
    args: [fixturePath, 'graceful-term'],
    signal: controller.signal,
  })
  await delay(50)
  controller.abort(new Error('sensitive abort reason'))
  await assert.rejects(running, error => {
    assert.ok(hasCode('aborted')(error))
    assert.doesNotMatch(error.message, /sensitive abort reason/)
    return true
  })
})

test('timeout escalates from TERM to KILL after one second', async () => {
  const startedAt = Date.now()
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'ignore-term'],
      timeoutMs: 50,
    }),
    hasCode('timed_out'),
  )
  const elapsedMs = Date.now() - startedAt
  if (process.platform === 'linux') {
    assert.ok(elapsedMs >= 900, `expected TERM grace before KILL, saw ${elapsedMs}ms`)
  }
  assert.ok(elapsedMs < 3_000, `child termination took too long: ${elapsedMs}ms`)
})

test('spawn error and close races settle the public promise exactly once', async () => {
  let settlements = 0
  const impossibleCommand = path.join(tmpdir(), `missing-child-${crypto.randomUUID()}`)
  const running = runBoundedChildProcess({
    ...baseOptions,
    command: impossibleCommand,
    args: [],
  }).then(
    () => { settlements += 1 },
    error => {
      settlements += 1
      assert.ok(hasCode('spawn_failed')(error))
    },
  )
  await running
  await delay(50)
  assert.equal(settlements, 1)
})

test('Linux process-group termination reclaims descendants', {
  skip: process.platform !== 'linux' && 'Linux process groups are not available on this platform',
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bounded-child-test-'))
  const pidPath = path.join(directory, 'descendant.pid')
  const heartbeatPath = path.join(directory, 'heartbeat.txt')
  await assert.rejects(
    runBoundedChildProcess({
      ...baseOptions,
      args: [fixturePath, 'spawn-descendant', pidPath, heartbeatPath],
      timeoutMs: 150,
    }),
    hasCode('timed_out'),
  )
  const descendantPid = Number(await readFile(pidPath, 'utf8'))
  assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0)
  const firstHeartbeat = await readFile(heartbeatPath, 'utf8')
  await delay(150)
  const secondHeartbeat = await readFile(heartbeatPath, 'utf8')
  assert.equal(secondHeartbeat, firstHeartbeat)
})
