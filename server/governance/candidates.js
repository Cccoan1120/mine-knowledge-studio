import { createHash } from 'node:crypto'

const MIN_CONTENT_LENGTH = 24
const MIN_SIMILAR_CONTENT_LENGTH = 40
const MAX_CANDIDATES = 50
const GENERIC_TITLES = new Set(['', 'untitled', 'note', 'new note', '未命名素材', '新建素材'])

export function detectGovernanceCandidates(notes, dismissed = []) {
  const ignored = new Set(dismissed.map((item) => `${item.kind}:${item.fingerprint}`))
  const duplicates = detectDuplicatePairs(notes, ignored)
  const tags = detectTagGroups(notes)
    .filter((item) => !ignored.has(`tag:${item.fingerprint}`))
    .slice(0, MAX_CANDIDATES)

  return {
    duplicates,
    tags,
    stats: {
      noteCount: notes.length,
      tagCount: new Set(notes.flatMap((note) => note.tags || [])).size,
    },
  }
}

export function detectDuplicatePairs(notes, ignored = new Set()) {
  const prepared = [...notes].sort((a, b) => stableCompare(a.id, b.id)).map((note) => ({
    note,
    title: normalizeText(note.title),
    content: normalizeText(note.content),
    tokens: contentTokens(note.content),
  }))
  const candidates = []
  const contentGroups = new Map()
  const titleGroups = new Map()
  const frequencies = new Map()
  for (const [index, item] of prepared.entries()) {
    if (item.content.length < MIN_CONTENT_LENGTH) continue
    const hash = createHash('sha256').update(item.content).digest('hex')
    if (!contentGroups.has(hash)) contentGroups.set(hash, [])
    contentGroups.get(hash).push(index)
    if (!GENERIC_TITLES.has(item.title)) {
      if (!titleGroups.has(item.title)) titleGroups.set(item.title, [])
      titleGroups.get(item.title).push(index)
    }
    for (const token of item.tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1)
  }

  function add(left, right, reason, score) {
    const noteIds = [left.note.id, right.note.id].sort()
    const key = fingerprint(['duplicate', ...noteIds, reason])
    if (ignored.has(`duplicate:${key}`)) return
    candidates.push({ fingerprint: key, noteIds, notes: [summarizeNote(left.note), summarizeNote(right.note)], score: Number(score.toFixed(3)), reason })
  }

  for (const group of contentGroups.values()) {
    for (let a = 0; a < group.length; a += 1) {
      for (let b = a + 1; b < group.length; b += 1) {
        add(prepared[group[a]], prepared[group[b]], 'exact-content', 1)
        if (candidates.length >= MAX_CANDIDATES) return candidates
      }
    }
  }

  // Jaccard >= 0.82 requires an overlap in these globally ordered prefixes.
  const prefixes = prepared.map(item => [...item.tokens]
    .sort((a, b) => (frequencies.get(a) || 0) - (frequencies.get(b) || 0) || stableCompare(a, b))
    .slice(0, item.tokens.size - Math.ceil(0.82 * item.tokens.size) + 1))
  const postings = new Map()
  for (const [index, prefix] of prefixes.entries()) {
    for (const token of prefix) {
      if (!postings.has(token)) postings.set(token, [])
      postings.get(token).push(index)
    }
  }

  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    const possible = new Set(titleGroups.get(prepared[leftIndex].title) || [])
    for (const token of prefixes[leftIndex]) for (const index of postings.get(token)) possible.add(index)
    for (const rightIndex of [...possible].sort((a, b) => a - b)) {
      if (rightIndex <= leftIndex) continue
      const left = prepared[leftIndex]
      const right = prepared[rightIndex]
      if (left.content.length < MIN_CONTENT_LENGTH || right.content.length < MIN_CONTENT_LENGTH) continue
      if (left.content === right.content) continue
      const threshold = left.title === right.title && !GENERIC_TITLES.has(left.title) ? 0.45 : 0.82
      if (Math.min(left.tokens.size, right.tokens.size) < threshold * Math.max(left.tokens.size, right.tokens.size)) continue

      let reason
      let score
      if (left.content === right.content) {
        reason = 'exact-content'
        score = 1
      } else {
        score = jaccard(left.tokens, right.tokens)
        if (left.title === right.title && !GENERIC_TITLES.has(left.title) && score >= 0.45) {
          reason = 'same-title'
        } else if (Math.min(left.content.length, right.content.length) >= MIN_SIMILAR_CONTENT_LENGTH && score >= 0.82) {
          reason = 'similar-content'
        } else {
          continue
        }
      }

      add(left, right, reason, score)
      if (candidates.length >= MAX_CANDIDATES) return candidates.sort((a, b) => b.score - a.score)
    }
  }

  return candidates.sort((left, right) => right.score - left.score || left.fingerprint.localeCompare(right.fingerprint))
}

export function detectTagGroups(notes) {
  const variants = new Map()
  for (const note of notes) {
    for (const rawTag of note.tags || []) {
      const tag = String(rawTag)
      const normalized = normalizeTag(tag)
      if (!normalized) continue
      const key = `${normalized}\u0000${tag}`
      const entry = variants.get(key) || { tag, normalized, noteIds: new Set() }
      entry.noteIds.add(note.id)
      variants.set(key, entry)
    }
  }

  const normalizedGroups = new Map()
  for (const entry of variants.values()) {
    const group = normalizedGroups.get(entry.normalized) || []
    group.push(entry)
    normalizedGroups.set(entry.normalized, group)
  }

  const candidates = []
  const consumed = new Set()
  for (const [normalized, group] of normalizedGroups) {
    if (group.length < 2) continue
    candidates.push(buildTagCandidate(group, 'format-variant'))
    consumed.add(normalized)
  }

  const spellable = Array.from(normalizedGroups.entries())
    .filter(([normalized]) => !consumed.has(normalized) && /^[a-z0-9-]{6,}$/.test(normalized))
    .sort(([left], [right]) => left.localeCompare(right))
  for (let index = 0; index < spellable.length; index += 1) {
    for (let other = index + 1; other < spellable.length; other += 1) {
      const [leftNormalized, leftGroup] = spellable[index]
      const [rightNormalized, rightGroup] = spellable[other]
      if (!isOneEditApart(leftNormalized, rightNormalized)) continue
      candidates.push(buildTagCandidate([...leftGroup, ...rightGroup], 'similar-spelling'))
    }
  }

  return candidates.sort((left, right) => right.affectedNoteCount - left.affectedNoteCount || left.fingerprint.localeCompare(right.fingerprint))
}

function buildTagCandidate(entries, reason) {
  const variants = entries
    .map((entry) => ({ tag: entry.tag, count: entry.noteIds.size, noteIds: Array.from(entry.noteIds).sort() }))
    .sort((left, right) => stableCompare(left.tag, right.tag))
  const noteIds = new Set(variants.flatMap((item) => item.noteIds))
  return {
    fingerprint: fingerprint(['tag', reason, ...variants.map((item) => item.tag)]),
    variants,
    canonicalTag: chooseCanonicalTag(variants),
    affectedNoteCount: noteIds.size,
    reason,
  }
}

function chooseCanonicalTag(variants) {
  return [...variants].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    const leftAcronym = /^[A-Z0-9]{2,8}$/.test(left.tag.replace(/^#+/, ''))
    const rightAcronym = /^[A-Z0-9]{2,8}$/.test(right.tag.replace(/^#+/, ''))
    if (leftAcronym !== rightAcronym) return rightAcronym ? 1 : -1
    const leftHash = left.tag.startsWith('#')
    const rightHash = right.tag.startsWith('#')
    if (leftHash !== rightHash) return leftHash ? 1 : -1
    if (left.tag.length !== right.tag.length) return right.tag.length - left.tag.length
    return stableCompare(left.tag, right.tag)
  })[0].tag.normalize('NFKC').replace(/^#+/, '').trim()
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeTag(value) {
  return String(value || '').normalize('NFKC').trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ').toLocaleLowerCase()
}

function contentTokens(value) {
  const normalized = normalizeText(value)
  const tokens = new Set(normalized.match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) || [])
  const cjkRuns = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) || []
  for (const run of cjkRuns) {
    if (run.length === 1) tokens.add(run)
    for (let index = 0; index < run.length - 1; index += 1) tokens.add(run.slice(index, index + 2))
  }
  return tokens
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function isOneEditApart(left, right) {
  if (left === right || Math.abs(left.length - right.length) > 1) return false
  let mismatches = 0
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }
    mismatches += 1
    if (mismatches > 1) return false
    if (left.length > right.length) leftIndex += 1
    else if (right.length > left.length) rightIndex += 1
    else {
      leftIndex += 1
      rightIndex += 1
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) mismatches += 1
  return mismatches === 1
}

function summarizeNote(note) {
  return {
    id: note.id,
    title: note.title,
    excerpt: String(note.content || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    tags: note.tags || [],
    updatedAt: note.updatedAt,
  }
}

function fingerprint(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
