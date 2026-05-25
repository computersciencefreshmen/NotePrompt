const path = require('path')
const { createWorker } = require('tesseract.js')

async function main() {
  const imagePath = process.argv[2]
  if (!imagePath) {
    throw new Error('Missing image path')
  }

  const worker = await createWorker('chi_sim+eng', undefined, {
    workerPath: path.resolve(process.cwd(), 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'),
    corePath: path.resolve(process.cwd(), 'node_modules', 'tesseract.js-core'),
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    cachePath: path.join(require('os').tmpdir(), 'note-prompt-ocr-cache'),
    gzip: true,
  })

  try {
    const result = await worker.recognize(imagePath)
    process.stdout.write(result.data.text || '')
  } finally {
    await worker.terminate()
  }
}

main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exit(1)
})