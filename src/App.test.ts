import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAskScope } from './utils/askScope'
import type { Note } from './types'
import Root from './App'

const serviceMocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(),
  ensureIndex: vi.fn(),
  getIndexStatus: vi.fn(),
  retryIndex: vi.fn(),
  getPlatformAICapabilities: vi.fn(),
  analyzeNote: vi.fn(),
  generateOutput: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  bulkImportNotes: vi.fn(),
}))

vi.mock('./services/aiService', () => serviceMocks)
vi.mock('./services/authService', () => ({
  getCurrentUser: serviceMocks.getCurrentUser,
  login: serviceMocks.login,
  logout: serviceMocks.logout,
  register: serviceMocks.register,
}))
vi.mock('./services/noteService', () => ({
  listNotes: serviceMocks.listNotes,
  createNote: serviceMocks.createNote,
  updateNote: serviceMocks.updateNote,
  deleteNote: serviceMocks.deleteNote,
  bulkImportNotes: serviceMocks.bulkImportNotes,
}))
vi.mock('./services/storage', () => ({ loadLocalNotesForMigration: () => [], markLocalNotesMigrated: vi.fn() }))

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

const user = { id: 'user-1', email: 'mine@example.com', createdAt: '', updatedAt: '' }
const settledIndex = { mode: 'hybrid' as const, total: 1, ready: 1, pending: 0, processing: 0, missing: 0, failed: 0 }
const failedIndex = { ...settledIndex, failed: 1 }
const answer = (text: string) => ({
  answer: text,
  knowledgeAnswer: text,
  generalSupplement: '',
  sourceIds: [],
  citations: [],
  insufficient: false,
  mode: 'model' as const,
  retrievalMode: 'hybrid' as const,
  scope: { noteIds: [], topics: [], tags: [] },
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  serviceMocks.getCurrentUser.mockResolvedValue(user)
  serviceMocks.login.mockResolvedValue(user)
  serviceMocks.listNotes.mockResolvedValue([note])
  serviceMocks.getPlatformAICapabilities.mockResolvedValue({
    chatConfigured: true,
    visionConfigured: false,
    transcriptionConfigured: false,
    model: 'model',
    visionModel: 'fallback',
    transcriptionModel: 'fallback',
    embeddingConfigured: true,
    retrievalMode: 'hybrid',
  })
  serviceMocks.ensureIndex.mockResolvedValue(settledIndex)
  serviceMocks.getIndexStatus.mockResolvedValue(settledIndex)
  serviceMocks.retryIndex.mockResolvedValue(settledIndex)
})

afterEach(() => {
  document.body.innerHTML = ''
})

async function openAsk() {
  render(createElement(Root))
  await screen.findByDisplayValue('创作笔记')
  fireEvent.click(await screen.findByRole('button', { name: '问答' }, { timeout: 5000 }))
  return screen.findByPlaceholderText('针对素材库提一个问题')
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

describe('Ask session interactions', () => {
  it('retries failed index work without ensuring it again', async () => {
    serviceMocks.getIndexStatus.mockResolvedValue(failedIndex)
    serviceMocks.retryIndex.mockResolvedValue(failedIndex)
    await openAsk()
    await screen.findByRole('button', { name: '重试 1 项失败' })

    fireEvent.click(screen.getByRole('button', { name: '重试 1 项失败' }))

    await waitFor(() => expect(serviceMocks.retryIndex).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(serviceMocks.ensureIndex).toHaveBeenCalledTimes(1)
  })

  it('resets Ask scope to the whole library after sign-out and sign-in', async () => {
    await openAsk()
    fireEvent.change(screen.getByLabelText('问答范围'), { target: { value: 'manual' } })
    expect((screen.getByLabelText('问答范围') as HTMLSelectElement).value).toBe('manual')

    fireEvent.click(screen.getByRole('button', { name: '账号与 AI' }))
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    await screen.findByRole('button', { name: '登录 Mine' })
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: user.email } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录 Mine' }))
    await screen.findByDisplayValue('创作笔记')
    fireEvent.click(screen.getByRole('button', { name: '问答' }))

    expect((screen.getByLabelText('问答范围') as HTMLSelectElement).value).toBe('library')
  })

  it('appends history only after success and clears it with New conversation', async () => {
    serviceMocks.answerQuestion.mockResolvedValueOnce(answer('答案一')).mockResolvedValueOnce(answer('答案二')).mockResolvedValueOnce(answer('答案三'))
    const question = await openAsk()

    fireEvent.change(question, { target: { value: '问题一' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('答案一')
    fireEvent.change(question, { target: { value: '问题二' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('答案二')
    expect(serviceMocks.answerQuestion.mock.calls[1][2]).toEqual([
      { role: 'user', content: '问题一' },
      { role: 'assistant', content: '答案一' },
    ])

    fireEvent.click(screen.getByRole('button', { name: '新建对话' }))
    expect(screen.queryByText('答案二')).toBeNull()
    expect((question as HTMLTextAreaElement).value).toBe('')
    fireEvent.change(question, { target: { value: '问题三' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('答案三')
    expect(serviceMocks.answerQuestion.mock.calls[2][2]).toEqual([])
  })

  it('does not append a failed request to the next follow-up history', async () => {
    serviceMocks.answerQuestion
      .mockResolvedValueOnce(answer('答案一'))
      .mockRejectedValueOnce(new Error('请求失败'))
      .mockResolvedValueOnce(answer('答案三'))
    const question = await openAsk()

    fireEvent.change(question, { target: { value: '问题一' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('答案一')
    fireEvent.change(question, { target: { value: '问题二' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('请求失败')
    fireEvent.change(question, { target: { value: '问题三' } })
    fireEvent.click(screen.getByRole('button', { name: '基于来源回答' }))
    await screen.findByText('答案三')

    expect(serviceMocks.answerQuestion.mock.calls[2][2]).toEqual([
      { role: 'user', content: '问题一' },
      { role: 'assistant', content: '答案一' },
    ])
  })
})
