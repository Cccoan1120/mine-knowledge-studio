import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { loadLocalEnv } from './loadEnv.js'
import { validateProductionConfig } from './security.js'
import { startRuntime } from './runtime.js'

loadLocalEnv()
validateProductionConfig()

if (process.env.DATABASE_URL?.trim()) {
  const require = createRequire(import.meta.url)
  const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    timeout: 120_000,
  })
  if (migration.error || migration.status !== 0) throw new Error('Database migration failed; application startup cancelled.')
}

startRuntime()
