// Runs the stack the end-to-end tests use. It lives in profound-baker-server, next to production's
// compose file: docker-compose.prod.yml with docker-compose.e2e.yml on top, and docker-compose.e2e-web.yml
// to build the web app from this checkout instead of pulling the published image. See that repository's
// README, "End-to-end stack for the web app".
//
//   node scripts/e2e-stack.mjs up        build and start it, wait until healthy
//   node scripts/e2e-stack.mjs down      stop it and drop its data
//   node scripts/e2e-stack.mjs <args>    any other docker compose command, e.g. `logs app caddy`
//
// The server checkout, first match wins: $SERVER_DIR, SERVER_DIR in .env.local, ../profound-baker-server.
// A relative path is taken from this repository's root.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')

try {
  process.loadEnvFile(path.join(root, '.env.local'))
} catch {
  // No .env.local: fall back to the default below.
}

const serverDir = path.resolve(root, process.env.SERVER_DIR ?? '../profound-baker-server')
const file = (name) => path.join(serverDir, name)

if (!existsSync(file('docker-compose.e2e.yml'))) {
  console.error(
    `No docker-compose.e2e.yml in ${serverDir}.\n` +
      'Clone WARHE8D/profound-baker-server next to this repository, or set SERVER_DIR to its path ' +
      '(in the environment or in .env.local).',
  )
  process.exit(1)
}

const SHORTHANDS = {
  up: ['up', '-d', '--build', '--wait'],
  down: ['down', '-v'],
}
const [command = 'ps', ...rest] = process.argv.slice(2)
const args = [...(SHORTHANDS[command] ?? [command]), ...rest]

// Paths are absolute: compose resolves relative ones from the first file's folder (the server's), and
// --env-file from the current directory.
const { status, error } = spawnSync(
  'docker',
  [
    'compose',
    ...['docker-compose.prod.yml', 'docker-compose.e2e.yml', 'docker-compose.e2e-web.yml'].flatMap(
      (name) => ['-f', file(name)],
    ),
    '--env-file',
    file('.env.e2e'),
    ...args,
  ],
  { stdio: 'inherit', env: { ...process.env, WEB_DIR: root } },
)
if (error) {
  console.error(`Couldn't run docker: ${error.message}`)
  process.exit(1)
}
process.exit(status ?? 1)
