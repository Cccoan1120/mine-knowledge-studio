import { FileAudio, FileText, Image, Link, Loader2, Save, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getImportCapabilities,
  importFromImageFile,
  importFromImageUrl,
  importFromMediaFile,
  importFromUrl,
} from '../services/importService'
import type { ImportCapabilities, ImportResult, ImportSourceType, ImportSuggestedAction } from '../types'

type ImportPanelProps = {
  onClose: () => void
  onSave: (result: ImportResult, analyzeAfterSave: boolean) => void
  onImportMarkdown: () => void
}

type ImportMode = 'url' | 'image' | 'media' | 'text'

export function ImportPanel({ onClose, onSave, onImportMarkdown }: ImportPanelProps) {
  const [mode, setMode] = useState<ImportMode>('url')
  const [url, setUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [manualTitle, setManualTitle] = useState('')
  const [manualSourceType, setManualSourceType] = useState<ImportSourceType>('video')
  const [manualText, setManualText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [draftMarkdown, setDraftMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [capabilities, setCapabilities] = useState<ImportCapabilities | null>(null)

  useEffect(() => {
    let ignore = false

    getImportCapabilities()
      .then((nextCapabilities) => {
        if (!ignore) setCapabilities(nextCapabilities)
      })
      .catch(() => {
        if (!ignore) setCapabilities({ ytDlpAvailable: false, authConfigured: false })
      })

    return () => {
      ignore = true
    }
  }, [])

  async function runImport() {
    setBusy(true)
    setError('')

    try {
      const nextResult =
        mode === 'text'
          ? buildManualResult(manualTitle, manualText, manualSourceType)
          : mode === 'url'
          ? await importFromUrl(url.trim())
          : mode === 'image'
            ? imageFile
              ? await importFromImageFile(imageFile)
              : await importFromImageUrl(imageUrl.trim())
            : await importFromMediaFile(assertFile(mediaFile))

      setResult(nextResult)
      setDraftMarkdown(nextResult.markdown)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  function save(analyzeAfterSave: boolean) {
    if (!result) return
    onSave({ ...result, markdown: draftMarkdown }, analyzeAfterSave)
  }

  function handleSuggestedAction(action: ImportSuggestedAction) {
    if (action.type === 'configure-auth') {
      setError('需要在本机导入服务中配置 MINE_YTDLP_BROWSER=chrome，或配置 MINE_YTDLP_COOKIES 指向 cookies.txt 后重启服务。')
      return
    }

    if (action.type === 'configure-transcription') {
      setError('当前平台未配置转写能力。配置服务端转写模型后可以重新提取链接，或上传音视频转写。')
      return
    }

    if (action.type === 'configure-vision') {
      setError('当前平台未配置视觉模型。DeepSeek 文本接口不能直接完成图片 OCR，需要在服务端单独配置视觉模型。')
      return
    }

    if (action.type === 'retry') {
      void runImport()
      return
    }

    if (action.type === 'upload-media') {
      setMode('media')
      return
    }

    if (action.type === 'paste-transcript') {
      setMode('text')
      setManualSourceType(result?.sourceType === 'podcast' ? 'podcast' : 'video')
    }

    if (action.type === 'save-link-card') {
      save(false)
    }
  }

  const canImport = Boolean(
    (mode === 'url' && url.trim()) ||
      (mode === 'image' && (imageUrl.trim() || imageFile)) ||
      (mode === 'media' && mediaFile) ||
      (mode === 'text' && manualText.trim()),
  )

  return (
    <div className="import-backdrop" role="presentation">
      <section className="import-panel" aria-label="导入材料">
        <header className="import-header">
          <div>
            <p>导入材料</p>
            <h2>把外部内容收进 Mine</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭导入面板">
            <X size={17} />
          </button>
        </header>

        <div className="import-tabs" aria-label="导入类型">
          <button type="button" className={mode === 'url' ? 'is-active' : ''} onClick={() => setMode('url')}>
            <Link size={16} />
            链接
          </button>
          <button type="button" className={mode === 'image' ? 'is-active' : ''} onClick={() => setMode('image')}>
            <Image size={16} />
            图片
          </button>
          <button type="button" className={mode === 'media' ? 'is-active' : ''} onClick={() => setMode('media')}>
            <FileAudio size={16} />
            音视频
          </button>
          <button type="button" className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')}>
            <FileText size={16} />
            文稿
          </button>
        </div>

        <div className="import-body">
          <section className="import-inputs">
            <div className="import-steps" aria-label="导入进度">
              <span className="is-done">识别来源</span>
              <span className={busy || result ? 'is-done' : ''}>提取内容</span>
              <span className={result ? 'is-done' : ''}>生成预览</span>
            </div>

            {mode === 'url' ? (
              <label>
                文章、公众号、播客 RSS、B站、抖音或小红书链接
                <input value={url} placeholder="https://..." onChange={(event) => setUrl(event.target.value)} />
                <span className="import-hint">
                  {url.trim() ? `识别为：${detectInputPlatform(url)}。` : ''}
                  平台限制链接解析时，可以上传音视频、粘贴文稿，或先保存链接卡片。
                </span>
              </label>
            ) : null}

            <ImportReadiness capabilities={capabilities} />

            {mode === 'image' ? (
              <>
                <label>
                  图片链接
                  <input value={imageUrl} placeholder="https://..." onChange={(event) => setImageUrl(event.target.value)} />
                </label>
                <label>
                  或上传图片
                  <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
                </label>
              </>
            ) : null}

            {mode === 'media' ? (
              <label>
                上传播客、音频或视频文件
                <input type="file" accept="audio/*,video/*" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} />
              </label>
            ) : null}

            {mode === 'text' ? (
              <>
                <label>
                  标题
                  <input value={manualTitle} placeholder="例如：某条抖音视频文案" onChange={(event) => setManualTitle(event.target.value)} />
                </label>
                <label>
                  内容类型
                  <select value={manualSourceType} onChange={(event) => setManualSourceType(event.target.value as ImportSourceType)}>
                    <option value="video">视频文案/字幕</option>
                    <option value="podcast">播客文稿</option>
                    <option value="article">文章摘录</option>
                  </select>
                </label>
                <label>
                  粘贴文稿
                  <textarea
                    className="manual-import-textarea"
                    value={manualText}
                    placeholder="当平台链接无法读取时，可以把字幕、播客文稿或公众号正文粘贴到这里。"
                    onChange={(event) => setManualText(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <div className="import-actions">
              <button type="button" className="primary-action" onClick={runImport} disabled={!canImport || busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                开始提取
              </button>
              <button type="button" onClick={onImportMarkdown}>
                导入 Markdown
              </button>
            </div>

            {error ? <p className="import-error">{error}</p> : null}
          </section>

          <section className="import-preview" aria-label="导入预览">
            {result ? (
              <>
                <div className="import-result-meta">
                  <strong>{result.title}</strong>
                  <span>{statusLabel(result.status)} / {sourceLabel(result.sourceType)} / {result.platform}</span>
                </div>
                {result.warnings.length ? (
                  <div className="import-warnings">
                    {result.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                {result.diagnostics?.suggestedActions?.length ? (
                  <div className="import-next-actions">
                    <strong>建议下一步</strong>
                    {result.diagnostics.reason ? <p>{result.diagnostics.reason}</p> : null}
                    <div>
                      {result.diagnostics.suggestedActions.map((action) => (
                        <button key={action.type} type="button" onClick={() => handleSuggestedAction(action)}>
                          <span>{action.label}</span>
                          <small>{action.description}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <textarea value={draftMarkdown} onChange={(event) => setDraftMarkdown(event.target.value)} />
                <div className="import-save-actions">
                  <button type="button" onClick={() => save(false)} disabled={!draftMarkdown.trim()}>
                    <Save size={16} />
                    保存为素材
                  </button>
                  <button type="button" className="primary-action" onClick={() => save(true)} disabled={!draftMarkdown.trim()}>
                    <Sparkles size={16} />
                    保存并 AI 收纳
                  </button>
                </div>
              </>
            ) : (
              <div className="import-empty">
                <strong>等待提取</strong>
                <p>提取完成后会在这里显示可编辑的 Markdown 预览。</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

function ImportReadiness({
  capabilities,
}: {
  capabilities: ImportCapabilities | null
}) {
  const ytDlpReady = capabilities?.ytDlpAvailable
  const authReady = capabilities?.authConfigured
  const transcriptionConfigured = Boolean(capabilities?.transcriptionConfigured)

  return (
    <div className="import-readiness" aria-label="导入能力诊断">
      <div>
        <strong>导入能力</strong>
        <span>链接解析失败时，Mine 会按下面能力自动分流。</span>
      </div>
      <ul>
        <li className={ytDlpReady ? 'is-ready' : 'needs-setup'}>
          视频解析：{capabilities ? (ytDlpReady ? '可尝试' : '需安装 yt-dlp') : '检测中'}
        </li>
        <li className={authReady ? 'is-ready' : 'needs-setup'}>
          平台登录态：{capabilities ? (authReady ? '已配置' : '未配置') : '检测中'}
        </li>
        <li className={transcriptionConfigured ? 'is-ready' : 'needs-setup'}>
          音频转写：{transcriptionConfigured ? '已配置' : '未配置 API Key'}
        </li>
      </ul>
    </div>
  )
}

function assertFile(file: File | null) {
  if (!file) throw new Error('请先选择音频或视频文件。')
  return file
}

function sourceLabel(sourceType: ImportSourceType) {
  const labels = {
    article: '文章',
    video: '视频',
    image: '图片',
    podcast: '播客',
  }
  return labels[sourceType]
}

function buildManualResult(title: string, text: string, sourceType: ImportSourceType): ImportResult {
  const finalTitle = title.trim() || (sourceType === 'podcast' ? '播客文稿' : sourceType === 'article' ? '文章摘录' : '视频文案')
  const sourceBlock = [
    '## 来源追踪',
    '',
    '- 平台：手动粘贴',
    '- 原始来源：手动粘贴',
    '- 导入方式：粘贴文稿',
    '- 来源可信度：手动粘贴',
    `- 导入时间：${new Date().toISOString()}`,
  ].join('\n')

  return {
    status: 'ready',
    sourceType,
    platform: '手动粘贴',
    title: finalTitle,
    sourceUrl: '手动粘贴',
    markdown: `# ${finalTitle}\n\n${sourceBlock}\n\n## 正文\n\n${text.trim()}\n`,
    extractedText: text.trim(),
    warnings: ['已从手动粘贴内容生成素材。'],
  }
}

function statusLabel(status: ImportResult['status']) {
  const labels = {
    ready: '可保存',
    'needs-action': '需要处理',
    failed: '失败',
  }
  return labels[status]
}

function detectInputPlatform(value: string) {
  if (/bilibili\.com|b23\.tv/i.test(value)) return 'B站'
  if (/douyin\.com|iesdouyin\.com/i.test(value)) return '抖音'
  if (/xiaohongshu\.com|xhslink\.com/i.test(value)) return '小红书'
  if (/xiaoyuzhoufm\.com|ximalaya\.com|podcasts\.apple\.com|rss|feed|\.xml/i.test(value)) return '播客'
  if (/mp\.weixin\.qq\.com/i.test(value)) return '微信公众号'
  return '外部链接'
}
