import { useEffect, useRef, useState } from 'react'
import { Check, Eye, Link2, Tags, X } from 'lucide-react'
import type { GovernanceCandidates, Note, TagGovernanceCandidate } from '../types'
import { applyTagCandidate, dismissGovernanceCandidate, linkDuplicateCandidate, listGovernanceCandidates } from '../services/governanceService'

type Props = {
  notes: Note[]
  onClose: () => void
  onOpenNote: (noteId: string) => void
  onNotesUpdated: (notes: Note[]) => void
}

const emptyCandidates: GovernanceCandidates = { duplicates: [], tags: [], stats: { noteCount: 0, tagCount: 0 } }

export function GovernancePanel({ notes, onClose, onOpenNote, onNotesUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<'duplicates' | 'tags'>('duplicates')
  const [candidates, setCandidates] = useState<GovernanceCandidates>(emptyCandidates)
  const [canonicalTags, setCanonicalTags] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])

  async function refresh() {
    try {
      const next = await listGovernanceCandidates()
      setCandidates(next)
      setCanonicalTags((current) => Object.fromEntries(next.tags.map((item) => [item.fingerprint, current[item.fingerprint] ?? item.canonicalTag])))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '候选加载失败。')
    } finally {
      setLoading(false)
    }
  }

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key)
    setMessage('')
    try {
      await action()
      setMessage(success)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请重试。')
    } finally {
      setBusy('')
    }
  }

  const visible = activeTab === 'duplicates' ? candidates.duplicates : candidates.tags

  return (
    <div className="governance-backdrop" role="presentation">
      <section ref={panelRef} className="governance-panel" role="dialog" aria-modal="true" aria-label="素材治理" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose() }
        if (event.key !== 'Tab') return
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
        <header className="governance-header">
          <div>
            <p>素材库 · {notes.length} 条素材</p>
            <h2>素材治理</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭素材治理"><X size={18} /></button>
        </header>

        <div className="governance-tabs" role="group" aria-label="治理类型">
          <button type="button" aria-pressed={activeTab === 'duplicates'} onClick={() => setActiveTab('duplicates')}>
            重复素材 <span>{candidates.duplicates.length}</span>
          </button>
          <button type="button" aria-pressed={activeTab === 'tags'} onClick={() => setActiveTab('tags')}>
            标签治理 <span>{candidates.tags.length}</span>
          </button>
        </div>

        <div className="governance-body">
          {loading ? <p className="governance-empty">正在检查素材库...</p> : null}
          {!loading && !visible.length ? <p className="governance-empty">当前没有需要处理的候选。</p> : null}
          {activeTab === 'duplicates' ? candidates.duplicates.map((candidate) => (
            <article className="duplicate-review" key={candidate.fingerprint}>
              <div className="candidate-heading">
                <div><strong>{duplicateReason(candidate.reason)}</strong><span>相似度 {Math.round(candidate.score * 100)}%</span></div>
                <button type="button" onClick={() => run(candidate.fingerprint, () => dismissGovernanceCandidate('duplicate', candidate.fingerprint), '已标记为不是重复。')} disabled={busy === candidate.fingerprint}>
                  <X size={15} />不是重复
                </button>
              </div>
              <div className="duplicate-columns">
                {candidate.notes.map((note, index) => (
                  <section className="duplicate-note" key={note.id}>
                    <small>素材 {index + 1}</small>
                    <h3>{note.title}</h3>
                    <p>{note.excerpt || '暂无正文摘要'}</p>
                    <div className="candidate-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                    <button type="button" onClick={() => onOpenNote(note.id)}><Eye size={15} />查看素材 {index + 1}</button>
                  </section>
                ))}
              </div>
              <div className="candidate-primary-row">
                <button type="button" className="governance-primary" disabled={busy === candidate.fingerprint} onClick={() => run(candidate.fingerprint, async () => {
                  onNotesUpdated(await linkDuplicateCandidate(candidate.fingerprint))
                }, '已建立双向关联并保留两条素材。')}>
                  <Link2 size={16} />关联并保留
                </button>
              </div>
            </article>
          )) : candidates.tags.map((candidate) => (
            <TagReview key={candidate.fingerprint} candidate={candidate} value={canonicalTags[candidate.fingerprint] ?? candidate.canonicalTag}
              busy={busy === candidate.fingerprint}
              onChange={(value) => setCanonicalTags((current) => ({ ...current, [candidate.fingerprint]: value }))}
              onDismiss={() => run(candidate.fingerprint, () => dismissGovernanceCandidate('tag', candidate.fingerprint), '已忽略该标签候选。')}
              onApply={() => run(candidate.fingerprint, async () => {
                onNotesUpdated(await applyTagCandidate(candidate.fingerprint, (canonicalTags[candidate.fingerprint] ?? candidate.canonicalTag).trim()))
              }, '标签已统一。')} />
          ))}
        </div>
        <p className="governance-status" aria-live="polite">{message}</p>
      </section>
    </div>
  )
}

function TagReview({ candidate, value, busy, onChange, onDismiss, onApply }: {
  candidate: TagGovernanceCandidate
  value: string
  busy: boolean
  onChange: (value: string) => void
  onDismiss: () => void
  onApply: () => void
}) {
  return (
    <article className="tag-review">
      <div className="tag-review-summary">
        <div className="tag-review-icon"><Tags size={17} /></div>
        <div><strong>{candidate.reason === 'format-variant' ? '格式或大小写不一致' : '可能的拼写差异'}</strong><span>涉及 {candidate.affectedNoteCount} 条素材</span></div>
      </div>
      <div className="tag-variants">{candidate.variants.map((variant) => <span key={variant.tag}>#{variant.tag} <small>{variant.count}</small></span>)}</div>
      <label className="canonical-tag-field">规范标签<input value={value} maxLength={50} onChange={(event) => onChange(event.target.value)} /></label>
      <div className="tag-review-actions">
        <button type="button" onClick={onDismiss} disabled={busy}><X size={15} />忽略</button>
        <button type="button" className="governance-primary" onClick={onApply} disabled={busy || !value.trim()} aria-label={`统一为标签 ${value.trim()}`}><Check size={15} />统一标签</button>
      </div>
    </article>
  )
}

function duplicateReason(reason: 'exact-content' | 'same-title' | 'similar-content') {
  if (reason === 'exact-content') return '正文完全相同'
  if (reason === 'same-title') return '标题相同且正文相似'
  return '正文高度相似'
}
