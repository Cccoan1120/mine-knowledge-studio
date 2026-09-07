import { createHash, randomUUID } from 'node:crypto'

export function prepareImportBatch(userId, inputs, ownedNotes = new Map()) {
  const ids = new Map()
  for (const input of inputs) {
    const key = input.importId || input.id
    if (key && ids.has(key)) throw Object.assign(new Error('导入数据包含重复标识。'), { status: 400 })
    if (key) {
      const snapshot = snapshotKey(input)
      const unchanged = ownedNotes.has(key) && snapshotKey(ownedNotes.get(key)) === snapshot
      ids.set(key, unchanged ? key : `import-${createHash('sha256').update(JSON.stringify([userId, key, snapshot])).digest('hex')}`)
    }
  }
  return inputs.map(input => ({
    ...input,
    id: ids.get(input.importId || input.id) || randomUUID(),
    userId,
    relatedNoteIds: (input.relatedNoteIds || []).map(id => ids.get(id) || id),
  }))
}

function snapshotKey(note) {
  return JSON.stringify([note.title || '未命名素材', note.content || '', note.summary || '', note.tags || [], note.topic || 'Inbox'])
}
