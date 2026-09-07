export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

type Entry<P> = {
  pending: P
  hasPending: boolean
  version?: string
  status: SaveStatus
  timer?: ReturnType<typeof setTimeout>
  running?: Promise<boolean>
  error?: Error
}

export function createSaveQueue<P extends object, R extends { updatedAt: string }>({
  save,
  onChange = () => {},
  onSaved = () => {},
  delay = 700,
}: {
  save: (id: string, patch: P, version?: string) => Promise<R>
  onChange?: (id: string, status: SaveStatus, error?: Error) => void
  onSaved?: (id: string, result: R, pending: P, submitted: P) => void
  delay?: number
}) {
  const entries = new Map<string, Entry<P>>()
  const empty = () => ({} as P)

  function entry(id: string) {
    let value = entries.get(id)
    if (!value) {
      value = { pending: empty(), hasPending: false, status: 'saved' }
      entries.set(id, value)
    }
    return value
  }

  function emit(id: string, item: Entry<P>, status: SaveStatus, error?: Error) {
    item.status = status
    item.error = error
    onChange(id, status, error)
  }

  async function flush(id: string): Promise<boolean> {
    const item = entry(id)
    clearTimeout(item.timer)
    if (item.running) return item.running
    if (!item.hasPending) return true
    item.running = (async () => {
      while (item.hasPending) {
        const patch = item.pending
        item.pending = empty()
        item.hasPending = false
        emit(id, item, 'saving')
        try {
          const result = await save(id, patch, item.version)
          item.version = result.updatedAt
          onSaved(id, result, item.pending, patch)
        } catch (error) {
          item.pending = { ...patch, ...item.pending }
          item.hasPending = true
          emit(id, item, 'error', error instanceof Error ? error : new Error('保存失败。'))
          return false
        }
      }
      emit(id, item, 'saved')
      return true
    })()
    try { return await item.running } finally { item.running = undefined }
  }

  return {
    seed(id: string, version?: string) {
      const item = entry(id)
      if (!item.hasPending && !item.running) item.version = version || undefined
    },
    enqueue(id: string, patch: P) {
      const item = entry(id)
      item.pending = { ...item.pending, ...patch }
      item.hasPending = true
      clearTimeout(item.timer)
      if (item.status === 'error') return onChange(id, 'error', item.error)
      emit(id, item, item.running ? 'saving' : 'dirty')
      item.timer = setTimeout(() => void flush(id), delay)
    },
    flush,
    async flushAll() {
      return (await Promise.all([...entries.keys()].map(flush))).every(Boolean)
    },
    pending(id: string) { return entries.get(id)?.pending || empty() },
    status(id: string): SaveStatus { return entries.get(id)?.status || 'saved' },
    error(id: string) { return entries.get(id)?.error },
    hasUnsaved() { return [...entries.values()].some(item => item.hasPending || item.running) },
    forget(id: string) { clearTimeout(entries.get(id)?.timer); entries.delete(id) },
    clear() { for (const item of entries.values()) clearTimeout(item.timer); entries.clear() },
  }
}
