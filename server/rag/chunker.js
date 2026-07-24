import { unified } from 'unified'
import remarkParse from 'remark-parse'

const parser = unified().use(remarkParse)

export function chunkMarkdown(markdown, { targetTokens = 700, maxTokens = 1000, overlapTokens = 100 } = {}) {
  const source = String(markdown ?? '')
  const headingPath = []
  const sections = []

  for (const node of parser.parse(source).children) {
    if (node.type === 'heading') {
      headingPath[node.depth - 1] = nodeText(node).trim()
      headingPath.length = node.depth
      continue
    }

    const startOffset = node.position?.start.offset
    const endOffset = node.position?.end.offset
    if (startOffset === undefined || endOffset === undefined) continue

    const rawContent = source.slice(startOffset, endOffset)
    const content = rawContent.trim()
    if (!content) continue

    const contentOffset = startOffset + rawContent.indexOf(content)
    const previous = sections.at(-1)
    if (previous && sameHeadingPath(previous.headingPath, headingPath)) {
      previous.endOffset = contentOffset + content.length
    } else {
      sections.push({ headingPath: [...headingPath], startOffset: contentOffset, endOffset: contentOffset + content.length })
    }
  }

  const windowSize = Math.max(1, Math.min(targetTokens, maxTokens))
  const overlap = Math.max(0, Math.min(overlapTokens, windowSize - 1))
  return sections.flatMap((section) => splitSection(source, section, windowSize, overlap)).map((chunk, ordinal) => ({ ...chunk, ordinal }))
}

function splitSection(source, section, windowSize, overlap) {
  const content = source.slice(section.startOffset, section.endOffset)
  const tokens = tokenSpans(content)
  if (!tokens.length) return []

  const chunks = []
  for (let startIndex = 0; startIndex < tokens.length; ) {
    const endIndex = Math.min(startIndex + windowSize, tokens.length)
    const startOffset = section.startOffset + tokens[startIndex].index
    const endOffset = section.startOffset + endWithPunctuation(content, tokens[endIndex - 1])
    const chunkContent = source.slice(startOffset, endOffset).trim()
    if (chunkContent) {
      chunks.push({
        headingPath: [...section.headingPath],
        content: chunkContent,
        startOffset,
        endOffset,
        tokenCount: endIndex - startIndex,
      })
    }
    if (endIndex === tokens.length) break
    startIndex = endIndex - overlap
  }
  return chunks
}

function tokenSpans(content) {
  return Array.from(String(content).matchAll(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g)).map((match) => ({
    index: match.index,
    length: match[0].length,
  }))
}

function endWithPunctuation(content, token) {
  let end = token.index + token.length
  while (end < content.length && !/\s/.test(content[end])) end += 1
  return end
}

function sameHeadingPath(left, right) {
  return left.length === right.length && left.every((heading, index) => heading === right[index])
}

function nodeText(node) {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(nodeText).join('')
}
