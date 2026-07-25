import { afterEach, describe, expect, it, vi } from 'vitest'
import * as aiService from './aiService'
import { analyzeNote, answerQuestion, ensureIndex, generateOutput, getIndexStatus, getPlatformAICapabilities, retryIndex } from './aiService'
import { demoNotes } from '../data/demoNotes'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI service proxy', () => {
  it('reads platform AI capability state from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            chatConfigured: true,
            visionConfigured: false,
            transcriptionConfigured: true,
            model: 'deepseek-chat',
            visionModel: 'fallback',
            transcriptionModel: 'whisper-1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(getPlatformAICapabilities()).resolves.toMatchObject({
      chatConfigured: true,
      model: 'deepseek-chat',
      transcriptionModel: 'whisper-1',
    })
  })

  it('analyzes a note through the server endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            analysis: {
              titleSuggestion: '整理后的标题',
              summary: '这是一段摘要。',
              tags: ['AI', '素材'],
              topic: '素材库',
              relatedNotes: [],
              reasoning: '服务端生成。',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await analyzeNote(demoNotes[0], demoNotes)

    expect(result.titleSuggestion).toBe('整理后的标题')
    expect(result.tags).toContain('AI')
  })

  it('falls back to local answering when the server is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const result = await answerQuestion('AI 笔记产品有什么机会？', demoNotes)

    expect(result.insufficient).toBe(false)
    expect(result.sourceIds.length).toBeGreaterThan(0)
    expect(result.citations[0].quote.length).toBeGreaterThan(0)
    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('素材')
  })

  it('uses safe basic retrieval capabilities when the capability request is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(getPlatformAICapabilities()).resolves.toMatchObject({
      embeddingConfigured: false,
      retrievalMode: 'basic',
    })
  })

  it('exposes index operations through the client service boundary', () => {
    expect(typeof (aiService as unknown as { ensureIndex?: unknown }).ensureIndex).toBe('function')
    expect(typeof (aiService as unknown as { getIndexStatus?: unknown }).getIndexStatus).toBe('function')
    expect(typeof (aiService as unknown as { retryIndex?: unknown }).retryIndex).toBe('function')
  })

  it('uses the authenticated index endpoints and returns their status', async () => {
    const status = { mode: 'hybrid', total: 3, pending: 1, processing: 0, ready: 2, failed: 0, missing: 0 }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ queued: 1, status }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ retried: 1, status }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureIndex()).resolves.toEqual(status)
    await expect(getIndexStatus()).resolves.toEqual(status)
    await expect(retryIndex()).resolves.toEqual(status)
    expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/ai/index/ensure', 'POST'],
      ['/api/ai/index/status', undefined],
      ['/api/ai/index/retry', 'POST'],
    ])
  })

  it('rejects index HTTP errors without returning a local result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '暂时不可用' }), { status: 401 })))

    await expect(getIndexStatus()).rejects.toThrow('暂时不可用')
  })

  it('sends the most recent six conversation turns and the selected scope', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          result: {
            knowledgeAnswer: '服务器回答',
            generalSupplement: '',
            answer: '服务器回答',
            sourceIds: [],
            citations: [],
            insufficient: false,
            mode: 'model',
            retrievalMode: 'hybrid',
            scope: { noteIds: [], topics: ['创作'], tags: [] },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await answerQuestion(
      '继续说明',
      demoNotes,
      [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: '5' },
        { role: 'assistant', content: '6' },
        { role: 'user', content: '7' },
      ],
      { topics: ['创作'] },
    )

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(request).toEqual({
      question: '继续说明',
      history: [
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: '5' },
        { role: 'assistant', content: '6' },
        { role: 'user', content: '7' },
      ],
      scope: { topics: ['创作'] },
    })
  })

  it('returns an insufficient fallback answer for unrelated questions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const result = await answerQuestion('量子芯片制造流程是什么？', demoNotes)

    expect(result.insufficient).toBe(true)
    expect(result.sourceIds).toEqual([])
  })

  it('keeps the selected scope on a local fallback answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const result = await answerQuestion('AI 素材', demoNotes, [], { topics: ['内容创作'] })

    expect(result.scope).toEqual({ topics: ['内容创作'] })
  })

  it('generates markdown output from selected notes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const output = await generateOutput('outline', demoNotes.slice(0, 2))

    expect(output.markdown).toContain('# 文章大纲')
    expect(output.markdown).toContain('来源引用')
    expect(output.citations).toHaveLength(2)
    expect(output.mode).toBe('fallback')
  })

  it('uses server-generated markdown output when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { markdown: '# 服务端大纲\n\n- 可发布内容', citations: [], mode: 'model' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(generateOutput('outline', demoNotes.slice(0, 2))).resolves.toMatchObject({
      markdown: expect.stringContaining('服务端大纲'),
      mode: 'model',
    })
  })
})
