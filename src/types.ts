export type Note = {
  id: string
  title: string
  content: string
  summary: string
  tags: string[]
  topic: string
  source: string
  createdAt: string
  updatedAt: string
  relatedNoteIds: string[]
}

export type CurrentUser = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
}

export type RelatedNote = {
  id: string
  reason: string
}

export type AIAnalysis = {
  titleSuggestion: string
  summary: string
  tags: string[]
  topic: string
  relatedNotes: RelatedNote[]
  reasoning: string
}

export type AnswerResult = {
  answer: string
  knowledgeAnswer?: string
  generalSupplement?: string
  sourceIds: string[]
  citations: Citation[]
  insufficient: boolean
  mode: AIResultMode
  retrievalMode?: RetrievalMode
  scope?: AskScope
}

export type Citation = {
  chunkId?: string
  noteId: string
  title: string
  quote: string
  sourceUrl: string
}

export type AIResultMode = 'model' | 'fallback'

export type RetrievalMode = 'hybrid' | 'dense' | 'keyword' | 'basic'

export type AskHistoryItem = {
  role: 'user' | 'assistant'
  content: string
}

export type AskScope = {
  noteIds?: string[]
  topics?: string[]
  tags?: string[]
}

export type AskScopeMode = 'library' | 'current' | 'topic' | 'tag' | 'manual'

export type IndexStatus = {
  mode: RetrievalMode
  total: number
  pending: number
  processing: number
  ready: number
  failed: number
  missing: number
}

export type GeneratedResult = {
  markdown: string
  citations: Citation[]
  mode: AIResultMode
}

export type OutputType =
  | 'outline'
  | 'idea-card'
  | 'research-summary'
  | 'wechat-draft'
  | 'xiaohongshu-note'
  | 'short-video-script'

export type AIConfig = {
  apiKey: string
  baseUrl: string
  model: string
  visionApiKey?: string
  visionBaseUrl?: string
  visionModel?: string
  transcriptionApiKey?: string
  transcriptionBaseUrl?: string
  transcriptionModel?: string
}

export type ImportSourceType = 'article' | 'video' | 'image' | 'podcast'

export type ImportStatus = 'ready' | 'needs-action' | 'failed'

export type ImportActionType =
  | 'configure-auth'
  | 'configure-vision'
  | 'configure-transcription'
  | 'upload-media'
  | 'paste-transcript'
  | 'save-link-card'
  | 'retry'

export type ImportSuggestedAction = {
  type: ImportActionType
  label: string
  description: string
}

export type ImportDiagnostics = {
  ytDlpAvailable?: boolean
  authConfigured?: boolean
  transcriptionConfigured?: boolean
  reason?: string
  suggestedActions?: ImportSuggestedAction[]
}

export type ImportCapabilities = {
  ytDlpAvailable: boolean
  authConfigured: boolean
  authSource?: string
  transcriptionConfigured?: boolean
}

export type ImportResult = {
  status: ImportStatus
  sourceType: ImportSourceType
  platform: string
  title: string
  markdown: string
  sourceUrl: string
  extractedText: string
  warnings: string[]
  diagnostics?: ImportDiagnostics
}

export type GovernanceNoteSummary = {
  id: string
  title: string
  excerpt: string
  tags: string[]
  updatedAt: string
}

export type DuplicateCandidate = {
  fingerprint: string
  noteIds: [string, string]
  notes: [GovernanceNoteSummary, GovernanceNoteSummary]
  score: number
  reason: 'exact-content' | 'same-title' | 'similar-content'
}

export type TagGovernanceCandidate = {
  fingerprint: string
  variants: Array<{ tag: string; count: number; noteIds: string[] }>
  canonicalTag: string
  affectedNoteCount: number
  reason: 'format-variant' | 'similar-spelling'
}

export type GovernanceCandidates = {
  duplicates: DuplicateCandidate[]
  tags: TagGovernanceCandidate[]
  stats: { noteCount: number; tagCount: number }
}

export type WikiScope = {
  noteIds: string[]
  topics: string[]
  tags: string[]
}

export type WikiProjectStatus = 'draft' | 'outlining' | 'outline-ready' | 'generating' | 'partial-failure' | 'ready'
export type WikiPageStatus = 'planned' | 'queued' | 'generating' | 'ready' | 'failed'
export type WikiJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'accepted' | 'discarded'

export type WikiProjectSummary = {
  id: string
  title: string
  topic: string
  status: WikiProjectStatus
  pageCount: number
  readyPageCount: number
  createdAt: string
  updatedAt: string
}

export type WikiCitation = {
  id: string
  chunkId: string
  noteId: string | null
  noteTitle: string
  quote: string
  sourceUrl: string
  sourceUpdatedAt: string | null
  sourceMissing: boolean
}

export type WikiCandidate = {
  content: string
  citations: WikiCitation[]
  linkedPageIds: string[]
}

export type WikiPage = {
  id: string
  projectId: string
  title: string
  slug: string
  summary: string
  content: string
  position: number
  status: WikiPageStatus
  lastError: string | null
  generatedAt: string | null
  createdAt: string
  updatedAt: string
  citations: WikiCitation[]
  linkedPageIds: string[]
  backlinkPageIds: string[]
  stale: boolean
  sourceMissing: boolean
  hasCandidate: boolean
  candidateData: WikiCandidate | null
}

export type WikiJob = {
  id: string
  projectId: string
  pageId: string | null
  kind: 'outline' | 'page' | 'refresh'
  status: WikiJobStatus
  attempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type WikiProject = WikiProjectSummary & {
  scope: WikiScope
  pages: WikiPage[]
  jobs: WikiJob[]
}
