import type { AIAnalysis, AnswerResult, Note, OutputType } from '../types'
import { extractTitle } from '../utils/markdown'

export type PlatformAICapabilities = {
  chatConfigured: boolean
  visionConfigured: boolean
  transcriptionConfigured: boolean
  model: string
  visionModel: string
  transcriptionModel: string
}

export async function getPlatformAICapabilities(): Promise<PlatformAICapabilities> {
  const response = await fetch('/api/ai/capabilities')
  if (!response.ok) {
    return {
      chatConfigured: false,
      visionConfigured: false,
      transcriptionConfigured: false,
      model: 'fallback',
      visionModel: 'fallback',
      transcriptionModel: 'fallback',
    }
  }
  return response.json()
}

export async function analyzeNote(note: Note, existingNotes: Note[]): Promise<AIAnalysis> {
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: note.id }),
    })
    const data = (await response.json()) as { analysis?: AIAnalysis }
    return data.analysis ?? mockAnalyzeNote(note, existingNotes)
  } catch {
    return mockAnalyzeNote(note, existingNotes)
  }
}

export async function answerQuestion(question: string, notes: Note[]): Promise<AnswerResult> {
  try {
    const response = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    const data = (await response.json()) as { result?: AnswerResult }
    return data.result ?? mockAnswerQuestion(question, notes)
  } catch {
    return mockAnswerQuestion(question, notes)
  }
}

export async function generateOutput(type: OutputType, notes: Note[]): Promise<string> {
  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, noteIds: notes.map((note) => note.id) }),
    })
    const data = (await response.json()) as { markdown?: string }
    return data.markdown || mockGenerateOutput(type, notes)
  } catch {
    return mockGenerateOutput(type, notes)
  }
}

function mockAnalyzeNote(note: Note, existingNotes: Note[]): AIAnalysis {
  const text = `${note.title}\n${note.content}`
  const tags = [
    text.includes('AI') ? 'AI' : '',
    text.includes('创作') || text.includes('写作') ? '内容创作' : '',
    text.includes('Markdown') || text.includes('本地') ? '本地优先' : '',
    text.includes('产品') ? '产品思考' : '',
    text.includes('视频') || text.includes('字幕') ? '视频素材' : '',
    text.includes('播客') || text.includes('音频') ? '播客素材' : '',
    text.includes('素材') || text.includes('资料') ? '素材复用' : '',
  ].filter(Boolean)

  return {
    titleSuggestion: extractTitle(note.content, note.title),
    summary: summarize(note.content),
    tags: tags.length ? tags : ['待整理'],
    topic: text.includes('视频') ? '视频素材' : text.includes('播客') ? '播客素材' : '素材库',
    relatedNotes: existingNotes
      .filter((item) => item.id !== note.id)
      .map((item) => ({
        id: item.id,
        score: overlap(text, `${item.title} ${item.summary} ${item.tags.join(' ')}`),
        reason: `和「${item.title}」共享主题词或使用场景。`,
      }))
      .filter((item) => item.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ id, reason }) => ({ id, reason })),
    reasoning: '当前使用前端 fallback：根据关键词重叠、标题和正文结构生成整理结果。',
  }
}

function mockAnswerQuestion(question: string, notes: Note[]): AnswerResult {
  const scored = notes
    .map((note) => ({
      note,
      score: overlap(question, `${note.title} ${note.summary} ${note.content} ${note.tags.join(' ')}`),
    }))
    .filter((item) => item.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (!scored.length) {
    return {
      answer: '现有素材库里没有足够信息回答这个问题。可以先导入相关素材，或换一个更贴近当前素材的问题。',
      sourceIds: [],
      insufficient: true,
    }
  }

  return {
    answer: scored.map(({ note }) => `从「${note.title}」看：${note.summary || summarize(note.content)}`).join('\n\n'),
    sourceIds: scored.map(({ note }) => note.id),
    insufficient: false,
  }
}

function mockGenerateOutput(type: OutputType, notes: Note[]) {
  const titleMap = {
    outline: '文章大纲',
    'idea-card': '选题卡',
    'research-summary': '研究摘要',
    'wechat-draft': '公众号草稿',
    'xiaohongshu-note': '小红书笔记',
    'short-video-script': '短视频脚本',
  }
  const sections = notes
    .map((note, index) => `${index + 1}. ${note.title}\n   - ${note.summary || summarize(note.content)}`)
    .join('\n')
  return `# ${titleMap[type]}\n\n## 关键素材\n${sections}\n\n## 来源\n${notes.map((note) => `- ${note.title}`).join('\n')}\n`
}

function summarize(content: string) {
  return content
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
}

function overlap(left: string, right: string) {
  const rightTokens = new Set(tokenize(right))
  return tokenize(left).filter((token) => rightTokens.has(token)).length
}

function tokenize(value: string) {
  const normalized = value.toLowerCase()
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1)
  const cjkBigrams = Array.from(normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)).flatMap((match) => {
    const chars = Array.from(match[0])
    return chars.slice(0, -1).map((_, index) => chars.slice(index, index + 2).join(''))
  })

  return [...words, ...cjkBigrams]
}
