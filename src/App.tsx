import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileDown,
  FilePenLine,
  FilePlus2,
  FolderOpen,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Save,
  Search,
  Sparkles,
  Settings2,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import { analyzeNote, answerQuestion, ensureIndex, generateOutput, getIndexStatus, getPlatformAICapabilities, retryIndex, type PlatformAICapabilities } from './services/aiService'
import { getCurrentUser, login, logout, register } from './services/authService'
import { bulkImportNotes, createNote as createCloudNote, deleteNote as deleteCloudNote, listNotes, updateNote as updateCloudNote } from './services/noteService'
import { loadLocalNotesForMigration, markLocalNotesMigrated } from './services/storage'
import type { AnswerResult, AskHistoryItem, AskScopeMode, Citation, CurrentUser, GeneratedResult, ImportResult, IndexStatus, Note, OutputType } from './types'
import { askScopeReady, buildAskScope } from './utils/askScope'
import { extractTitle, parseMarkdownToNote, serializeNoteToMarkdown } from './utils/markdown'

type DirectoryHandle = {
  values(): AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
}

type FileSystemFileHandle = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

type FileSystemDirectoryHandle = {
  kind: 'directory'
  name: string
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirectoryHandle>
  }
}

const assistantWidthKey = 'mine-assistant-width'
const assistantVisibleKey = 'mine-assistant-visible'
const libraryVisibleKey = 'mine-library-visible'
const AssistantPanel = lazy(() =>
  import('./components/AssistantPanel').then((module) => ({ default: module.AssistantPanel })),
)
const ImportPanel = lazy(() =>
  import('./components/ImportPanel').then((module) => ({ default: module.ImportPanel })),
)
const RichMarkdownEditor = lazy(() =>
  import('./components/RichMarkdownEditor').then((module) => ({ default: module.RichMarkdownEditor })),
)

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('全部标签')
  const [tagInput, setTagInput] = useState('')
  const [question, setQuestion] = useState('我收集过哪些关于素材复用和内容输出的观点？')
  const [answer, setAnswer] = useState<AnswerResult | null>(null)
  const [conversation, setConversation] = useState<AskHistoryItem[]>([])
  const [askScopeMode, setAskScopeMode] = useState<AskScopeMode>('library')
  const [askTopics, setAskTopics] = useState<string[]>([])
  const [askTags, setAskTags] = useState<string[]>([])
  const [askSelectedSourceIds, setAskSelectedSourceIds] = useState<string[]>([])
  const [outputType, setOutputType] = useState<OutputType>('outline')
  const [generatedResult, setGeneratedResult] = useState<GeneratedResult | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [focusRequest, setFocusRequest] = useState<{ noteId: string; quote: string; token: number } | null>(null)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('请登录后开始使用你的专属素材库。')
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState('')
  const [aiCapabilities, setAiCapabilities] = useState<PlatformAICapabilities | null>(null)
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [indexPollingCycle, setIndexPollingCycle] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [localMigrationNotes, setLocalMigrationNotes] = useState<Note[]>([])
  const [showLibrary, setShowLibrary] = useState(() => localStorage.getItem(libraryVisibleKey) !== 'false')
  const [showAssistant, setShowAssistant] = useState(() => localStorage.getItem(assistantVisibleKey) !== 'false')
  const [showGraph, setShowGraph] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [activeAssistantTab, setActiveAssistantTab] = useState<'organize' | 'ask' | 'output'>('organize')
  const [assistantWidth, setAssistantWidth] = useState(() => {
    const saved = Number(localStorage.getItem(assistantWidthKey))
    return Number.isFinite(saved) ? Math.min(520, Math.max(320, saved)) : 320
  })
  const [vaultHandle, setVaultHandle] = useState<DirectoryHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveVersionRef = useRef(0)
  const autosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSaveRef = useRef<Record<string, Partial<Note>>>({})

  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0]
  const tags = useMemo(
    () => ['全部标签', ...Array.from(new Set(notes.flatMap((note) => note.tags))).sort((a, b) => a.localeCompare(b))],
    [notes],
  )
  const visibleNotes = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return notes.filter((note) => {
      const matchesTag = selectedTag === '全部标签' || note.tags.includes(selectedTag)
      const haystack = `${note.title} ${note.summary} ${note.tags.join(' ')} ${note.content}`.toLowerCase()
      return matchesTag && (!needle || haystack.includes(needle))
    })
  }, [notes, search, selectedTag])

  const editorMarkdown = selectedNote ? removeLeadingTitleHeading(selectedNote.content, selectedNote.title) : ''

  useEffect(() => {
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser)
        if (!currentUser) return
        void refreshNotes()
        void refreshAICapabilities()
        setLocalMigrationNotes(loadLocalNotesForMigration())
      })
      .finally(() => setAuthLoading(false))
  }, [])
  useEffect(() => {
    if (!user || !libraryLoaded) return

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const poll = async () => {
      try {
        const nextStatus = await getIndexStatus()
        if (disposed) return
        failures = 0
        setIndexStatus(nextStatus)
        if (
          nextStatus.mode !== 'basic'
          && (nextStatus.pending || nextStatus.processing || nextStatus.missing)
        ) {
          timer = setTimeout(poll, 5000)
        }
      } catch (error) {
        if (!disposed) {
          setStatus(error instanceof Error ? error.message : '索引状态暂时不可用。')
          const retryDelay = Math.min(5000 * (2 ** failures), 30_000)
          failures += 1
          timer = setTimeout(poll, retryDelay)
        }
      }
    }

    if (indexPollingCycle === 0) {
      void ensureIndex().then(poll).catch((error) => {
        if (!disposed) {
          setStatus(error instanceof Error ? error.message : '索引初始化暂时不可用。')
          timer = setTimeout(poll, 5000)
        }
      })
    } else {
      void poll()
    }

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [user, libraryLoaded, indexPollingCycle])

  useEffect(() => localStorage.setItem(assistantWidthKey, String(assistantWidth)), [assistantWidth])
  useEffect(() => localStorage.setItem(assistantVisibleKey, String(showAssistant)), [showAssistant])
  useEffect(() => localStorage.setItem(libraryVisibleKey, String(showLibrary)), [showLibrary])
  useEffect(() => {
    if (!selectedNote) {
      setSelectedSourceIds([])
      return
    }
    setSelectedSourceIds((current) => {
      const available = current.filter((id) => notes.some((note) => note.id === id))
      const next = available.includes(selectedNote.id)
        ? available
        : Array.from(new Set([selectedNote.id, ...selectedNote.relatedNoteIds]))
            .filter((id) => notes.some((note) => note.id === id))
            .slice(0, 20)
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next
    })
  }, [selectedNote, notes])
  useEffect(() => {
    if (!selectedNote || editorMarkdown === selectedNote.content) return
    const updatedAt = new Date().toISOString()
    setNotes((current) =>
      current.map((note) => (note.id === selectedNote.id ? { ...note, content: editorMarkdown, updatedAt } : note)),
    )
    void updateCloudNote(selectedNote.id, { content: editorMarkdown, updatedAt })
      .then(restartIndexStatusRefresh)
      .catch(() => setStatus('云端保存失败，请稍后重试。'))
  }, [selectedNote, editorMarkdown])

  if (authLoading) {
    return <main className="auth-shell">正在检查登录状态...</main>
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-label="Mine 登录注册">
          <div className="auth-copy">
            <div className="auth-brand">
              <img className="brand-mark" src="/mine-logo.png" alt="" />
              <div>
                <strong>Mine</strong>
                <span>素材工作室</span>
              </div>
            </div>
            <div className="auth-statement">
              <h1>把外部信息变成你的专属知识库</h1>
              <p>收进来，留下出处，在需要写作和思考的时候重新找到它。</p>
            </div>
            <div className="auth-footnote">
              <span>为内容创作者与知识工作者设计</span>
              <span>Mine 2026</span>
            </div>
          </div>
          <form className="auth-form" onSubmit={submitAuth}>
            <header className="auth-form-header">
              <h2>{authMode === 'login' ? '欢迎回来' : '创建你的素材库'}</h2>
              <p>{authMode === 'login' ? '继续整理你的素材和想法。' : '从第一条值得留下的内容开始。'}</p>
            </header>
            <div className="auth-tabs" aria-label="认证方式">
              <button type="button" className={authMode === 'login' ? 'is-active' : ''} onClick={() => setAuthMode('login')}>
                登录
              </button>
              <button type="button" className={authMode === 'register' ? 'is-active' : ''} onClick={() => setAuthMode('register')}>
                注册
              </button>
            </div>
            <div className="auth-field">
              <label htmlFor="auth-email">邮箱</label>
              <input
                id="auth-email"
                type="email"
                value={authEmail}
                placeholder="name@example.com"
                autoComplete="email"
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">密码</label>
              <input
                id="auth-password"
                type="password"
                value={authPassword}
                placeholder={authMode === 'login' ? '输入密码' : '至少 8 位字符'}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </div>
            {authError ? <p className="auth-error">{authError}</p> : null}
            <button type="submit" className="primary-action" disabled={busy === 'auth'}>
              {authMode === 'login' ? '登录 Mine' : '创建账号'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  async function refreshNotes() {
    const cloudNotes = await listNotes()
    setNotes(cloudNotes)
    setSelectedId((current) => (cloudNotes.some((note) => note.id === current) ? current : cloudNotes[0]?.id ?? ''))
    setStatus(cloudNotes.length ? `已加载 ${cloudNotes.length} 条云端素材。` : '你的云端素材库还是空的，可以新建或导入第一条素材。')
    setLibraryLoaded(true)
  }

  async function refreshAICapabilities() {
    setAiCapabilities(await getPlatformAICapabilities())
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setBusy('auth')

    try {
      const nextUser =
        authMode === 'register'
          ? await register(authEmail.trim(), authPassword)
          : await login(authEmail.trim(), authPassword)
      setUser(nextUser)
      await refreshNotes()
      await refreshAICapabilities()
      setLocalMigrationNotes(loadLocalNotesForMigration())
      setStatus(`已登录：${nextUser.email}`)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function signOut() {
    await logout()
    setUser(null)
    setNotes([])
    setSelectedId('')
    setAnswer(null)
    setConversation([])
    setQuestion('')
    setAskScopeMode('library')
    setAskTopics([])
    setAskTags([])
    setAskSelectedSourceIds([])
    setIndexStatus(null)
    setLibraryLoaded(false)
    setIndexPollingCycle(0)
    setStatus('已退出登录。')
  }

  async function migrateLocalNotes() {
    if (!localMigrationNotes.length) return
    setBusy('migration')
    try {
      const imported = await bulkImportNotes(localMigrationNotes)
      markLocalNotesMigrated()
      setLocalMigrationNotes([])
      const cloudNotes = [...imported, ...notes]
      setNotes(cloudNotes)
      setSelectedId(imported[0]?.id ?? cloudNotes[0]?.id ?? '')
      restartIndexStatusRefresh()
      setStatus(`已迁移 ${imported.length} 条本地素材到当前账号。`)
    } catch {
      setStatus('本地素材迁移失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  function updateSelectedNote(patch: Partial<Note>) {
    if (!selectedNote) return
    const updatedAt = new Date().toISOString()
    const nextPatch = { ...patch, updatedAt }
    setNotes((current) =>
      current.map((note) =>
        note.id === selectedNote.id ? { ...note, ...nextPatch } : note,
      ),
    )
    scheduleCloudSave(selectedNote.id, nextPatch)
  }

  function scheduleCloudSave(noteId: string, patch: Partial<Note>) {
    pendingSaveRef.current[noteId] = { ...pendingSaveRef.current[noteId], ...patch }
    setSaveState('dirty')

    if (autosaveTimersRef.current[noteId]) clearTimeout(autosaveTimersRef.current[noteId])
    autosaveTimersRef.current[noteId] = setTimeout(() => {
      void flushCloudSave(noteId)
    }, 700)
  }

  async function flushCloudSave(noteId: string) {
    const patch = pendingSaveRef.current[noteId]
    if (!patch) return

    delete pendingSaveRef.current[noteId]
    if (autosaveTimersRef.current[noteId]) {
      clearTimeout(autosaveTimersRef.current[noteId])
      delete autosaveTimersRef.current[noteId]
    }

    await persistCloudSave(noteId, patch)
  }

  async function persistCloudSave(noteId: string, patch: Partial<Note>) {
    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    setSaveState('saving')

    try {
      await updateCloudNote(noteId, patch)
      if (Object.prototype.hasOwnProperty.call(patch, 'content')) restartIndexStatusRefresh()
      if (saveVersionRef.current !== version) return
      setSaveState('saved')
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      if (saveVersionRef.current !== version) return
      setSaveState('error')
      setStatus('云端保存失败，请稍后重试。')
    }
  }

  async function saveSelectedNote() {
    if (!selectedNote) return
    const updatedAt = new Date().toISOString()
    const patch = {
      title: selectedNote.title,
      content: selectedNote.content,
      summary: selectedNote.summary,
      tags: selectedNote.tags,
      topic: selectedNote.topic,
      source: selectedNote.source,
      relatedNoteIds: selectedNote.relatedNoteIds,
      updatedAt,
    }

    if (autosaveTimersRef.current[selectedNote.id]) {
      clearTimeout(autosaveTimersRef.current[selectedNote.id])
      delete autosaveTimersRef.current[selectedNote.id]
    }
    delete pendingSaveRef.current[selectedNote.id]

    setNotes((current) => current.map((note) => (note.id === selectedNote.id ? { ...note, updatedAt } : note)))
    await persistCloudSave(selectedNote.id, patch)
  }

  async function createNote(content = '', relatedNoteIds: string[] = []) {
    const now = new Date().toISOString()
    const title = extractTitle(content, '未命名素材')
    const note = await createCloudNote({
      title,
      content,
      summary: '',
      tags: [],
      topic: 'Inbox',
      source: '手动创建',
      createdAt: now,
      updatedAt: now,
      relatedNoteIds,
    })

    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
    restartIndexStatusRefresh()
    setStatus('已创建新素材。')
  }

  async function deleteSelectedNote() {
    if (!selectedNote) return
    await deleteCloudNote(selectedNote.id)
    const nextNotes = notes.filter((note) => note.id !== selectedNote.id)
    setNotes(nextNotes)
    setSelectedId(nextNotes[0]?.id ?? '')
    restartIndexStatusRefresh()
    setStatus(`已删除「${selectedNote.title}」。`)
  }

  function addTag() {
    if (!selectedNote) return
    const nextTag = tagInput.trim().replace(/^#/, '')
    if (!nextTag || selectedNote.tags.includes(nextTag)) {
      setTagInput('')
      return
    }

    updateSelectedNote({ tags: [...selectedNote.tags, nextTag] })
    setTagInput('')
    setStatus(`已添加标签 #${nextTag}。`)
  }

  function removeTag(tag: string) {
    if (!selectedNote) return
    updateSelectedNote({ tags: selectedNote.tags.filter((item) => item !== tag) })
    if (selectedTag === tag) setSelectedTag('全部标签')
    setStatus(`已移除标签 #${tag}。`)
  }

  async function importMarkdownFiles(files: FileList | null) {
    if (!files?.length) return
    const imported: Note[] = []

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.md')) continue
      imported.push(parseMarkdownToNote(await file.text(), file.name))
    }

    if (!imported.length) {
      setStatus('没有发现可导入的 Markdown 文件。')
      return
    }

    const cloudNotes = await bulkImportNotes(imported)
    setNotes((current) => [...cloudNotes, ...current])
    setSelectedId(cloudNotes[0].id)
    restartIndexStatusRefresh()
    setStatus(`已导入 ${cloudNotes.length} 条 Markdown 素材。`)
  }

  async function openLocalVault() {
    if (!window.showDirectoryPicker) {
      setStatus('当前浏览器不支持目录授权，可使用 Markdown 导入/导出完成演示。')
      return
    }

    const directory = await window.showDirectoryPicker()
    const imported: Note[] = []

    for await (const handle of directory.values()) {
      if (handle.kind === 'file' && handle.name.endsWith('.md')) {
        const file = await handle.getFile()
        imported.push(parseMarkdownToNote(await file.text(), handle.name))
      }
    }

    setVaultHandle(directory)
    if (imported.length) {
      const cloudNotes = await bulkImportNotes(imported)
      setNotes((current) => [...cloudNotes, ...current])
      setSelectedId(cloudNotes[0].id)
      restartIndexStatusRefresh()
    setStatus(`已打开本地库，并导入 ${cloudNotes.length} 条 Markdown 素材。`)
    } else {
      setStatus('已获得目录授权，但目录里暂时没有 Markdown 文件。')
    }
  }

  async function saveVault() {
    if (!vaultHandle) {
      setStatus('尚未打开本地目录。你可以先使用“打开本地库”，或导出单篇 Markdown。')
      return
    }

    for (const note of notes) {
      const handle = await vaultHandle.getFileHandle(`${safeFileName(note.title)}.md`, { create: true })
      const writer = await handle.createWritable()
      await writer.write(serializeNoteToMarkdown(note))
      await writer.close()
    }

    setStatus(`已写入 ${notes.length} 篇 Markdown 到本地库。`)
  }

  async function runAnalysis() {
    if (!selectedNote) return
    setShowAssistant(true)
    setActiveAssistantTab('organize')
    setBusy('analysis')
    setStatus(aiCapabilities?.chatConfigured ? '正在调用平台 AI 收纳助手。' : '平台 AI 未配置，使用 fallback 演示。')

    try {
      const analysis = await analyzeNote(selectedNote, notes)
      updateSelectedNote({
        title: analysis.titleSuggestion,
        summary: analysis.summary,
        tags: mergeTags(selectedNote.tags, analysis.tags),
        topic: analysis.topic,
        relatedNoteIds: analysis.relatedNotes.map((item) => item.id),
      })
      setStatus(`已整理「${analysis.titleSuggestion}」：${analysis.reasoning}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '平台 AI 暂时不可用。')
    } finally {
      setBusy('')
    }
  }

  async function askKnowledgeBase() {
    if (!question.trim()) return
    const scope = buildAskScope(askScopeMode, selectedNote, askTopics, askTags, askSelectedSourceIds)
    if (!askScopeReady(askScopeMode, scope)) {
      setStatus('请先完成问答范围选择。')
      return
    }
    setActiveAssistantTab('ask')
    setBusy('question')

    try {
      const result = await answerQuestion(question, notes, conversation.slice(-6), scope)
      setAnswer(result)
      setConversation((current) => [
        ...current,
        { role: 'user', content: question.trim() },
        { role: 'assistant', content: result.knowledgeAnswer || result.answer },
      ])
      setQuestion('')
      setStatus(
        result.insufficient
          ? '当前所选来源不足，已给出缺口提示。'
          : result.mode === 'model'
            ? '平台模型已基于可验证来源完成回答。'
            : '平台模型未配置，已使用本地规则生成带来源回答。',
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '平台 AI 暂时不可用。')
    } finally {
      setBusy('')
    }
  }

  async function createOutput() {
    const selectedSources = notes.filter((note) => selectedSourceIds.includes(note.id))
    const sourceNotes = selectedSources.length ? selectedSources : visibleNotes.length ? visibleNotes : notes
    setActiveAssistantTab('output')
    setBusy('output')

    try {
      const result = await generateOutput(outputType, sourceNotes)
      setGeneratedResult(result)
      setStatus(result.mode === 'model' ? '平台模型已生成带来源输出。' : '已使用本地规则生成带来源输出。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '平台 AI 暂时不可用。')
    } finally {
      setBusy('')
    }
  }

  async function saveOutputAsNote() {
    if (!generatedResult?.markdown.trim()) return
    await createNote(generatedResult.markdown, generatedResult.citations.map((citation) => citation.noteId))
    setStatus('已把输出结果保存为新素材。')
  }

  function toggleSource(noteId: string) {
    setSelectedSourceIds((current) => {
      if (current.includes(noteId)) return current.filter((id) => id !== noteId)
      if (current.length >= 20) {
        setStatus('一次最多选择 20 条来源素材。')
        return current
      }
      return [...current, noteId]
    })
  }

  function toggleAskSource(noteId: string) {
    setAskSelectedSourceIds((current) => {
      if (current.includes(noteId)) return current.filter((id) => id !== noteId)
      if (current.length >= 20) {
        setStatus('一次最多选择 20 条素材。')
        return current
      }
      return [...current, noteId]
    })
  }

  function startNewConversation() {
    setConversation([])
    setAnswer(null)
    setQuestion('')
  }

  function restartIndexStatusRefresh() {
    setIndexPollingCycle((current) => current + 1)
  }

  async function retryFailedIndex() {
    setBusy('index-retry')
    try {
      const nextStatus = await retryIndex()
      setIndexStatus(nextStatus)
      if (nextStatus.pending || nextStatus.processing || nextStatus.missing) setIndexPollingCycle((current) => current + 1)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '索引重试失败。')
    } finally {
      setBusy('')
    }
  }

  function openCitation(citation: Citation) {
    setSelectedId(citation.noteId)
    setFocusRequest({ noteId: citation.noteId, quote: citation.quote, token: Date.now() })
  }

  function downloadSelectedNote() {
    if (!selectedNote) return
    downloadMarkdown(`${safeFileName(selectedNote.title)}.md`, serializeNoteToMarkdown(selectedNote))
  }

  function startAssistantResize() {
    function onMove(event: MouseEvent) {
      const nextWidth = Math.min(520, Math.max(320, window.innerWidth - event.clientX))
      setAssistantWidth(nextWidth)
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('is-resizing-panel')
    }

    document.body.classList.add('is-resizing-panel')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <main
      className={`app-shell ${showLibrary ? '' : 'library-collapsed'} ${showAssistant ? 'assistant-open' : 'assistant-collapsed'}`}
      style={{ '--assistant-width': `${assistantWidth}px` } as CSSProperties}
    >
      {showLibrary ? (
        <aside className="sidebar" aria-label="素材库导航">
          <div className="brand-block">
            <img className="brand-mark" src="/mine-logo.png" alt="" />
            <div>
              <h1>Mine</h1>
              <p>素材工作室</p>
            </div>
            <button type="button" className="sidebar-collapse" onClick={() => setShowLibrary(false)} aria-label="收起素材区">
              <PanelLeftClose size={17} />
            </button>
          </div>

          <div className="nav-actions">
            <button type="button" onClick={() => createNote()}>
              <FilePlus2 size={17} />
              新建素材
            </button>
            <button type="button" onClick={() => setShowImportPanel(true)}>
              <FileDown size={17} />
              导入素材
            </button>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".md,text/markdown"
              multiple
              onChange={(event) => importMarkdownFiles(event.target.files)}
            />
          </div>

          <div className="search-box">
            <Search size={16} />
            <input value={search} placeholder="搜索素材" onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="list-summary">
            <strong>{selectedTag === '全部标签' ? '素材库' : `#${selectedTag}`}</strong>
            <span>{visibleNotes.length} 条</span>
          </div>

          <div className="notes-scroll sidebar-notes">
            {visibleNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                className={`note-row ${note.id === selectedNote?.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(note.id)}
              >
                <strong>{note.title}</strong>
                <span>{note.summary || note.content.replace(/\s+/g, ' ').slice(0, 76) || '空白素材'}</span>
                <small>{note.tags.slice(0, 2).map((tag) => `#${tag}`).join('  ') || note.topic}</small>
              </button>
            ))}
            {!visibleNotes.length ? <p className="library-empty">当前筛选下没有素材。</p> : null}
          </div>

          <details className="library-filters">
            <summary>标签筛选</summary>
            <div className="topic-list">
              {tags.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={item === selectedTag ? 'is-active' : ''}
                  onClick={() => setSelectedTag(item)}
                >
                  <span>{item === '全部标签' ? '全部素材' : `#${item}`}</span>
                  <span>{item === '全部标签' ? notes.length : notes.filter((note) => note.tags.includes(item)).length}</span>
                </button>
              ))}
            </div>
          </details>

          <div className="utility-actions">
            <button type="button" onClick={openLocalVault} title="打开本地 Markdown 素材库">
              <FolderOpen size={16} />
              打开本地库
            </button>
            <button type="button" onClick={saveVault} title="把素材写回已打开的本地库">
              <Save size={16} />
              写回本地库
            </button>
          </div>

          <div className="settings-box">
            <button type="button" className="settings-toggle" onClick={() => setShowSettings((value) => !value)}>
              <Settings2 size={17} />
              账号与 AI
            </button>
            {showSettings ? (
              <div className="settings-fields">
                <div className="settings-summary">
                  <strong>{user.email}</strong>
                  <span>当前素材库只属于这个账号。</span>
                </div>
                <div className="settings-summary">
                  <strong>{aiCapabilities?.chatConfigured ? '平台 AI 已配置' : '平台 AI 未配置'}</strong>
                  <span>
                    文本：{aiCapabilities?.model ?? 'fallback'} / 视觉：{aiCapabilities?.visionModel ?? 'fallback'} / 转写：
                    {aiCapabilities?.transcriptionModel ?? 'fallback'}
                  </span>
                </div>
                {localMigrationNotes.length ? (
                  <button type="button" onClick={migrateLocalNotes} disabled={busy === 'migration'}>
                    迁移 {localMigrationNotes.length} 条本地素材
                  </button>
                ) : null}
                <div className="settings-actions">
                  <button type="button" onClick={refreshAICapabilities}>刷新 AI 状态</button>
                  <button type="button" onClick={signOut}>退出登录</button>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      ) : (
        <aside className="compact-rail" aria-label="快速导航">
          <img className="compact-brand" src="/mine-logo.png" alt="" />
          <button type="button" onClick={() => setShowLibrary(true)} aria-label="打开素材区" title="打开素材区">
            <PanelLeftOpen size={18} />
          </button>
          <button type="button" onClick={() => createNote()} aria-label="新建素材" title="新建素材">
            <FilePlus2 size={18} />
          </button>
        </aside>
      )}

      <section className="workspace" aria-label="内容生产台">
        <header className="top-rail">
          <div className="top-title">
            <span>素材库</span>
            <span aria-hidden="true">/</span>
            <strong>{selectedNote?.topic ?? 'Inbox'}</strong>
          </div>
          <div className="header-actions">
            <div className="layout-controls" aria-label="布局控制">
              <button
                type="button"
                onClick={() => setShowLibrary((value) => !value)}
                aria-label={showLibrary ? '收起素材区' : '打开素材区'}
                title={showLibrary ? '收起素材区' : '打开素材区'}
              >
                {showLibrary ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
              </button>
            </div>
            <div className="save-cluster" aria-live="polite">
              <button
                type="button"
                className="save-now-button"
                onClick={saveSelectedNote}
                disabled={!selectedNote || saveState === 'saving'}
                title="立即保存"
              >
                <Save size={16} />
                保存
              </button>
              <span className={`save-state save-state-${saveState}`}>{saveStateLabel(saveState, lastSavedAt)}</span>
            </div>
            <button type="button" className="primary-action header-primary" onClick={runAnalysis}>
              <Sparkles size={17} />
              AI 收纳
            </button>
            <div className="more-menu">
              <button
                type="button"
                className="more-button"
                onClick={() => setMoreMenuOpen((value) => !value)}
                aria-label="更多操作"
                aria-expanded={moreMenuOpen}
                title="更多操作"
              >
                更多
                <ChevronDown size={14} />
              </button>
              {moreMenuOpen ? (
                <div className="more-menu-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowGraph((value) => !value)
                      setMoreMenuOpen(false)
                    }}
                  >
                    <Network size={16} />
                    素材图谱
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      downloadSelectedNote()
                      setMoreMenuOpen(false)
                    }}
                  >
                    <Download size={16} />
                    导出 Markdown
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-danger"
                    onClick={() => {
                      deleteSelectedNote()
                      setMoreMenuOpen(false)
                    }}
                  >
                    <Trash2 size={16} />
                    删除素材
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {selectedNote ? (
          <article className="document-surface">
            <textarea
              className="title-input"
              value={selectedNote.title}
              onChange={(event) => updateSelectedNote({ title: event.target.value })}
              rows={1}
            />

            <div className="document-meta-row">
              <SourceTraceBar note={selectedNote} />

              <section className="tag-manager" aria-label="标签管理">
                <div className="tag-manager-heading" title="标签">
                  <Tags size={14} />
                  <span>标签</span>
                </div>
                <div className="tag-row editable-tags">
                  {selectedNote.tags.map((tag) => (
                    <button type="button" key={tag} onClick={() => removeTag(tag)}>
                      #{tag}
                      <X size={13} />
                    </button>
                  ))}
                  <input
                    value={tagInput}
                    placeholder="添加标签"
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addTag()
                      }
                    }}
                  />
                </div>
              </section>
            </div>

            <EditorErrorBoundary
              key={selectedNote.id}
              markdown={editorMarkdown}
              onChange={(content) => updateSelectedNote({ content })}
            >
              <Suspense fallback={<div className="document-loading">正在加载编辑器...</div>}>
                <RichMarkdownEditor
                  markdown={editorMarkdown}
                  onChange={(content) => updateSelectedNote({ content })}
                  focusText={focusRequest?.noteId === selectedNote.id ? focusRequest.quote : ''}
                  focusToken={focusRequest?.token}
                />
              </Suspense>
            </EditorErrorBoundary>
          </article>
        ) : (
          <div className="empty-state">
            <h2>还没有素材</h2>
            <button type="button" onClick={() => createNote()}>
              <FilePlus2 size={17} />
              创建第一条素材
            </button>
          </div>
        )}

        {showGraph ? (
          <KnowledgeGraph notes={notes} selectedId={selectedNote?.id} onSelectNote={setSelectedId} onClose={() => setShowGraph(false)} />
        ) : null}
      </section>

      {showAssistant && selectedNote ? (
        <Suspense
          fallback={
            <aside className="assistant-panel assistant-loading" style={{ width: assistantWidth }}>
              正在加载素材助手...
            </aside>
          }
        >
          <AssistantPanel
            width={assistantWidth}
            activeTab={activeAssistantTab}
            setActiveTab={setActiveAssistantTab}
            onResizeStart={startAssistantResize}
            onCollapse={() => setShowAssistant(false)}
            note={selectedNote}
            notes={notes}
            selectedSourceIds={selectedSourceIds}
            onToggleSource={toggleSource}
            question={question}
            setQuestion={setQuestion}
            answer={answer}
            outputType={outputType}
            setOutputType={setOutputType}
            generatedResult={generatedResult}
            busy={busy}
            onAnalyze={runAnalysis}
            onAsk={askKnowledgeBase}
            onGenerate={createOutput}
            onSaveOutput={saveOutputAsNote}
            onSelectNote={setSelectedId}
            onOpenCitation={openCitation}
            askScopeMode={askScopeMode}
            setAskScopeMode={setAskScopeMode}
            askTopics={askTopics}
            setAskTopics={setAskTopics}
            askTags={askTags}
            setAskTags={setAskTags}
            askSelectedSourceIds={askSelectedSourceIds}
            onToggleAskSource={toggleAskSource}
            askScopeReady={askScopeReady(askScopeMode, buildAskScope(askScopeMode, selectedNote, askTopics, askTags, askSelectedSourceIds))}
            conversationCount={conversation.length}
            onNewConversation={startNewConversation}
            indexStatus={indexStatus}
            retrievalMode={aiCapabilities?.retrievalMode}
            onRetryIndex={retryFailedIndex}
          />
        </Suspense>
      ) : showAssistant ? (
        <aside className="assistant-panel assistant-empty" style={{ width: assistantWidth }} aria-label="素材助手">
          <header className="assistant-header">
            <div>
              <p>素材助手</p>
              <h2>先创建一条素材</h2>
            </div>
            <button type="button" className="assistant-collapse" onClick={() => setShowAssistant(false)} aria-label="收起 AI 面板" title="收起 AI 面板">
              <PanelRightOpen size={17} />
            </button>
          </header>
          <div className="assistant-card">
            <p className="section-kicker">当前素材库为空</p>
            <p>创建或导入第一条素材后，AI 收纳、问答和输出面板会在这里可用。</p>
          </div>
          <button type="button" className="primary-action" onClick={() => createNote()}>
            <FilePlus2 size={16} />
            创建第一条素材
          </button>
        </aside>
      ) : (
        <aside className="assistant-rail" aria-label="AI 面板已收起">
          <button type="button" onClick={() => setShowAssistant(true)} aria-label="打开 AI 收纳面板" title="打开 AI 收纳面板">
            <PanelRightOpen size={17} />
            <span>AI</span>
          </button>
        </aside>
      )}

      <p className="status-line">{status}</p>

      {showImportPanel ? (
        <Suspense
          fallback={
            <div className="import-backdrop">
              <section className="import-panel import-loading">正在加载导入面板...</section>
            </div>
          }
        >
          <ImportPanel
            onClose={() => setShowImportPanel(false)}
            onImportMarkdown={() => fileInputRef.current?.click()}
            onSave={saveImportedResult}
          />
        </Suspense>
      ) : null}
    </main>
  )

  async function saveImportedResult(result: ImportResult, analyzeAfterSave: boolean) {
    if (!result.markdown.trim()) return
    const now = new Date().toISOString()
    const note = await createCloudNote({
      title: result.title || '外部导入',
      content: result.markdown,
      summary: result.extractedText.slice(0, 96),
      tags: importTags(result),
      topic: importTopic(result.sourceType),
      source: result.sourceUrl || result.platform,
      createdAt: now,
      updatedAt: now,
      relatedNoteIds: [],
    })
    const nextNotes = [note, ...notes]

    setNotes(nextNotes)
    setSelectedId(note.id)
    setShowImportPanel(false)
    restartIndexStatusRefresh()
    setStatus(`已保存「${note.title}」到素材库。`)

    if (!analyzeAfterSave) return

    setShowAssistant(true)
    setActiveAssistantTab('organize')
    setBusy('analysis')
    setStatus(aiCapabilities?.chatConfigured ? '正在整理新导入的素材。' : '平台 AI 未配置，使用 fallback 整理新素材。')

    try {
      const analysis = await analyzeNote(note, nextNotes)
      const updatedAt = new Date().toISOString()
      await updateCloudNote(note.id, {
        title: analysis.titleSuggestion,
        summary: analysis.summary,
        tags: mergeTags(note.tags, analysis.tags),
        topic: analysis.topic,
        relatedNoteIds: analysis.relatedNotes.map((related) => related.id),
        updatedAt,
      })
      setNotes((current) =>
        current.map((item) =>
          item.id === note.id
            ? {
                ...item,
                title: analysis.titleSuggestion,
                summary: analysis.summary,
                tags: mergeTags(item.tags, analysis.tags),
                topic: analysis.topic,
                relatedNoteIds: analysis.relatedNotes.map((related) => related.id),
                updatedAt,
              }
            : item,
        ),
      )
      setStatus(`已导入并整理「${analysis.titleSuggestion}」。`)
    } finally {
      setBusy('')
    }
  }
}

function importTags(result: ImportResult) {
  return Array.from(new Set([sourceTag(result.sourceType), platformTag(result.platform), '外部素材'].filter(Boolean)))
}

function sourceTag(sourceType: ImportResult['sourceType']) {
  const labels = {
    article: '文章',
    video: '视频',
    image: '图片',
    podcast: '播客',
  }
  return labels[sourceType]
}

function platformTag(platform: string) {
  if (!platform || platform === '外部来源' || platform === '手动粘贴') return ''
  return platform.replace(/^www\./, '')
}

function importTopic(sourceType: ImportResult['sourceType']) {
  const topics = {
    article: '文章素材',
    video: '视频素材',
    image: '图片素材',
    podcast: '播客素材',
  }
  return topics[sourceType]
}

function mergeTags(currentTags: string[], nextTags: string[]) {
  return Array.from(new Set([...currentTags, ...nextTags].map((tag) => tag.trim()).filter(Boolean))).slice(0, 8)
}

function saveStateLabel(state: 'saved' | 'dirty' | 'saving' | 'error', lastSavedAt: string) {
  if (state === 'dirty') return '有未保存更改'
  if (state === 'saving') return '正在保存'
  if (state === 'error') return '保存失败'
  return lastSavedAt ? `已保存 ${lastSavedAt}` : '已保存'
}

function SourceTraceBar({ note }: { note: Note }) {
  const source = parseSourceTrace(note)
  const isManual = !source.sourceUrl && (source.importMethod.startsWith('手动') || source.platform.startsWith('手动'))
  const sourceName = isManual ? (source.importMethod.includes('粘贴') ? '粘贴内容' : '手动笔记') : source.platform
  const method = !isManual && source.importMethod !== source.platform ? source.importMethod : ''

  return (
    <section className="source-trace-bar" aria-label="素材来源" title={`来源可信度：${source.reliability}`}>
      <FilePenLine size={14} />
      <span className="source-trace-label">来源</span>
      <strong>{sourceName}</strong>
      {method ? <span>{method}</span> : null}
      {/^https?:\/\//.test(source.sourceUrl) ? (
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">
          原文
          <ExternalLink size={12} />
        </a>
      ) : null}
    </section>
  )
}

function parseSourceTrace(note: Note) {
  const content = note.content || ''
  return {
    platform: content.match(/^- 平台：(.+)$/m)?.[1]?.trim() || note.source || '未知来源',
    importMethod: content.match(/^- 导入方式：(.+)$/m)?.[1]?.trim() || '手动创建',
    reliability: content.match(/^- 来源可信度：(.+)$/m)?.[1]?.trim() || sourceReliabilityFromNote(note),
    sourceUrl: content.match(/^- 原始来源：(https?:\/\/\S+)$/m)?.[1]?.trim() || (/^https?:\/\//.test(note.source) ? note.source : ''),
  }
}

function sourceReliabilityFromNote(note: Note) {
  if (/^- 原始来源：https?:\/\//m.test(note.content) || /^来源：https?:\/\//m.test(note.content)) return '原文链接'
  if (note.source === '手动粘贴') return '手动粘贴'
  if (note.source) return note.source
  return '手动创建'
}

function KnowledgeGraph({
  notes,
  selectedId,
  onSelectNote,
  onClose,
}: {
  notes: Note[]
  selectedId?: string
  onSelectNote: (id: string) => void
  onClose: () => void
}) {
  const centerX = 310
  const centerY = 220
  const radius = 150
  const nodes = notes.map((note, index) => {
    const angle = (index / Math.max(notes.length, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      note,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }
  })
  const nodeMap = new Map(nodes.map((node) => [node.note.id, node]))

  return (
    <section className="graph-panel" aria-label="知识图谱">
      <header>
        <div>
          <p>关联视图</p>
          <h3>知识图谱</h3>
        </div>
        <button type="button" onClick={onClose}>
          <X size={16} />
          关闭
        </button>
      </header>
      <svg viewBox="0 0 620 440" role="img" aria-label="素材之间的关联图谱">
        {notes.flatMap((note) =>
          note.relatedNoteIds.map((targetId) => {
            const from = nodeMap.get(note.id)
            const to = nodeMap.get(targetId)
            if (!from || !to) return null
            return <line key={`${note.id}-${targetId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
          }),
        )}
        {nodes.map(({ note, x, y }) => (
          <g key={note.id} className={note.id === selectedId ? 'is-selected' : ''} onClick={() => onSelectNote(note.id)}>
            <circle cx={x} cy={y} r={note.id === selectedId ? 24 : 18} />
            <text x={x} y={y + 42}>
              {note.title.slice(0, 12)}
            </text>
          </g>
        ))}
      </svg>
    </section>
  )
}

function safeFileName(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || 'note'
}

function removeLeadingTitleHeading(markdown: string, title: string) {
  const expectedTitle = normalizeHeadingText(title)
  if (!expectedTitle) return markdown

  return markdown.replace(/^(\s*)#\s+([^\n]+)\n{0,2}/, (match, leadingSpace: string, heading: string) => {
    if (leadingSpace.trim()) return match
    return normalizeHeadingText(heading) === expectedTitle ? '' : match
  })
}

function normalizeHeadingText(value: string) {
  return value.trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ')
}

function downloadMarkdown(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

type ErrorBoundaryState = {
  error: Error | null
}

type EditorErrorBoundaryProps = {
  children: ReactNode
  markdown: string
  onChange: (content: string) => void
}

class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Rich markdown editor failed. Falling back to source editor.', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <MarkdownEditorFallback markdown={this.props.markdown} onChange={this.props.onChange} />
    )
  }
}

function MarkdownEditorFallback({
  markdown,
  onChange,
}: {
  markdown: string
  onChange: (content: string) => void
}) {
  return (
    <section className="document-editor editor-fallback">
      <div className="editor-mode-bar">
        <div>
          <strong>正文</strong>
          <span>已切换到稳定编辑模式，内容会正常保存为 Markdown。</span>
        </div>
      </div>
      <textarea
        className="source-editor"
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </section>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-shell">
        <section className="app-error-card">
          <p>Mine 遇到前端显示错误</p>
          <h1>页面没有正常加载</h1>
          <span>{this.state.error.message || '请刷新页面，或稍后再试。'}</span>
          <button type="button" className="primary-action" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </section>
      </main>
    )
  }
}

export default function Root() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  )
}
