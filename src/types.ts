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

export type RetrievalMode = 'hybrid' | 'keyword' | 'basic'

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
  mode: 'hybrid' | 'basic'
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
