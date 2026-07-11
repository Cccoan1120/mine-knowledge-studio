const noteFields = ['title', 'content', 'summary', 'tags', 'topic', 'source', 'relatedNoteIds']
const outputTypes = new Set(['outline', 'idea-card', 'research-summary', 'wechat-draft', 'xiaohongshu-note', 'short-video-script'])

export function validateNoteInput(value, { partial = false } = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = {}

  for (const field of noteFields) {
    if (partial && !(field in input)) continue
    if (field === 'tags') result.tags = stringArray(input.tags, 20, 50, '标签')
    else if (field === 'relatedNoteIds') result.relatedNoteIds = stringArray(input.relatedNoteIds, 50, 128, '关联素材')
    else if (field === 'title') result.title = limitedString(input.title || '未命名素材', 200, '标题')
    else if (field === 'content') result.content = limitedString(input.content || '', 1_000_000, '正文')
    else if (field === 'summary') result.summary = limitedString(input.summary || '', 2000, '摘要')
    else if (field === 'topic') result.topic = limitedString(input.topic || 'Inbox', 100, '主题')
    else if (field === 'source') result.source = limitedString(input.source || '', 2048, '来源')
  }

  return result
}

export function validateBulkNotes(value) {
  const notes = Array.isArray(value?.notes) ? value.notes : []
  if (notes.length > 100) throw badRequest('一次最多导入 100 条素材。')
  return notes.map((note) => validateNoteInput(note))
}

export function validateQuestion(value) {
  const question = limitedString(value, 2000, '问题').trim()
  if (!question) throw badRequest('请输入问题。')
  return question
}

export function validateNoteIds(value) {
  return stringArray(value, 20, 128, '来源素材')
}

export function validateOutputType(value) {
  const type = String(value || 'outline')
  if (!outputTypes.has(type)) throw badRequest('不支持该输出类型。')
  return type
}

export function validateImportUrl(value) {
  const url = limitedString(value, 2048, '链接').trim()
  if (!url) throw badRequest('请输入链接。')
  return url
}

export function assertUpload(file, kind) {
  if (!file?.buffer?.length) throw badRequest(kind === 'image' ? '请上传图片。' : '请上传音频或视频。')
  const detected = detectFileKind(file.buffer)
  if (kind === 'image' && detected !== 'image') throw unsupported('文件内容不是支持的图片格式。')
  if (kind === 'media' && detected !== 'media') throw unsupported('文件内容不是支持的音频或视频格式。')
  return file
}

function detectFileKind(buffer) {
  if (buffer.length < 12) return ''
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image'
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image'
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'media'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'media'
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS' || buffer.subarray(0, 4).toString('ascii') === 'fLaC') return 'media'
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'media'
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'media'
  return ''
}

function stringArray(value, maxItems, maxLength, label) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw badRequest(`${label}格式不正确。`)
  if (value.length > maxItems) throw badRequest(`${label}数量过多。`)
  return Array.from(new Set(value.map((item) => limitedString(item, maxLength, label).trim()).filter(Boolean)))
}

function limitedString(value, maxLength, label) {
  const text = String(value ?? '')
  if (text.length > maxLength) throw badRequest(`${label}内容过长。`)
  return text
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function unsupported(message) {
  return Object.assign(new Error(message), { status: 415 })
}
