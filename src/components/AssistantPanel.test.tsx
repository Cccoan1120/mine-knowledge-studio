import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
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

function renderAsk(overrides: Partial<ComponentProps<typeof AssistantPanel>> = {}) {
  return render(
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
      {...overrides}
    />,
  )
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
    expect(screen.getByText('个人知识库中的证据不足。以下模型补充不由素材引用支持。')).toBeTruthy()
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

  it('keeps an answer label tied to the returned whole-library scope after the selector changes', () => {
    renderAsk({
      askScopeMode: 'current',
      answer: {
        answer: '答案',
        sourceIds: [],
        citations: [],
        insufficient: false,
        mode: 'model',
        scope: { noteIds: [], topics: [], tags: [] },
      },
    })

    expect(screen.getByText('实际范围：整个素材库')).toBeTruthy()
  })

  it('shows an evidence warning even when insufficient evidence has no model supplement', () => {
    renderAsk({
      answer: {
        answer: '答案',
        sourceIds: [],
        citations: [],
        insufficient: true,
        mode: 'model',
        generalSupplement: '',
      },
    })

    expect(screen.getByText('个人知识库中的证据不足。')).toBeTruthy()
    expect(screen.queryByText('模型补充')).toBeNull()
  })

  it('hides a general supplement when evidence is sufficient', () => {
    renderAsk({
      answer: {
        answer: '答案',
        sourceIds: [],
        citations: [],
        insufficient: false,
        mode: 'model',
        generalSupplement: '不应显示的补充',
      },
    })

    expect(screen.queryByText('模型补充')).toBeNull()
    expect(screen.queryByText('不应显示的补充')).toBeNull()
  })

  it('shows each pending index state and retries the trusted action', () => {
    const onRetryIndex = vi.fn()
    renderAsk({
      indexStatus: { mode: 'hybrid', total: 10, ready: 4, pending: 2, processing: 3, missing: 1, failed: 5 },
      onRetryIndex,
    })

    expect(screen.getByText('待处理 2')).toBeTruthy()
    expect(screen.getByText('处理中 3')).toBeTruthy()
    expect(screen.getByText('待补全 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试 5 项失败' }))
    expect(onRetryIndex).toHaveBeenCalledTimes(1)
  })

  it('opens a trusted citation when the citation button is clicked', () => {
    const onOpenCitation = vi.fn()
    const citation = { noteId: 'note-1', title: '创作笔记', quote: '可引用的原文', sourceUrl: '' }
    renderAsk({
      answer: { answer: '答案', sourceIds: ['note-1'], citations: [citation], insufficient: false, mode: 'model' },
      onOpenCitation,
    })

    fireEvent.click(screen.getByRole('button', { name: /创作笔记/ }))
    expect(onOpenCitation).toHaveBeenCalledWith(citation)
  })
})
