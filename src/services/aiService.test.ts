import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeNote, answerQuestion, generateOutput, getPlatformAICapabilities } from './aiService'
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
    expect(result.answer).toContain('素材')
  })

  it('returns an insufficient fallback answer for unrelated questions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const result = await answerQuestion('量子芯片制造流程是什么？', demoNotes)

    expect(result.insufficient).toBe(true)
    expect(result.sourceIds).toEqual([])
  })

  it('generates markdown output from selected notes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const output = await generateOutput('outline', demoNotes.slice(0, 2))

    expect(output).toContain('# 文章大纲')
    expect(output).toContain('来源')
  })

  it('uses server-generated markdown output when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ markdown: '# 服务端大纲\n\n- 可发布内容' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(generateOutput('outline', demoNotes.slice(0, 2))).resolves.toContain('服务端大纲')
  })
})
