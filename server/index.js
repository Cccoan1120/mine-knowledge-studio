import { createImportApp } from './app.js'
import { loadLocalEnv } from './loadEnv.js'
import { validateProductionConfig } from './security.js'

loadLocalEnv()
validateProductionConfig()
const port = Number(process.env.PORT || process.env.MINE_IMPORT_PORT || 8787)
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')

createImportApp().listen(port, host, () => {
  console.log(`Mine service ready at http://${host}:${port}`)
})
