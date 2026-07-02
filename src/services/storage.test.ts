import { beforeEach, describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { loadNotes, saveNotes } from './storage'

const note: Note = {
  id: 'legacy-note',
  title: '旧数据',
  content: '# 旧数据',
  summary: '来自旧命名空间',
  tags: ['迁移'],
  topic: 'Inbox',
  source: 'test',
  createdAt: '2026-06-28T00:00:00.000Z',
  updatedAt: '2026-06-28T00:00:00.000Z',
  relatedNoteIds: [],
}

describe('note storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates notes from the old zhiji namespace to mine', () => {
    localStorage.setItem('zhiji-notes', JSON.stringify([note]))

    expect(loadNotes()[0].id).toBe('legacy-note')
    expect(localStorage.getItem('mine-notes')).toContain('legacy-note')
  })

  it('saves notes to the mine namespace', () => {
    saveNotes([note])

    expect(localStorage.getItem('mine-notes')).toContain('legacy-note')
  })

  it('fills missing fields from older saved notes', () => {
    localStorage.setItem('mine-notes', JSON.stringify([{ id: 'old-note', title: '旧笔记', content: '# 旧笔记' }]))

    const loadedNote = loadNotes()[0]

    expect(loadedNote.tags).toEqual([])
    expect(loadedNote.relatedNoteIds).toEqual([])
    expect(loadedNote.topic).toBe('Inbox')
    expect(localStorage.getItem('mine-notes')).toContain('relatedNoteIds')
  })
})
