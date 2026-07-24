import { createHash } from 'node:crypto'

export function hashContent(content) {
  return createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex')
}
