import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GovernancePanel } from './GovernancePanel'

const mocks = vi.hoisted(() => ({ list: vi.fn(), dismiss: vi.fn(), link: vi.fn(), apply: vi.fn() }))
vi.mock('../services/governanceService', () => ({
  listGovernanceCandidates: mocks.list,
  dismissGovernanceCandidate: mocks.dismiss,
  linkDuplicateCandidate: mocks.link,
  applyTagCandidate: mocks.apply,
}))

const note = { id: 'note-1', title: 'First', content: 'body', summary: '', tags: ['LLM'], topic: 'AI', source: '', createdAt: '', updatedAt: '', relatedNoteIds: [] }
const candidates = {
  duplicates: [{ fingerprint: 'a'.repeat(64), noteIds: ['note-1', 'note-2'], score: 1, reason: 'exact-content', notes: [
    { id: 'note-1', title: 'First', excerpt: 'same body', tags: ['LLM'], updatedAt: '' },
    { id: 'note-2', title: 'Second', excerpt: 'same body', tags: ['llm'], updatedAt: '' },
  ] }],
  tags: [{ fingerprint: 'b'.repeat(64), variants: [{ tag: 'LLM', count: 1, noteIds: ['note-1'] }, { tag: 'llm', count: 1, noteIds: ['note-2'] }], canonicalTag: 'LLM', affectedNoteCount: 2, reason: 'format-variant' }],
  stats: { noteCount: 2, tagCount: 2 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue(candidates)
  mocks.dismiss.mockResolvedValue(undefined)
  mocks.link.mockResolvedValue([])
  mocks.apply.mockResolvedValue([])
})

describe('GovernancePanel', () => {
  it('opens candidate notes and links while keeping both', async () => {
    const onOpenNote = vi.fn()
    const onNotesUpdated = vi.fn()
    render(<GovernancePanel notes={[note]} onClose={vi.fn()} onOpenNote={onOpenNote} onNotesUpdated={onNotesUpdated} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看素材 1' }))
    expect(onOpenNote).toHaveBeenCalledWith('note-1')
    fireEvent.click(screen.getByRole('button', { name: '关联并保留' }))
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith('a'.repeat(64)))
  })

  it('edits the canonical tag before applying it', async () => {
    render(<GovernancePanel notes={[note]} onClose={vi.fn()} onOpenNote={vi.fn()} onNotesUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /标签治理/ }))
    fireEvent.change(screen.getByLabelText('规范标签'), { target: { value: 'Language Models' } })
    fireEvent.click(screen.getByRole('button', { name: '统一为标签 Language Models' }))
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith('b'.repeat(64), 'Language Models'))
  })
})
