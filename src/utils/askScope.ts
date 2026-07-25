import type { AskScope, AskScopeMode, Note } from '../types'

export function buildAskScope(
  mode: AskScopeMode,
  currentNote: Note | undefined,
  topics: string[],
  tags: string[],
  noteIds: string[],
): AskScope | undefined {
  if (mode === 'current' && currentNote) return { noteIds: [currentNote.id] }
  if (mode === 'topic' && topics.length) return { topics }
  if (mode === 'tag' && tags.length) return { tags }
  if (mode === 'manual' && noteIds.length) return { noteIds }
  return undefined
}

export function askScopeReady(mode: AskScopeMode, scope: AskScope | undefined) {
  return mode === 'library' || Boolean(scope)
}
