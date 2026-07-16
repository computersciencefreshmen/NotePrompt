import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const standaloneDirectory = path.resolve(process.cwd(), '.next', 'standalone')
const expectedSuffix = path.join('.next', 'standalone')

if (!standaloneDirectory.endsWith(expectedSuffix)) {
  throw new Error('Refusing to sanitize an unexpected build directory')
}

let entries = []
try {
  entries = await readdir(standaloneDirectory)
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  throw error
}

const sensitiveBuildFiles = entries.filter(name => (
  name === '.env'
  || name.startsWith('.env.')
  || name === '.provider-config.local.json'
  || /^\.provider-config.*\.local\.json$/u.test(name)
))

await Promise.all(sensitiveBuildFiles.map(name => (
  rm(path.join(standaloneDirectory, name), { force: true })
)))

if (sensitiveBuildFiles.length > 0) {
  console.log(`Removed ${sensitiveBuildFiles.length} runtime configuration file(s) from standalone output.`)
}
