import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from './AssistantPanel'
import type { Note } from '../types'

const note: Note = {
  id: 'note-1',
  title: '创作笔记',
  content: '可引用的原文',
  summary: '创作总结',
  tags: ['写作'],
  topic: '创作',
  source: '',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
  relatedNoteIds: [],
}

describe('AssistantPanel ask answer', () => {
  it('renders the knowledge answer separately from a conditional general supplement', () => {
    render(
      <AssistantPanel
        width={320}
        activeTab="ask"
        setActiveTab={vi.fn()}
        onResizeStart={vi.fn()}
        onCollapse={vi.fn()}
        note={note}
        notes={[note]}
        selectedSourceIds={[]}
        onToggleSource={vi.fn()}
        question="问一个问题"
        setQuestion={vi.fn()}
        answer={{
          knowledgeAnswer: '来自知识库的结论',
          generalSupplement: '模型补充信息',
          answer: '兼容答案',
          sourceIds: ['note-1'],
          citations: [{ noteId: 'note-1', title: '创作笔记', quote: '可引用的原文', sourceUrl: '' }],
          insufficient: true,
          mode: 'model',
          retrievalMode: 'hybrid',
          scope: { noteIds: ['note-1'], topics: [], tags: [] },
        }}
        outputType="outline"
        setOutputType={vi.fn()}
        generatedResult={null}
        busy=""
        onAnalyze={vi.fn()}
        onAsk={vi.fn()}
        onGenerate={vi.fn()}
        onSaveOutput={vi.fn()}
        onSelectNote={vi.fn()}
        onOpenCitation={vi.fn()}
      />,
    )

    expect(screen.getByText('来自我的知识库')).toBeTruthy()
    expect(screen.getByText('来自知识库的结论')).toBeTruthy()
    expect(screen.getByText('模型补充')).toBeTruthy()
    expect(screen.getByText('模型补充信息')).toBeTruthy()
    expect(screen.getByText('个人知识库中的证据不足，以下模型补充不由素材引用支持。')).toBeTruthy()
  })

  it('shows the whole-library scope and basic retrieval state by default', () => {
    render(
      <AssistantPanel
        width={320}
        activeTab="ask"
        setActiveTab={vi.fn()}
        onResizeStart={vi.fn()}
        onCollapse={vi.fn()}
        note={note}
        notes={[note]}
        selectedSourceIds={[]}
        onToggleSource={vi.fn()}
        question="问一个问题"
        setQuestion={vi.fn()}
        answer={null}
        outputType="outline"
        setOutputType={vi.fn()}
        generatedResult={null}
        busy=""
        onAnalyze={vi.fn()}
        onAsk={vi.fn()}
        onGenerate={vi.fn()}
        onSaveOutput={vi.fn()}
        onSelectNote={vi.fn()}
        onOpenCitation={vi.fn()}
      />,
    )

    expect(screen.getByText('整个素材库')).toBeTruthy()
    expect(screen.getByText('Basic retrieval')).toBeTruthy()
  })
})
