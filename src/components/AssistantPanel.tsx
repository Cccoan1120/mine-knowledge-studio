import { Bot, FileText, Loader2, MessageSquareText, PanelRightClose, Save, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AnswerResult, Citation, GeneratedResult, Note, OutputType } from '../types'

type AssistantPanelProps = {
  width: number
  activeTab: 'organize' | 'ask' | 'output'
  setActiveTab: (tab: 'organize' | 'ask' | 'output') => void
  onResizeStart: () => void
  onCollapse: () => void
  note: Note | undefined
  notes: Note[]
  selectedSourceIds: string[]
  onToggleSource: (id: string) => void
  question: string
  setQuestion: (value: string) => void
  answer: AnswerResult | null
  outputType: OutputType
  setOutputType: (value: OutputType) => void
  generatedResult: GeneratedResult | null
  busy: string
  onAnalyze: () => void
  onAsk: () => void
  onGenerate: () => void
  onSaveOutput: () => void
  onSelectNote: (id: string) => void
  onOpenCitation: (citation: Citation) => void
}

export function AssistantPanel({
  width,
  activeTab,
  setActiveTab,
  onResizeStart,
  onCollapse,
  note,
  notes,
  selectedSourceIds,
  onToggleSource,
  question,
  setQuestion,
  answer,
  outputType,
  setOutputType,
  generatedResult,
  busy,
  onAnalyze,
  onAsk,
  onGenerate,
  onSaveOutput,
  onSelectNote,
  onOpenCitation,
}: AssistantPanelProps) {
  return (
    <aside className="assistant-panel" style={{ width }} aria-label="素材助手">
      <button type="button" className="resize-handle" onMouseDown={onResizeStart} aria-label="调整 AI 面板宽度" />

      <header className="assistant-header">
        <div>
          <p>素材助手</p>
          <h2>基于已选来源</h2>
        </div>
        <button type="button" className="assistant-collapse" onClick={onCollapse} aria-label="收起 AI 面板" title="收起 AI 面板">
          <PanelRightClose size={17} />
        </button>
      </header>

      <div className="assistant-tabs">
        <button type="button" className={activeTab === 'organize' ? 'is-active' : ''} onClick={() => setActiveTab('organize')}>
          <Sparkles size={15} />
          收纳
        </button>
        <button type="button" className={activeTab === 'ask' ? 'is-active' : ''} onClick={() => setActiveTab('ask')}>
          <MessageSquareText size={15} />
          问答
        </button>
        <button type="button" className={activeTab === 'output' ? 'is-active' : ''} onClick={() => setActiveTab('output')}>
          <FileText size={15} />
          输出
        </button>
      </div>

      <details className="source-picker">
        <summary>引用来源 <span>{selectedSourceIds.length}/20</span></summary>
        <div>
          {notes.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={selectedSourceIds.includes(source.id)}
                onChange={() => onToggleSource(source.id)}
              />
              <span>{source.title}</span>
            </label>
          ))}
        </div>
      </details>

      {activeTab === 'organize' ? (
        <section className="assistant-section">
          <div className="assistant-card">
            <p className="section-kicker">摘要</p>
            <p>{note?.summary || '点击“AI 收纳”后，Mine 会生成摘要、标签、主题和关联素材。'}</p>
          </div>

          <div className="assistant-card">
            <p className="section-kicker">标签</p>
            <div className="tag-row">
              {(note?.tags.length ? note.tags : ['待整理']).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>

          <div className="assistant-card">
            <p className="section-kicker">关联素材</p>
            <div className="related-list">
              {note?.relatedNoteIds.length ? (
                note.relatedNoteIds.map((id) => {
                  const related = notes.find((item) => item.id === id)
                  if (!related) return null
                  return (
                    <button type="button" key={id} onClick={() => onSelectNote(id)}>
                      <strong>{related.title}</strong>
                      <span>共享主题或使用场景</span>
                    </button>
                  )
                })
              ) : (
                <p>还没有关联建议。</p>
              )}
            </div>
          </div>

          <button type="button" className="primary-action" onClick={onAnalyze} disabled={busy === 'analysis'}>
            {busy === 'analysis' ? <Loader2 className="spin" size={16} /> : <Bot size={16} />}
            AI 收纳当前素材
          </button>
        </section>
      ) : null}

      {activeTab === 'ask' ? (
        <section className="assistant-section">
          <textarea value={question} placeholder="针对素材库提一个问题" onChange={(event) => setQuestion(event.target.value)} />
          <button type="button" className="primary-action" onClick={onAsk} disabled={busy === 'question'}>
            {busy === 'question' ? <Loader2 className="spin" size={16} /> : <Bot size={16} />}
            基于来源回答
          </button>
          {answer ? (
            <div className="answer-box">
              <span className={`result-mode result-mode-${answer.mode}`}>
                {answer.mode === 'model' ? '平台模型生成' : '本地规则生成'}
              </span>
              <p>{answer.answer}</p>
              <div className="citation-list">
                {answer.citations.map((citation) => (
                  <button type="button" key={`${citation.noteId}-${citation.quote}`} onClick={() => onOpenCitation(citation)}>
                    <strong>{citation.title}</strong>
                    <span>“{citation.quote}”</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'output' ? (
        <section className="assistant-section">
          <select value={outputType} onChange={(event) => setOutputType(event.target.value as OutputType)}>
            <option value="outline">文章大纲</option>
            <option value="idea-card">选题卡</option>
            <option value="research-summary">研究摘要</option>
            <option value="wechat-draft">公众号草稿</option>
            <option value="xiaohongshu-note">小红书笔记</option>
            <option value="short-video-script">短视频脚本</option>
          </select>
          <button type="button" className="primary-action" onClick={onGenerate} disabled={busy === 'output'}>
            {busy === 'output' ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            基于当前列表生成
          </button>
          {generatedResult ? (
            <div className="output-box">
              <span className={`result-mode result-mode-${generatedResult.mode}`}>
                {generatedResult.mode === 'model' ? '平台模型生成' : '本地规则生成'}
              </span>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedResult.markdown}</ReactMarkdown>
              <div className="citation-list">
                {generatedResult.citations.map((citation) => (
                  <button type="button" key={citation.noteId} onClick={() => onOpenCitation(citation)}>
                    <strong>{citation.title}</strong>
                    <span>“{citation.quote}”</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={onSaveOutput}>
                <Save size={16} />
                保存为新素材
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}
