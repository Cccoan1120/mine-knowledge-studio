import type { Note } from '../types'

const frontMatterPattern = /^---\n([\s\S]*?)\n---\n?/

export function createId(prefix = 'note') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function extractTitle(markdown: string, fallback = '未命名笔记') {
  const heading = markdown.match(/^#\s+(.+)$/m)
  if (heading?.[1]) return heading[1].trim()

  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 48) : fallback
}

export function parseMarkdownToNote(markdown: string, source = '本地导入'): Note {
  const now = new Date().toISOString()
  const metadata = parseFrontMatter(markdown)
  const content = markdown.replace(frontMatterPattern, '').trim()

  return {
    id: createId('md'),
    title: metadata.title ?? extractTitle(content),
    content,
    summary: metadata.summary ?? '',
    tags: metadata.tags ?? [],
    topic: metadata.topic ?? 'Inbox',
    source,
    createdAt: metadata.createdAt ?? now,
    updatedAt: now,
    relatedNoteIds: metadata.relatedNoteIds ?? [],
  }
}

export function serializeNoteToMarkdown(note: Note) {
  const frontMatter = [
    '---',
    `title: ${escapeYaml(note.title)}`,
    `summary: ${escapeYaml(note.summary)}`,
    `tags: [${note.tags.map(escapeYaml).join(', ')}]`,
    `topic: ${escapeYaml(note.topic)}`,
    `source: ${escapeYaml(note.source)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    `relatedNoteIds: [${note.relatedNoteIds.map(escapeYaml).join(', ')}]`,
    '---',
  ].join('\n')

  return `${frontMatter}\n\n${note.content.trim()}\n`
}

function parseFrontMatter(markdown: string) {
  const match = markdown.match(frontMatterPattern)
  if (!match) return {}

  const fields = Object.fromEntries(
    match[1].split('\n').map((line) => {
      const index = line.indexOf(':')
      if (index < 0) return [line, '']
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }),
  )

  return {
    title: cleanScalar(fields.title),
    summary: cleanScalar(fields.summary),
    topic: cleanScalar(fields.topic),
    source: cleanScalar(fields.source),
    createdAt: cleanScalar(fields.createdAt),
    tags: parseArray(fields.tags),
    relatedNoteIds: parseArray(fields.relatedNoteIds),
  }
}

function parseArray(value?: string) {
  if (!value) return []
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => cleanScalar(item))
    .filter(Boolean) as string[]
}

function cleanScalar(value?: string) {
  return value?.trim().replace(/^["']|["']$/g, '')
}

function escapeYaml(value: string) {
  if (!value) return '""'
  return `"${value.replaceAll('"', '\\"')}"`
}
