// Downloads the backend's OpenAPI spec into openapi/openapi.json (the committed snapshot that
// `npm run api:generate` turns into src/api/schema.d.ts).
//
// API origin, first match wins: $API_URL, VITE_API_BASE_URL from .env.local, http://localhost:8080.
// The profound-baker-server must be running there (see README → "Run the backend").
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'

try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local: fall back to the defaults below.
}

const origin = (process.env.API_URL ?? process.env.VITE_API_BASE_URL ?? 'http://localhost:8080')
  .trim()
  .replace(/\/+$/, '')
const url = `${origin}/v3/api-docs`
const outFile = 'openapi/openapi.json'

let response
try {
  response = await fetch(url, { headers: { Accept: 'application/json' } })
} catch (error) {
  console.error(
    `Could not reach ${url}: is profound-baker-server running?\n${error.cause ?? error}`,
  )
  process.exit(1)
}
if (!response.ok) {
  console.error(`GET ${url} → ${response.status} ${response.statusText}`)
  process.exit(1)
}

const spec = await response.json()

// Keep the snapshot independent of where the server ran, and in a stable order, so it only changes
// in git when the API itself changes.
delete spec.servers
spec.paths = sortKeys(spec.paths)
if (spec.components?.schemas) spec.components.schemas = sortKeys(spec.components.schemas)

await mkdir('openapi', { recursive: true })
await writeFile(outFile, `${JSON.stringify(spec, null, 2)}\n`)

const schemaCount = Object.keys(spec.components?.schemas ?? {}).length
console.log(
  `Saved ${outFile}: ${Object.keys(spec.paths).length} paths, ${schemaCount} schemas (from ${url})`,
)

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).toSorted(([a], [b]) => a.localeCompare(b)))
}
