import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImportCapabilities, importFromImageUrl, importFromUrl } from './importService'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('import service', () => {
  it('returns a failed import result when the api response body is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))

    const result = await importFromUrl('https://example.com/article')

    expect(result.status).toBe('failed')
    expect(result.sourceType).toBe('article')
    expect(result.warnings[0]).toContain('502')
  })

  it('returns a failed image result when the api response is not json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })))

    const result = await importFromImageUrl('https://example.com/image.png')

    expect(result.status).toBe('failed')
    expect(result.sourceType).toBe('image')
    expect(result.title).toBe('导入失败')
  })

  it('falls back when import capability response is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))

    await expect(getImportCapabilities()).resolves.toEqual({
      ytDlpAvailable: false,
      authConfigured: false,
      transcriptionConfigured: false,
    })
  })
})
