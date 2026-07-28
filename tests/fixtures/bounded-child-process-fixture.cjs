const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')

const mode = process.argv[2]

const markReady = readyPath => {
  if (readyPath) writeFileSync(readyPath, 'ready\n')
}

function spawnDescendant(exitAfterReady) {
  const pidPath = process.argv[3]
  const heartbeatPath = process.argv[4]
  const readyPath = process.argv[5]

  if (!exitAfterReady) process.on('SIGTERM', () => {})

  const descendant = spawn(
    process.execPath,
    [__filename, 'descendant', heartbeatPath, readyPath],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  )
  writeFileSync(pidPath, String(descendant.pid))

  if (exitAfterReady) {
    descendant.once('message', () => {
      descendant.disconnect()
      descendant.unref()
    })
    return
  }

  setInterval(() => {}, 1_000)
}

if (mode === 'echo') {
  process.stdout.write(process.argv[3] || '')
} else if (mode === 'fail-with-secret') {
  process.stderr.write('CHILD_STDERR_MARKER_7f3a9c2d')
  process.exitCode = 7
} else if (mode === 'stdout-overflow') {
  for (let index = 0; index < 256; index += 1) process.stdout.write('x'.repeat(1_024))
  setInterval(() => {}, 1_000)
} else if (mode === 'stderr-overflow') {
  for (let index = 0; index < 256; index += 1) process.stderr.write('CHILD_STDERR_MARKER_7f3a9c2d')
  setInterval(() => {}, 1_000)
} else if (mode === 'graceful-term') {
  process.on('SIGTERM', () => process.exit(0))
  markReady(process.argv[3])
  setInterval(() => {}, 1_000)
} else if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {})
  markReady(process.argv[3])
  setInterval(() => {}, 1_000)
} else if (mode === 'descendant') {
  const heartbeatPath = process.argv[3]
  const readyPath = process.argv[4]
  process.on('SIGTERM', () => {})
  const beat = () => writeFileSync(heartbeatPath, `${Date.now()}\n`)
  beat()
  markReady(readyPath)
  process.send?.('ready')
  setInterval(beat, 25)
} else if (mode === 'spawn-descendant') {
  spawnDescendant(false)
} else if (mode === 'spawn-descendant-and-exit') {
  spawnDescendant(true)
} else {
  process.exitCode = 2
}
