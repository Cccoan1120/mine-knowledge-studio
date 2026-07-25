import { loadLocalEnv } from './loadEnv.js'
import { startRuntime } from './runtime.js'
import { validateProductionConfig } from './security.js'

loadLocalEnv()
validateProductionConfig()
startRuntime()
