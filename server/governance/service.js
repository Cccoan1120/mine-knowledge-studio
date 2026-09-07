import { detectGovernanceCandidates } from './candidates.js'
import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'

let activeWorkers = 0

export function createGovernanceService({ store }) {
  const cache = new Map()
  async function current(userId) {
    const [notes, dismissals] = await Promise.all([
      store.listNotes(userId),
      store.listGovernanceDismissals(userId),
    ])
    const key = createHash('sha256').update(JSON.stringify([
      notes.map(note => [note.id, note.updatedAt, note.tags]),
      dismissals.map(item => [item.kind, item.fingerprint]),
    ])).digest('hex')
    const cached = cache.get(userId)
    if (cached?.key === key) return cached.result
    const result = notes.length < 200
      ? Promise.resolve(detectGovernanceCandidates(notes, dismissals))
      : new Promise((resolve, reject) => {
        if (activeWorkers >= 2) { reject(Object.assign(new Error('素材治理正在处理中，请稍后重试。'), { status: 503 })); return }
        const worker = new Worker(new URL('./candidateWorker.js', import.meta.url), { workerData: { notes, dismissals } })
        activeWorkers += 1
        const timer = setTimeout(() => { void worker.terminate(); reject(new Error('素材治理计算超时，请减少范围后重试。')) }, 60_000)
        worker.once('message', resolve)
        worker.once('error', reject)
        worker.once('exit', code => { activeWorkers -= 1; clearTimeout(timer); if (code !== 0) reject(new Error('素材治理计算未完成。')) })
      })
    cache.set(userId, { key, result })
    if (cache.size > 50) cache.delete(cache.keys().next().value)
    try { return await result } catch (error) { if (cache.get(userId)?.result === result) cache.delete(userId); throw error }
  }

  function findCandidate(candidates, kind, fingerprint) {
    const collection = kind === 'duplicate' ? candidates.duplicates : candidates.tags
    const candidate = collection.find((item) => item.fingerprint === fingerprint)
    if (!candidate) throw conflict('该治理候选已发生变化，请刷新后重试。')
    return candidate
  }

  return {
    list: current,

    async dismiss(userId, input) {
      const candidates = await current(userId)
      findCandidate(candidates, input.kind, input.fingerprint)
      await store.saveGovernanceDismissal(userId, input)
      return { ok: true }
    },

    async linkDuplicate(userId, input) {
      const candidate = findCandidate(await current(userId), 'duplicate', input.fingerprint)
      const notes = await store.linkGovernanceDuplicates(userId, {
        fingerprint: candidate.fingerprint,
        noteIds: candidate.noteIds,
      })
      if (!notes) throw conflict('候选素材已发生变化，请刷新后重试。')
      return { notes }
    },

    async applyTagCandidate(userId, input) {
      const candidate = findCandidate(await current(userId), 'tag', input.fingerprint)
      const notes = await store.applyGovernanceTags(userId, {
        fingerprint: candidate.fingerprint,
        variants: candidate.variants.map((item) => item.tag),
        canonicalTag: input.canonicalTag,
      })
      return { notes }
    },
  }
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 })
}
