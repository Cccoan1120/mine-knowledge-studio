import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Library,
  Link2,
  ListTree,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Note, WikiPage, WikiProject, WikiProjectSummary, WikiScope } from '../types'
import { createSaveQueue, type SaveStatus } from '../services/saveQueue'
import {
  acceptWikiCandidate,
  createWikiPage,
  createWikiProject,
  deleteWikiPage,
  deleteWikiProject,
  discardWikiCandidate,
  exportWikiPage,
  exportWikiProject,
  generateWikiOutline,
  generateWikiPages,
  getWikiProject,
  listWikiProjects,
  refreshWikiPage,
  updateWikiPage,
} from '../services/wikiService'

const RichMarkdownEditor = lazy(() => import('./RichMarkdownEditor').then((module) => ({ default: module.RichMarkdownEditor })))

type WikiWorkspaceProps = {
  notes: Note[]
  onOpenLibrary: () => void
  onOpenSource: (noteId: string, quote: string) => void
}

type ScopeMode = 'library' | 'topic' | 'tag' | 'manual'
type MobilePanel = 'projects' | 'pages' | 'page' | 'sources'

const activeStatuses = new Set(['outlining', 'generating'])

export function WikiWorkspace({ notes, onOpenLibrary, onOpenSource }: WikiWorkspaceProps) {
  const [projects, setProjects] = useState<WikiProjectSummary[]>([])
  const [project, setProject] = useState<WikiProject | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedPageId, setSelectedPageId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [scopeMode, setScopeMode] = useState<ScopeMode>('library')
  const [scopeValues, setScopeValues] = useState<string[]>([])
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTopic, setDraftTopic] = useState('')
  const [newPageTitle, setNewPageTitle] = useState('')
  const [readerMode, setReaderMode] = useState<'read' | 'edit'>('read')
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('projects')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const pageProjects = useRef(new Map<string, string>())
  const loadVersion = useRef(0)
  const [saveStates, setSaveStates] = useState<Record<string, SaveStatus>>({})
  const [saveQueue] = useState(() => createSaveQueue<Partial<Pick<WikiPage, 'title' | 'summary' | 'content' | 'position'>>, WikiPage>({
    delay: 650,
    save: (id, patch, expectedUpdatedAt) => updateWikiPage(pageProjects.current.get(id)!, id, { ...patch, expectedUpdatedAt }),
    onChange: (id, state, error) => {
      setSaveStates(current => ({ ...current, [id]: state }))
      if (error) setStatus(`${error.message} 草稿已保留，可重试保存或导出。`)
    },
    onSaved: (id, saved, pending) => {
      setProject(current => current ? { ...current, pages: current.pages.map(page => page.id === id ? { ...page, ...saved, ...pending } : page) } : current)
      setStatus('页面已保存。')
    },
  }))

  const selectedPage = project?.pages.find((page) => page.id === selectedPageId) ?? project?.pages[0] ?? null
  const topics = useMemo(() => Array.from(new Set(notes.map((note) => note.topic).filter(Boolean))).sort(), [notes])
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))).sort(), [notes])
  const activeProjectId = project?.id || ''
  const activeProjectStatus = project?.status || 'draft'

  const showError = useCallback((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Wiki 操作失败。')
  }, [])

  const loadProject = useCallback(async (projectId: string) => {
    const version = ++loadVersion.current
    try {
      const detail = await getWikiProject(projectId)
      if (version !== loadVersion.current) return
      for (const page of detail.pages) {
        pageProjects.current.set(page.id, detail.id)
        saveQueue.seed(page.id, page.updatedAt)
      }
      setProject(current => ({ ...detail, pages: detail.pages.map(page => {
        const local = current?.pages.find(item => item.id === page.id)
        return local && saveQueue.status(page.id) !== 'saved' ? local : page
      }) }))
      setProjects((current) => mergeProject(current, detail))
      setSelectedPageId((current) => detail.pages.some((page) => page.id === current) ? current : detail.pages[0]?.id || '')
    } catch (error) {
      showError(error)
    }
  }, [showError, saveQueue])

  useEffect(() => {
    let disposed = false
    listWikiProjects()
      .then((items) => {
        if (disposed) return
        setProjects(items)
        setSelectedProjectId((current) => current || items[0]?.id || '')
        setShowCreate(items.length === 0)
      })
      .catch(showError)
    return () => { disposed = true }
  }, [showError])

  useEffect(() => {
    if (!selectedProjectId) {
      setProject(null)
      return
    }
    void loadProject(selectedProjectId)
  }, [selectedProjectId, loadProject])

  useEffect(() => {
    if (!activeProjectId || !activeStatuses.has(activeProjectStatus)) return
    const timer = window.setInterval(() => void loadProject(activeProjectId), 1200)
    return () => window.clearInterval(timer)
  }, [activeProjectId, activeProjectStatus, loadProject])

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!saveQueue.hasUnsaved()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => { window.removeEventListener('beforeunload', preventLoss); loadVersion.current += 1 }
  }, [saveQueue])

  async function leaveWorkspace(action: () => void) {
    if (await saveQueue.flushAll()) action()
  }

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!draftTitle.trim() || !draftTopic.trim()) return
    setBusy('create-project')
    try {
      const created = await createWikiProject({
        title: draftTitle.trim(),
        topic: draftTopic.trim(),
        scope: buildScope(scopeMode, scopeValues),
      })
      setProjects((current) => mergeProject(current, created))
      setSelectedProjectId(created.id)
      setProject(created)
      setDraftTitle('')
      setDraftTopic('')
      setScopeMode('library')
      setScopeValues([])
      setShowCreate(false)
      setMobilePanel('pages')
      setStatus('Wiki 已创建，可以生成目录。')
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function requestOutline() {
    if (!project) return
    if (!await saveQueue.flushAll()) return
    setBusy('outline')
    try {
      await generateWikiOutline(project.id)
      await loadProject(project.id)
      setStatus('正在根据素材生成目录。')
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function requestPages(pageIds = project?.pages.filter((page) => ['planned', 'failed'].includes(page.status)).map((page) => page.id) ?? []) {
    if (!project || !pageIds.length) return
    if (!await saveQueue.flushAll()) return
    setBusy('pages')
    try {
      await generateWikiPages(project.id, pageIds)
      await loadProject(project.id)
      setStatus(`已提交 ${pageIds.length} 个页面生成任务。`)
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function addPage(event: FormEvent) {
    event.preventDefault()
    if (!project || !newPageTitle.trim()) return
    if (!await saveQueue.flushAll()) return
    setBusy('add-page')
    try {
      const page = await createWikiPage(project.id, { title: newPageTitle.trim(), summary: '' })
      setNewPageTitle('')
      await loadProject(project.id)
      setSelectedPageId(page.id)
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  function patchPageLocally(pageId: string, patch: Partial<WikiPage>) {
    setProject((current) => current ? {
      ...current,
      pages: current.pages.map((page) => page.id === pageId ? { ...page, ...patch } : page),
    } : current)
  }

  async function savePagePatch(pageId: string, patch: Partial<Pick<WikiPage, 'title' | 'summary' | 'content' | 'position'>>) {
    if (!project) return
    pageProjects.current.set(pageId, project.id)
    saveQueue.seed(pageId, project.pages.find(page => page.id === pageId)?.updatedAt)
    patchPageLocally(pageId, patch)
    saveQueue.enqueue(pageId, patch)
  }

  function updatePageContent(content: string) {
    if (!selectedPage) return
    void savePagePatch(selectedPage.id, { content })
  }

  async function movePage(page: WikiPage, direction: -1 | 1) {
    if (!project) return
    if (!await saveQueue.flushAll()) return
    const ordered = [...project.pages].sort((left, right) => left.position - right.position)
    const index = ordered.findIndex((item) => item.id === page.id)
    const target = ordered[index + direction]
    if (!target) return
    setBusy(`move-${page.id}`)
    try {
      await updateWikiPage(project.id, page.id, { position: target.position })
      await updateWikiPage(project.id, target.id, { position: page.position })
      await loadProject(project.id)
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function removePage(page: WikiPage) {
    if (!project || !window.confirm(`删除页面“${page.title}”？`)) return
    if (!await saveQueue.flushAll()) return
    try {
      await deleteWikiPage(project.id, page.id)
      saveQueue.forget(page.id)
      await loadProject(project.id)
    } catch (error) {
      showError(error)
    }
  }

  async function removeProject() {
    if (!project || !window.confirm(`删除 Wiki“${project.title}”及其全部页面？`)) return
    if (!await saveQueue.flushAll()) return
    try {
      await deleteWikiProject(project.id)
      for (const page of project.pages) saveQueue.forget(page.id)
      const remaining = projects.filter((item) => item.id !== project.id)
      setProjects(remaining)
      setProject(null)
      setSelectedProjectId(remaining[0]?.id || '')
      setShowCreate(remaining.length === 0)
    } catch (error) {
      showError(error)
    }
  }

  async function requestRefresh() {
    if (!project || !selectedPage) return
    if (!await saveQueue.flushAll()) return
    setBusy('refresh')
    try {
      await refreshWikiPage(project.id, selectedPage.id)
      await loadProject(project.id)
      setStatus('正在生成刷新候选，原页面不会被覆盖。')
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function resolveCandidate(action: 'accept' | 'discard') {
    if (!project || !selectedPage) return
    if (!await saveQueue.flushAll()) return
    setBusy('candidate')
    try {
      const page = action === 'accept'
        ? await acceptWikiCandidate(project.id, selectedPage.id)
        : await discardWikiCandidate(project.id, selectedPage.id)
      patchPageLocally(page.id, page)
      saveQueue.seed(page.id, page.updatedAt)
      setStatus(action === 'accept' ? '已采用刷新候选。' : '已保留当前版本。')
    } catch (error) {
      showError(error)
    } finally {
      setBusy('')
    }
  }

  async function downloadProject() {
    if (!project) return
    try {
      if (!await saveQueue.flushAll()) {
        downloadMarkdown(`${safeFileName(project.title)}-draft.md`, project.pages.map(page => `# ${page.title}\n\n${page.content}`).join('\n\n'))
        return
      }
      downloadMarkdown(`${safeFileName(project.title)}.md`, await exportWikiProject(project.id))
    } catch (error) {
      showError(error)
    }
  }

  async function downloadPage() {
    if (!project || !selectedPage) return
    try {
      if (!await saveQueue.flush(selectedPage.id)) {
        downloadMarkdown(`${safeFileName(selectedPage.title)}-draft.md`, `# ${selectedPage.title}\n\n${selectedPage.content}`)
        return
      }
      downloadMarkdown(`${safeFileName(selectedPage.title)}.md`, await exportWikiPage(project.id, selectedPage.id))
    } catch (error) {
      showError(error)
    }
  }

  async function selectProject(id: string) {
    if (!await saveQueue.flushAll()) return
    setSelectedProjectId(id)
    setMobilePanel('pages')
  }

  async function selectPage(id: string) {
    if (!await saveQueue.flushAll()) return
    setSelectedPageId(id)
    setReaderMode('read')
    setMobilePanel('page')
  }

  return (
    <main className={`wiki-shell mobile-${mobilePanel}`}>
      <aside className={`wiki-projects ${mobilePanel === 'projects' ? 'is-mobile-active' : ''}`} aria-label="Wiki 项目">
        <header className="wiki-brand">
          <img className="brand-mark" src="/mine-logo-small.png" alt="" />
          <div><strong>Mine</strong><span>知识工作室</span></div>
        </header>
        <nav className="mode-switch" aria-label="工作区切换">
          <button type="button" onClick={() => leaveWorkspace(onOpenLibrary)}><Library size={15} />素材库</button>
          <button type="button" className="is-active" aria-current="page"><BookOpen size={15} />Wiki</button>
        </nav>
        <div className="wiki-panel-heading">
          <div><strong>Wiki 项目</strong><span>{projects.length} 个</span></div>
          <button type="button" onClick={() => setShowCreate((value) => !value)} aria-label="新建 Wiki" title="新建 Wiki"><Plus size={16} /></button>
        </div>
        {showCreate ? (
          <form className="wiki-create-form" onSubmit={createProject}>
            <label>名称<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="例如：内容复用手册" required /></label>
            <label>研究主题<textarea value={draftTopic} onChange={(event) => setDraftTopic(event.target.value)} placeholder="说明这个 Wiki 要回答的问题" required /></label>
            <fieldset>
              <legend>素材范围</legend>
              <div className="wiki-scope-tabs">
                {(['library', 'topic', 'tag', 'manual'] as ScopeMode[]).map((mode) => (
                  <button type="button" key={mode} className={scopeMode === mode ? 'is-active' : ''} onClick={() => { setScopeMode(mode); setScopeValues([]) }}>
                    {scopeModeLabel(mode)}
                  </button>
                ))}
              </div>
              {scopeMode !== 'library' ? (
                <div className="wiki-scope-options">
                  {scopeOptions(scopeMode, notes, topics, tags).map((option) => (
                    <label key={option.value}>
                      <input type="checkbox" checked={scopeValues.includes(option.value)} onChange={() => setScopeValues(toggleValue(scopeValues, option.value))} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : <p>使用整个素材库。</p>}
            </fieldset>
            <div className="wiki-form-actions">
              <button type="button" onClick={() => setShowCreate(false)}>取消</button>
              <button type="submit" className="primary-action" disabled={busy === 'create-project'}>创建</button>
            </div>
          </form>
        ) : null}
        <div className="wiki-project-list">
          {projects.map((item) => (
            <button type="button" key={item.id} className={item.id === project?.id ? 'is-selected' : ''} onClick={() => selectProject(item.id)}>
              <strong>{item.title}</strong>
              <span>{projectStatusLabel(item.status)}</span>
              <small>{item.readyPageCount}/{item.pageCount} 页完成</small>
            </button>
          ))}
        </div>
      </aside>

      <aside className={`wiki-pages ${mobilePanel === 'pages' ? 'is-mobile-active' : ''}`} aria-label="Wiki 页面目录">
        <header className="wiki-column-header">
          <button type="button" className="wiki-mobile-back" onClick={() => setMobilePanel('projects')} aria-label="返回 Wiki 项目"><ArrowLeft size={16} /></button>
          <div><span>目录</span><strong>{project?.title || '选择 Wiki'}</strong></div>
          {project ? <button type="button" onClick={removeProject} aria-label="删除 Wiki" title="删除 Wiki"><Trash2 size={15} /></button> : null}
        </header>
        {project ? (
          <>
            <section className="wiki-outline-actions">
              {!project.pages.length ? (
                <button type="button" className="primary-action" onClick={requestOutline} disabled={busy === 'outline' || project.status === 'outlining'}>
                  <Sparkles size={15} />{project.status === 'outlining' ? '正在生成目录' : '生成目录'}
                </button>
              ) : (
                <button type="button" className="primary-action" onClick={() => requestPages()} disabled={busy === 'pages' || !project.pages.some((page) => ['planned', 'failed'].includes(page.status))}>
                  <Sparkles size={15} />生成待完成页面
                </button>
              )}
              <p>{scopeSummary(project.scope, notes)}</p>
            </section>
            <div className="wiki-page-tree">
              {project.pages.map((page, index) => (
                <div key={page.id} className={`wiki-tree-row ${page.id === selectedPage?.id ? 'is-selected' : ''}`}>
                  <button type="button" className="wiki-tree-select" onClick={() => selectPage(page.id)}>
                    <span className={`wiki-page-state state-${page.status}`} aria-label={pageStatusLabel(page.status)} />
                    <span><strong>{page.title}</strong><small>{page.stale ? '来源有更新' : pageStatusLabel(page.status)}</small></span>
                    <ChevronRight size={14} />
                  </button>
                  <div className="wiki-tree-tools">
                    <button type="button" disabled={index === 0 || busy === `move-${page.id}`} onClick={() => movePage(page, -1)} aria-label="上移页面"><ArrowUp size={13} /></button>
                    <button type="button" disabled={index === project.pages.length - 1 || busy === `move-${page.id}`} onClick={() => movePage(page, 1)} aria-label="下移页面"><ArrowDown size={13} /></button>
                    {page.status === 'failed' ? <button type="button" onClick={() => requestPages([page.id])} aria-label="重试生成"><RefreshCw size={13} /></button> : null}
                    <button type="button" onClick={() => removePage(page)} aria-label="删除页面"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <form className="wiki-add-page" onSubmit={addPage}>
              <input value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} placeholder="添加目录页" aria-label="新页面标题" />
              <button type="submit" disabled={!newPageTitle.trim() || busy === 'add-page'} aria-label="添加页面"><Plus size={15} /></button>
            </form>
          </>
        ) : <div className="wiki-empty-column">选择或新建一个 Wiki。</div>}
      </aside>

      <section className={`wiki-document ${mobilePanel === 'page' ? 'is-mobile-active' : ''}`} aria-label="Wiki 页面">
        {selectedPage && project ? (
          <>
            <header className="wiki-document-header">
              <button type="button" className="wiki-mobile-back" onClick={() => setMobilePanel('pages')} aria-label="返回页面目录"><ArrowLeft size={16} /></button>
              <div className="wiki-reader-tabs" role="tablist" aria-label="页面模式">
                <button type="button" role="tab" aria-selected={readerMode === 'read'} className={readerMode === 'read' ? 'is-active' : ''} onClick={() => setReaderMode('read')}>阅读</button>
                <button type="button" role="tab" aria-selected={readerMode === 'edit'} className={readerMode === 'edit' ? 'is-active' : ''} onClick={() => setReaderMode('edit')}>编辑</button>
              </div>
              <div className="wiki-document-actions">
                {selectedPage.status === 'ready' ? <button type="button" onClick={requestRefresh} disabled={busy === 'refresh' || selectedPage.hasCandidate} title="根据最新来源生成候选版本"><RefreshCw size={15} />刷新</button> : null}
                <button type="button" onClick={downloadPage} title="导出当前页面"><Download size={15} />导出</button>
                <button type="button" className="wiki-mobile-sources" onClick={() => setMobilePanel('sources')}><Link2 size={15} />来源</button>
              </div>
            </header>
            <article className="wiki-paper">
              <div className="wiki-save-state" aria-live="polite">
                <span>{({ saved: '已保存', dirty: '待保存', saving: '正在保存', error: '保存失败，草稿已保留' })[saveStates[selectedPage.id] || 'saved']}</span>
                <button type="button" onClick={() => saveQueue.flush(selectedPage.id)} disabled={saveStates[selectedPage.id] === 'saving'}><Save size={15} />{saveStates[selectedPage.id] === 'error' ? '重试保存' : '保存'}</button>
              </div>
              <textarea className="wiki-title-input" aria-label="Wiki 页面标题" value={selectedPage.title} rows={1} onChange={(event) => savePagePatch(selectedPage.id, { title: event.target.value })} />
              <textarea className="wiki-summary-input" aria-label="Wiki 页面说明" value={selectedPage.summary} rows={2} placeholder="页面说明" onChange={(event) => savePagePatch(selectedPage.id, { summary: event.target.value })} />
              {selectedPage.hasCandidate && selectedPage.candidateData ? (
                <CandidateComparison page={selectedPage} project={project} onSelectPage={selectPage} onAccept={() => resolveCandidate('accept')} onDiscard={() => resolveCandidate('discard')} busy={busy === 'candidate'} />
              ) : readerMode === 'edit' ? (
                <Suspense fallback={<div className="document-loading">正在加载编辑器...</div>}>
                  <RichMarkdownEditor markdown={selectedPage.content} onChange={updatePageContent} allowPreview={false} />
                </Suspense>
              ) : selectedPage.content ? (
                <MarkdownView content={selectedPage.content} project={project} onSelectPage={selectPage} onSelectCitation={(citation) => document.getElementById(`wiki-citation-${citation}`)?.focus()} />
              ) : (
                <div className="wiki-page-empty">
                  <FileText size={24} />
                  <strong>{pageStatusLabel(selectedPage.status)}</strong>
                  <p>{selectedPage.status === 'planned' ? '确认目录后生成这个页面。' : selectedPage.status === 'failed' ? errorLabel(selectedPage.lastError) : '页面正文生成后会显示在这里。'}</p>
                  {selectedPage.status === 'planned' || selectedPage.status === 'failed' ? <button type="button" className="primary-action" onClick={() => requestPages([selectedPage.id])}>生成此页</button> : null}
                </div>
              )}
            </article>
          </>
        ) : <div className="wiki-document-empty"><BookOpen size={28} /><strong>从目录选择一个页面</strong></div>}
      </section>

      <aside className={`wiki-inspector ${mobilePanel === 'sources' ? 'is-mobile-active' : ''}`} aria-label="引用与反向链接">
        <header className="wiki-column-header">
          <button type="button" className="wiki-mobile-back" onClick={() => setMobilePanel('page')} aria-label="返回 Wiki 页面"><ArrowLeft size={16} /></button>
          <div><span>来源检查</span><strong>{selectedPage?.citations.length || 0} 条引用</strong></div>
          {project ? <button type="button" onClick={downloadProject} aria-label="导出整个 Wiki" title="导出整个 Wiki"><Download size={15} /></button> : null}
        </header>
        {selectedPage && project ? (
          <>
            {(selectedPage.stale || selectedPage.sourceMissing) ? (
              <div className="wiki-source-warning" role="status">
                <strong>{selectedPage.sourceMissing ? '部分来源已删除' : '来源内容已有更新'}</strong>
                <span>刷新只会生成候选，不会覆盖当前编辑内容。</span>
              </div>
            ) : null}
            <section className="wiki-inspector-section">
              <h2>引用</h2>
              <div className="wiki-citations">
                {selectedPage.citations.map((citation, index) => (
                  <button type="button" id={`wiki-citation-${citation.id}`} key={citation.id} disabled={!citation.noteId} onClick={() => citation.noteId && leaveWorkspace(() => onOpenSource(citation.noteId!, citation.quote))}>
                    <span>[{index + 1}] {citation.noteTitle}</span>
                    <q>{citation.quote}</q>
                    <small>{citation.sourceMissing ? '原素材已删除' : '在素材库中定位'} <ExternalLink size={11} /></small>
                  </button>
                ))}
                {!selectedPage.citations.length ? <p>生成页面后，这里会列出逐字核验过的来源。</p> : null}
              </div>
            </section>
            <section className="wiki-inspector-section">
              <h2>反向链接</h2>
              <div className="wiki-backlinks">
                {selectedPage.backlinkPageIds.map((id) => {
                  const page = project.pages.find((item) => item.id === id)
                  return page ? <button type="button" key={id} onClick={() => selectPage(id)}><Link2 size={13} />{page.title}</button> : null
                })}
                {!selectedPage.backlinkPageIds.length ? <p>暂无页面链接到这里。</p> : null}
              </div>
            </section>
          </>
        ) : <div className="wiki-empty-column">选择页面后查看来源。</div>}
      </aside>

      <nav className="wiki-mobile-nav" aria-label="Wiki 移动导航">
        <button type="button" className={mobilePanel === 'projects' ? 'is-active' : ''} onClick={() => setMobilePanel('projects')}><BookOpen size={17} /><span>项目</span></button>
        <button type="button" className={mobilePanel === 'pages' ? 'is-active' : ''} onClick={() => setMobilePanel('pages')}><ListTree size={17} /><span>目录</span></button>
        <button type="button" className={mobilePanel === 'page' ? 'is-active' : ''} onClick={() => setMobilePanel('page')}><FileText size={17} /><span>页面</span></button>
        <button type="button" className={mobilePanel === 'sources' ? 'is-active' : ''} onClick={() => setMobilePanel('sources')}><Link2 size={17} /><span>来源</span></button>
      </nav>
      {status ? <p className="status-line" aria-live="polite">{status}</p> : null}
    </main>
  )
}

function CandidateComparison({ page, project, onSelectPage, onAccept, onDiscard, busy }: {
  page: WikiPage
  project: WikiProject
  onSelectPage: (id: string) => void
  onAccept: () => void
  onDiscard: () => void
  busy: boolean
}) {
  return (
    <section className="wiki-candidate">
      <header><div><strong>刷新候选</strong><span>比较后再决定是否替换当前版本</span></div><div><button type="button" onClick={onDiscard} disabled={busy}><X size={14} />保留当前</button><button type="button" className="primary-action" onClick={onAccept} disabled={busy}><Check size={14} />采用候选</button></div></header>
      <div className="wiki-compare-grid">
        <div><h3>当前版本</h3><MarkdownView content={page.content} project={project} onSelectPage={onSelectPage} /></div>
        <div><h3>刷新候选</h3><MarkdownView content={page.candidateData?.content || ''} project={project} onSelectPage={onSelectPage} /></div>
      </div>
    </section>
  )
}

function MarkdownView({ content, project, onSelectPage, onSelectCitation }: {
  content: string
  project: WikiProject
  onSelectPage: (id: string) => void
  onSelectCitation?: (id: string) => void
}) {
  const linked = content.replace(/\[\^([^\]]+)\]/g, (_match, id) => `[来源](#citation-${id})`)
  return (
    <div className="wiki-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href = '', children }) {
            const citationId = href.match(/^#citation-(.+)$/)?.[1]
            const slug = href.match(/^(?:\.\/)?(.+)\.md$/)?.[1]
            const target = slug ? project.pages.find((page) => page.slug === slug) : null
            return (
              <a href={href} onClick={(event) => {
                if (citationId) { event.preventDefault(); onSelectCitation?.(citationId) }
                if (target) { event.preventDefault(); onSelectPage(target.id) }
              }}>{children}</a>
            )
          },
        }}
      >{linked}</ReactMarkdown>
    </div>
  )
}

function buildScope(mode: ScopeMode, values: string[]): WikiScope {
  return {
    noteIds: mode === 'manual' ? values : [],
    topics: mode === 'topic' ? values : [],
    tags: mode === 'tag' ? values : [],
  }
}

function scopeOptions(mode: ScopeMode, notes: Note[], topics: string[], tags: string[]) {
  if (mode === 'topic') return topics.map((value) => ({ value, label: value }))
  if (mode === 'tag') return tags.map((value) => ({ value, label: `#${value}` }))
  return notes.map((note) => ({ value: note.id, label: note.title }))
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function scopeModeLabel(mode: ScopeMode) {
  return { library: '全部', topic: '主题', tag: '标签', manual: '手选' }[mode]
}

function scopeSummary(scope: WikiScope, notes: Note[]) {
  if (scope.noteIds.length) return `手选 ${scope.noteIds.filter((id) => notes.some((note) => note.id === id)).length} 条素材`
  if (scope.topics.length) return `主题：${scope.topics.join('、')}`
  if (scope.tags.length) return `标签：${scope.tags.map((tag) => `#${tag}`).join('、')}`
  return `整个素材库，共 ${notes.length} 条素材`
}

function mergeProject(projects: WikiProjectSummary[], project: WikiProject) {
  const summary: WikiProjectSummary = project
  return [summary, ...projects.filter((item) => item.id !== project.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function projectStatusLabel(status: WikiProjectSummary['status']) {
  return {
    draft: '待生成目录',
    outlining: '正在生成目录',
    'outline-ready': '目录待确认',
    generating: '正在生成页面',
    'partial-failure': '部分页面失败',
    ready: '已完成',
  }[status]
}

function pageStatusLabel(status: WikiPage['status']) {
  return { planned: '待生成', queued: '等待生成', generating: '正在生成', ready: '已完成', failed: '生成失败' }[status]
}

function errorLabel(code: string | null) {
  return {
    LLM_NOT_CONFIGURED: '平台 LLM 尚未配置。',
    INDEX_NOT_READY: '当前素材范围的索引尚未完成。',
    INSUFFICIENT_EVIDENCE: '素材不足，无法生成有依据的页面。',
    INVALID_CITATIONS: '引用未通过逐字核验，请重试。',
    MODEL_REQUEST_FAILED: '模型请求失败，请重试。',
  }[code || ''] || '生成未完成，请重试。'
}

function safeFileName(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || 'wiki'
}

function downloadMarkdown(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
