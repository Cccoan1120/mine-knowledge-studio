export function selectContext(candidates, { maxChunks = 8, maxNotes = 5, maxChunksPerNote = 2 } = {}) {
  const selected = []
  const chunksByNote = new Map()

  for (const candidate of candidates) {
    const noteId = String(candidate.noteId)
    const chunkCount = chunksByNote.get(noteId) ?? 0
    if (chunkCount >= maxChunksPerNote) continue
    if (!chunksByNote.has(noteId) && chunksByNote.size >= maxNotes) continue

    selected.push(candidate)
    chunksByNote.set(noteId, chunkCount + 1)
    if (selected.length === maxChunks) break
  }

  return selected
}
