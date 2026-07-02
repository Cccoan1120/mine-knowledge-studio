import type { ImportCapabilities, ImportResult } from '../types'

export async function getImportCapabilities(): Promise<ImportCapabilities> {
  try {
    const response = await fetch('/api/import/capabilities')
    if (!response.ok) return fallbackCapabilities()

    return (await readJsonResponse<ImportCapabilities>(response)) ?? fallbackCapabilities()
  } catch {
    return fallbackCapabilities()
  }
}

export async function importFromUrl(url: string): Promise<ImportResult> {
  const response = await fetch('/api/import/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  return readImportResponse(response, 'article')
}

export async function importFromImageUrl(imageUrl: string): Promise<ImportResult> {
  const response = await fetch('/api/import/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  })

  return readImportResponse(response, 'image')
}

export async function importFromImageFile(file: File): Promise<ImportResult> {
  return importFromFile('/api/import/image', file, 'image')
}

export async function importFromMediaFile(file: File): Promise<ImportResult> {
  return importFromFile('/api/import/media', file, 'video')
}

async function importFromFile(endpoint: string, file: File, fallbackSourceType: ImportResult['sourceType']) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  return readImportResponse(response, fallbackSourceType)
}

async function readImportResponse(response: Response, fallbackSourceType: ImportResult['sourceType']): Promise<ImportResult> {
  const result = await readJsonResponse<ImportResult>(response)
  if (result?.status) return result

  return {
    status: 'failed',
    sourceType: fallbackSourceType,
    platform: '外部来源',
    title: '导入失败',
    sourceUrl: '',
    markdown: '',
    extractedText: '',
    warnings: [response.ok ? '导入服务没有返回可用结果，请重试。' : `导入服务返回 ${response.status}，请确认本地导入服务正在运行。`],
  }
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function fallbackCapabilities(): ImportCapabilities {
  return { ytDlpAvailable: false, authConfigured: false, transcriptionConfigured: false }
}
