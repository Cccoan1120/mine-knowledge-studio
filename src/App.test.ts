import { describe, expect, it } from 'vitest'
import { buildAskScope } from './utils/askScope'
import type { Note } from './types'

const note: Note = {
  id: 'note-1',
  title: '创作笔记',
  content: '',
  summary: '',
  tags: ['写作'],
  topic: '创作',
  source: '',
  createdAt: '',
  updatedAt: '',
  relatedNoteIds: [],
}

describe('buildAskScope', () => {
  it('keeps the whole library unscoped and builds current, topic, tag, and manual scopes', () => {
    expect(buildAskScope('library', note, ['创作'], ['写作'], ['note-1'])).toBeUndefined()
    expect(buildAskScope('current', note, [], [], [])).toEqual({ noteIds: ['note-1'] })
    expect(buildAskScope('topic', note, ['创作'], [], [])).toEqual({ topics: ['创作'] })
    expect(buildAskScope('tag', note, [], ['写作'], [])).toEqual({ tags: ['写作'] })
    expect(buildAskScope('manual', note, [], [], ['note-1'])).toEqual({ noteIds: ['note-1'] })
  })

  it('does not send decorative empty scope arrays', () => {
    expect(buildAskScope('topic', note, [], [], [])).toBeUndefined()
    expect(buildAskScope('tag', note, [], [], [])).toBeUndefined()
    expect(buildAskScope('manual', note, [], [], [])).toBeUndefined()
  })
})
