// Writes the Driftlight dataset to public/data/. Run: npm run data:generate
// The output is committed; src/data/data.test.ts fails if it drifts from the generator.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generate } from '../src/data/generate.ts'

const dir = join(import.meta.dirname, '../public/data')
mkdirSync(dir, { recursive: true })
const { files } = generate()
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(dir, name), content)
  console.log(`${name.padEnd(20)} ${(content.length / 1024).toFixed(0).padStart(5)} kB`)
}
