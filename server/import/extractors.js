import { Readability } from '@mozilla/readability'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { JSDOM } from 'jsdom'
import TurndownService from 'turndown'

const execFileAsync = promisify(execFile)
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 MineImporter/0.1'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

export async function getImportCapabilities() {
  return {
    ytDlpAvailable: await isYtDlpAvailable(),
    authConfigured: hasYtDlpAuth(),
    authSource: process.env.MINE_YTDLP_COOKIES?.trim()
      ? 'cookies-file'
      : process.env.MINE_YTDLP_BROWSER?.trim()
        ? 'browser'
        : '',
  }
}

export async function extractFromUrl({ url, aiConfig = {} }) {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return failed('请输入有效链接。')

  const resolvedUrl = shouldResolveUrl(normalizedUrl) ? await resolveUrl(normalizedUrl) : normalizedUrl

  if (isVideoUrl(resolvedUrl)) {
    return extractVideoUrl(resolvedUrl, aiConfig)
  }

  if (isPodcastUrl(resolvedUrl)) {
    return extractPodcastUrl(resolvedUrl, aiConfig)
  }

  return extractArticleUrl(resolvedUrl)
}

export async function extractArticleUrl(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    })

    if (!response.ok) {
      return needsAction('article', url, `页面返回 ${response.status}，可能需要登录、验证码或平台限制。`)
    }

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    if (isWechatArticle(url, dom)) return extractWechatArticle(dom, url)
    const article = new Readability(dom.window.document).parse()
    const title = article?.title?.trim() || readMeta(dom, 'og:title') || dom.window.document.title || '外部文章'
    const markdown = article?.content
      ? turndown.turndown(article.content).trim()
      : fallbackArticleMarkdown(dom.window.document)

    if (!markdown || markdown.length < 80) {
      return needsAction('article', url, '没有提取到足够正文，可能是动态渲染、登录后可见或反爬限制。', title)
    }

    return ready({
      sourceType: 'article',
      platform: detectPlatform(url),
      title,
      sourceUrl: url,
      markdown: buildSourceMarkdown(title, markdown, {
        platform: detectPlatform(url),
        sourceUrl: url,
        importMethod: '公开网页正文提取',
        sourceType: 'article',
      }),
      extractedText: stripMarkdown(markdown),
      warnings: article?.byline ? [`作者：${article.byline}`] : [],
    })
  } catch (error) {
    return needsAction('article', url, `链接读取失败：${readableError(error)}。`)
  }
}

export async function extractPodcastUrl(url, aiConfig = {}) {
  try {
    if (isAudioFileUrl(url)) return extractAudioUrl(url, aiConfig)

    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/rss+xml,application/xml,text/xml' },
      redirect: 'follow',
    })
    if (!response.ok) return needsAction('podcast', url, `播客页面返回 ${response.status}，可能需要登录或平台限制。`, '播客导入')

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    if (contentType.includes('xml') || text.trim().startsWith('<?xml') || text.includes('<rss')) {
      return extractPodcastFeed(text, url, aiConfig)
    }

    const dom = new JSDOM(text, { url })
    const title = readMeta(dom, 'og:title') || dom.window.document.title || '播客节目'
    const description = readMeta(dom, 'og:description') || getText(dom.window.document.querySelector('article, main, body')).slice(0, 2000)
    const audioUrl = readMeta(dom, 'og:audio') || readMeta(dom, 'og:audio:url') || readAudioElement(dom.window.document, url)

    if (audioUrl && hasTranscriptionConfig(aiConfig)) {
      const transcript = await transcribeRemoteAudio(audioUrl, aiConfig)
      return ready({
        sourceType: 'podcast',
        platform: detectPlatform(url),
        title,
        sourceUrl: url,
        markdown: buildSourceMarkdown(
          title,
          `## 节目简介\n\n${description || '暂无简介'}\n\n## 转写文本\n\n${transcript}`,
          {
            platform: detectPlatform(url),
            sourceUrl: url,
            importMethod: '播客音频自动转写',
            sourceType: 'podcast',
          },
        ),
        extractedText: transcript,
        warnings: ['已识别播客音频并尝试转写。'],
      })
    }

    return {
      status: audioUrl ? 'needs-action' : 'ready',
      sourceType: 'podcast',
      platform: detectPlatform(url),
      title,
      sourceUrl: url,
      markdown: buildSourceMarkdown(
        title,
        `## 节目简介\n\n${description || '未提取到节目简介。'}\n\n${audioUrl ? `音频链接：${audioUrl}\n\n> 配置转写模型后可自动提取播客全文。` : '> 未找到可直接访问的音频链接，可上传音频文件进行转写。'}`,
        {
          platform: detectPlatform(url),
          sourceUrl: url,
          importMethod: audioUrl ? '播客页面提取音频链接' : '播客页面信息提取',
          sourceType: 'podcast',
        },
      ),
      extractedText: description,
      warnings: audioUrl ? ['已找到音频链接，但未配置转写 API Key。'] : ['未找到可直接访问的播客音频。'],
      diagnostics: podcastDiagnostics(Boolean(audioUrl), hasTranscriptionConfig(aiConfig)),
    }
  } catch (error) {
    return needsAction('podcast', url, `播客提取失败：${readableError(error)}。`, '播客导入')
  }
}

export async function extractVideoUrl(url, aiConfig = {}) {
  const platform = detectPlatform(url)

  try {
    const info = await readYtDlpInfo(url)
    const title = info.title || `${platform} 视频`
    const caption = await readBestCaption(info)

    if (caption) {
      const markdown = `## 视频信息\n\n- 平台：${platform}\n- 作者：${info.uploader || '未知'}\n- 链接：${url}\n\n## 字幕文本\n\n${caption}`
      return ready({
        sourceType: 'video',
        platform,
        title,
        sourceUrl: url,
        markdown: buildSourceMarkdown(title, markdown, {
          platform,
          sourceUrl: url,
          importMethod: '公开视频字幕提取',
          sourceType: 'video',
        }),
        extractedText: caption,
        warnings: ['已优先使用视频字幕/自动字幕生成素材。'],
      })
    }

    const transcription = await tryTranscribeVideo(url, aiConfig)
    if (transcription) {
      const markdown = `## 视频信息\n\n- 平台：${platform}\n- 作者：${info.uploader || '未知'}\n- 链接：${url}\n\n## 转写文本\n\n${transcription}`
      return ready({
        sourceType: 'video',
        platform,
        title,
        sourceUrl: url,
        markdown: buildSourceMarkdown(title, markdown, {
          platform,
          sourceUrl: url,
          importMethod: '视频音频自动转写',
          sourceType: 'video',
        }),
        extractedText: transcription,
        warnings: ['未发现字幕，已尝试使用本地音频转写。'],
      })
    }

    return {
      status: 'needs-action',
      sourceType: 'video',
      platform,
      title,
      sourceUrl: url,
      markdown: buildPendingSourceMarkdown({
        title,
        platform,
        sourceUrl: url,
        sourceType: 'video',
        reason: 'Mine 已识别视频链接，但没有找到可用字幕。',
        description: '你可以上传本地音频/视频，或手动粘贴字幕后补全这条素材。',
      }),
      extractedText: '',
      warnings: ['未找到字幕；如果需要自动转写，请安装 yt-dlp/ffmpeg 并配置转写 API Key。'],
      diagnostics: videoDiagnostics('未找到字幕', hasTranscriptionConfig(aiConfig)),
    }
  } catch (error) {
    const metadata = await readPageMetadata(url)
    const title = metadata.title || `${platform} 视频`
    return {
      status: 'needs-action',
      sourceType: 'video',
      platform,
      title,
      sourceUrl: url,
      markdown: buildPendingSourceMarkdown({
        title,
        platform,
        sourceUrl: url,
        sourceType: 'video',
        reason: `自动解析未完成：${readableError(error)}。`,
        description: metadata.description || '你可以上传本地视频/音频，或粘贴视频文案/字幕后补全这条素材。',
      }),
      extractedText: metadata.description || '',
      warnings: [`视频解析受限：${readableError(error)}。建议使用上传音视频或粘贴字幕兜底。`],
      diagnostics: videoDiagnostics(readableError(error), hasTranscriptionConfig(aiConfig)),
    }
  }
}

export async function extractImage({ imageUrl, file, aiConfig = {} }) {
  const source = imageUrl || file?.originalname || '图片导入'
  const visionConfig = effectiveVisionConfig(aiConfig)
  if (!visionConfig.apiKey || isDeepSeekBase(visionConfig.baseUrl)) {
    return {
      status: 'needs-action',
      sourceType: 'image',
      platform: imageUrl ? detectPlatform(imageUrl) : '本地图片',
      title: '图片摘录',
      sourceUrl: imageUrl || '',
      markdown: buildSourceMarkdown(
        '图片摘录',
        '> 已记录图片来源。配置支持图片输入的视觉模型后，Mine 可以提取图片文字、摘要和标签建议。',
        {
          platform: imageUrl ? detectPlatform(imageUrl) : '本地图片',
          sourceUrl: source,
          importMethod: imageUrl ? '图片链接保存' : '本地图片上传',
          sourceType: 'image',
        },
      ),
      extractedText: '',
      warnings: [
        isDeepSeekBase(visionConfig.baseUrl)
          ? '当前视觉接口指向 DeepSeek。DeepSeek 的 OpenAI-compatible 文本接口不适合直接处理 image_url 图片 OCR，请单独配置视觉服务。'
          : '未配置可用的视觉 API Key，未执行图片 OCR。',
      ],
      diagnostics: visionDiagnostics(visionConfig),
    }
  }

  const imageDataUrl = imageUrl || bufferToDataUrl(file.buffer, file.mimetype)
  const text = await callVisionModel(imageDataUrl, aiConfig)
  return ready({
    sourceType: 'image',
    platform: imageUrl ? detectPlatform(imageUrl) : '本地图片',
    title: firstLine(text) || '图片摘录',
    sourceUrl: imageUrl || '',
    markdown: buildSourceMarkdown(firstLine(text) || '图片摘录', `## 图片内容\n\n${text}`, {
      platform: imageUrl ? detectPlatform(imageUrl) : '本地图片',
      sourceUrl: source,
      importMethod: imageUrl ? '图片链接 OCR' : '本地图片 OCR',
      sourceType: 'image',
    }),
    extractedText: text,
    warnings: [],
  })
}

export async function extractMedia({ file, aiConfig = {} }) {
  if (!file) return failed('请上传音频或视频文件。')
  const transcriptionConfig = effectiveTranscriptionConfig(aiConfig)
  if (!transcriptionConfig.apiKey || isDeepSeekBase(transcriptionConfig.baseUrl)) {
    return {
      status: 'needs-action',
      sourceType: file.mimetype?.startsWith('audio/') ? 'podcast' : 'video',
      platform: '本地媒体',
      title: file.originalname,
      sourceUrl: file.originalname,
      markdown: buildSourceMarkdown(
        file.originalname,
        '> 已收到媒体文件。配置支持音频转写的服务后，可以自动转写为素材。',
        {
          platform: '本地媒体',
          sourceUrl: file.originalname,
          importMethod: '本地音视频上传',
          sourceType: file.mimetype?.startsWith('audio/') ? 'podcast' : 'video',
        },
      ),
      extractedText: '',
      warnings: [
        isDeepSeekBase(transcriptionConfig.baseUrl)
          ? '当前转写接口指向 DeepSeek。DeepSeek 文本接口不提供 /audio/transcriptions，请单独配置转写服务。'
          : '未配置可用的转写 API Key，未执行语音转写。',
      ],
      diagnostics: podcastDiagnostics(true, false),
    }
  }

  const text = await transcribeBuffer(file.buffer, file.originalname, file.mimetype, aiConfig)
  return ready({
    sourceType: file.mimetype?.startsWith('audio/') ? 'podcast' : 'video',
    platform: '本地媒体',
    title: file.originalname,
    sourceUrl: file.originalname,
    markdown: buildSourceMarkdown(file.originalname, `## 转写文本\n\n${text}`, {
      platform: '本地媒体',
      sourceUrl: file.originalname,
      importMethod: '本地音视频转写',
      sourceType: file.mimetype?.startsWith('audio/') ? 'podcast' : 'video',
    }),
    extractedText: text,
    warnings: [],
  })
}

export function parseVttToText(value) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return (
        trimmed &&
        trimmed !== 'WEBVTT' &&
        !trimmed.includes('-->') &&
        !/^\d+$/.test(trimmed) &&
        !trimmed.startsWith('NOTE')
      )
    })
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join('\n')
}

function normalizeUrl(value) {
  const input = String(value || '').trim()
  const embeddedUrl = input.match(/https?:\/\/[^\s"'<>，。]+/i)?.[0] || input

  try {
    const url = new URL(embeddedUrl)
    return url.toString()
  } catch {
    return ''
  }
}

async function resolveUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(2500),
    })
    return response.url || url
  } catch {
    return url
  }
}

function shouldResolveUrl(url) {
  try {
    const host = new URL(url).hostname
    return /^(b23\.tv|v\.douyin\.com|www\.iesdouyin\.com|m\.weibo\.cn|xhslink\.com)$/.test(host)
  } catch {
    return false
  }
}

function isVideoUrl(url) {
  return /bilibili\.com|b23\.tv|douyin\.com|iesdouyin\.com|xiaohongshu\.com|xhslink\.com|youtube\.com|youtu\.be|vimeo\.com/.test(url)
}

function isPodcastUrl(url) {
  return (
    isAudioFileUrl(url) ||
    /xiaoyuzhoufm\.com|ximalaya\.com|podcasts\.apple\.com|podbean\.com|anchor\.fm|spotify\.com\/.*episode|rss|feed|\.xml/i.test(url)
  )
}

function isAudioFileUrl(url) {
  return /\.(mp3|m4a|wav|aac|ogg|opus)(\?|#|$)/i.test(url)
}

function detectPlatform(url) {
  if (url.includes('mp.weixin.qq.com')) return '微信公众号'
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'B站'
  if (url.includes('douyin.com') || url.includes('iesdouyin.com')) return '抖音'
  if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) return '小红书'
  if (url.includes('xiaoyuzhoufm.com')) return '小宇宙'
  if (url.includes('ximalaya.com')) return '喜马拉雅'
  if (url.includes('podcasts.apple.com')) return 'Apple Podcasts'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '外部来源'
  }
}

function readMeta(dom, property) {
  return (
    dom.window.document.querySelector(`meta[property="${property}"]`)?.getAttribute('content')?.trim() ||
    dom.window.document.querySelector(`meta[name="${property}"]`)?.getAttribute('content')?.trim()
  )
}

function isWechatArticle(url, dom) {
  return url.includes('mp.weixin.qq.com') || Boolean(dom.window.document.querySelector('#js_content'))
}

function extractWechatArticle(dom, url) {
  const document = dom.window.document
  const contentNode = document.querySelector('#js_content')
  const title =
    getText(document.querySelector('#activity-name')) ||
    readMeta(dom, 'og:title') ||
    document.title.replace(/微信公众平台$/, '').trim() ||
    '微信公众号文章'
  const author = getText(document.querySelector('#js_name, .rich_media_meta_text.rich_media_meta_nickname'))
  const publishTime = getText(document.querySelector('#publish_time'))

  if (!contentNode) {
    return needsAction('article', url, '公众号页面没有暴露正文节点，可能需要登录或被平台限制。', title)
  }

  cleanupNode(contentNode)
  const markdown = turndown.turndown(contentNode.innerHTML).trim()
  if (!markdown || markdown.length < 40) {
    return needsAction('article', url, '公众号正文过短或未能正确加载。', title)
  }

  const meta = [
    '## 文章信息',
    '',
    `- 平台：微信公众号`,
    author ? `- 作者：${author}` : '',
    publishTime ? `- 发布时间：${publishTime}` : '',
    `- 链接：${url}`,
  ]
    .filter(Boolean)
    .join('\n')

  return ready({
    sourceType: 'article',
    platform: '微信公众号',
    title,
    sourceUrl: url,
    markdown: buildSourceMarkdown(title, `${meta}\n\n## 正文\n\n${markdown}`, {
      platform: '微信公众号',
      sourceUrl: url,
      importMethod: '公众号正文提取',
      sourceType: 'article',
    }),
    extractedText: stripMarkdown(markdown),
    warnings: author ? [`作者：${author}`] : [],
  })
}

function cleanupNode(node) {
  node.querySelectorAll('script, style, iframe, svg, wx-open-launch-app, mp-common-profile').forEach((item) => item.remove())
  node.querySelectorAll('[style*="display: none"], [hidden]').forEach((item) => item.remove())
  node.querySelectorAll('img').forEach((image) => {
    const dataSrc = image.getAttribute('data-src')
    if (dataSrc && !image.getAttribute('src')) image.setAttribute('src', dataSrc)
  })
}

function getText(node) {
  return node?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function fallbackArticleMarkdown(document) {
  const main = document.querySelector('article, main, #js_content, .rich_media_content') || document.body
  return turndown.turndown(main.innerHTML).trim()
}

async function extractPodcastFeed(xmlText, url, aiConfig) {
  const dom = new JSDOM(xmlText, { contentType: 'text/xml', url })
  const document = dom.window.document
  const channelTitle = getText(document.querySelector('channel > title')) || '播客'
  const item = document.querySelector('item')

  if (!item) {
    return needsAction('podcast', url, 'RSS 中没有找到节目单集。', channelTitle)
  }

  const title = getText(item.querySelector('title')) || channelTitle
  const description = htmlToMarkdown(getText(item.querySelector('description, encoded'))) || getText(item.querySelector('description'))
  const audioUrl =
    item.querySelector('enclosure[url]')?.getAttribute('url') ||
    getText(item.querySelector('link')) ||
    url

  if (isAudioFileUrl(audioUrl) && hasTranscriptionConfig(aiConfig)) {
    const transcript = await transcribeRemoteAudio(audioUrl, aiConfig)
    return ready({
      sourceType: 'podcast',
      platform: detectPlatform(url),
      title,
      sourceUrl: url,
      markdown: buildSourceMarkdown(
        title,
        `## 播客信息\n\n- 播客：${channelTitle}\n- 音频：${audioUrl}\n- RSS：${url}\n\n## 转写文本\n\n${transcript}`,
        {
          platform: detectPlatform(url),
          sourceUrl: url,
          importMethod: 'RSS 音频自动转写',
          sourceType: 'podcast',
        },
      ),
      extractedText: transcript,
      warnings: ['已从 RSS 识别最新单集并尝试转写。'],
    })
  }

  return {
    status: isAudioFileUrl(audioUrl) ? 'needs-action' : 'ready',
    sourceType: 'podcast',
    platform: detectPlatform(url),
    title,
    sourceUrl: url,
    markdown: buildSourceMarkdown(
      title,
      `## 播客信息\n\n- 播客：${channelTitle}\n- 音频：${audioUrl}\n- RSS：${url}\n\n## 节目简介\n\n${description || '暂无简介'}\n\n${isAudioFileUrl(audioUrl) ? '> 配置转写模型后可自动转写该单集。' : ''}`,
      {
        platform: detectPlatform(url),
        sourceUrl: url,
        importMethod: 'RSS 节目信息提取',
        sourceType: 'podcast',
      },
    ),
    extractedText: stripMarkdown(description || ''),
    warnings: isAudioFileUrl(audioUrl) ? ['已识别播客音频，但未配置转写 API Key。'] : [],
    diagnostics: isAudioFileUrl(audioUrl) ? podcastDiagnostics(true, hasTranscriptionConfig(aiConfig)) : undefined,
  }
}

async function extractAudioUrl(url, aiConfig) {
  if (hasTranscriptionConfig(aiConfig)) {
    const transcript = await transcribeRemoteAudio(url, aiConfig)
    return ready({
      sourceType: 'podcast',
      platform: detectPlatform(url),
      title: fileNameFromUrl(url) || '播客音频',
      sourceUrl: url,
      markdown: buildSourceMarkdown(fileNameFromUrl(url) || '播客音频', `## 转写文本\n\n${transcript}`, {
        platform: detectPlatform(url),
        sourceUrl: url,
        importMethod: '音频直链自动转写',
        sourceType: 'podcast',
      }),
      extractedText: transcript,
      warnings: [],
    })
  }

  return {
    status: 'needs-action',
    sourceType: 'podcast',
    platform: detectPlatform(url),
    title: fileNameFromUrl(url) || '播客音频',
    sourceUrl: url,
    markdown: buildSourceMarkdown(
      fileNameFromUrl(url) || '播客音频',
      '> 已识别音频链接。配置转写模型后可自动提取播客内容。',
      {
        platform: detectPlatform(url),
        sourceUrl: url,
        importMethod: '音频直链保存',
        sourceType: 'podcast',
      },
    ),
    extractedText: '',
    warnings: ['未配置 AI Key，未执行语音转写。'],
    diagnostics: podcastDiagnostics(true, false),
  }
}

async function transcribeRemoteAudio(url, aiConfig) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`音频下载返回 ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  return transcribeBuffer(buffer, fileNameFromUrl(url) || 'podcast.mp3', response.headers.get('content-type') || 'audio/mpeg', aiConfig)
}

async function readPageMetadata(url) {
  if (process.env.MINE_SKIP_YTDLP === '1') return {}
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return {}
    const html = await response.text()
    const dom = new JSDOM(html, { url: response.url || url })
    return {
      title: readMeta(dom, 'og:title') || readMeta(dom, 'twitter:title') || dom.window.document.title,
      description: readMeta(dom, 'og:description') || readMeta(dom, 'description') || '',
    }
  } catch {
    return {}
  }
}

function readAudioElement(document, url) {
  const src = document.querySelector('audio source[src], audio[src]')?.getAttribute('src')
  if (!src) return ''
  try {
    return new URL(src, url).toString()
  } catch {
    return src
  }
}

function htmlToMarkdown(value) {
  if (!value) return ''
  return turndown.turndown(value).trim()
}

function fileNameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
  } catch {
    return ''
  }
}

function buildSourceMarkdown(title, body, source = {}) {
  return `# ${title}\n\n${sourceTraceBlock({
    platform: source.platform || detectPlatform(source.sourceUrl || ''),
    sourceUrl: source.sourceUrl || '',
    importMethod: source.importMethod || '链接导入',
    sourceType: source.sourceType || 'article',
  })}\n\n${body.trim()}\n`
}

function buildPendingSourceMarkdown({ title, platform, sourceUrl, sourceType, reason, description }) {
  return buildSourceMarkdown(
    title,
    [
      '## 待补全素材',
      '',
      `> ${reason}`,
      '',
      description,
      '',
      '你可以继续补充：',
      '',
      '- 上传本地音视频，让 Mine 尝试转写。',
      '- 粘贴字幕、视频文案或播客文稿。',
      '- 先保存这张链接卡片，之后再回来补充正文。',
    ].join('\n'),
    {
      platform,
      sourceUrl,
      importMethod: '链接卡片待补全',
      sourceType,
    },
  )
}

function sourceTraceBlock({ platform, sourceUrl, importMethod, sourceType }) {
  const originalSource = sourceUrl || '未知来源'
  return [
    '## 来源追踪',
    '',
    `- 平台：${platform || '外部来源'}`,
    `- 原始来源：${originalSource}`,
    `- 导入方式：${importMethod}`,
    `- 来源可信度：${sourceReliability({ sourceUrl, importMethod, sourceType })}`,
    `- 导入时间：${new Date().toISOString()}`,
  ].join('\n')
}

function sourceReliability({ sourceUrl, importMethod, sourceType }) {
  if (importMethod.includes('自动字幕')) return '自动字幕'
  if (importMethod.includes('转写')) return '自动转写'
  if (importMethod.includes('上传')) return sourceType === 'image' ? '上传图片' : '上传文件'
  if (importMethod.includes('OCR')) return '图片 OCR'
  if (sourceUrl && /^https?:\/\//.test(sourceUrl)) return '原文链接'
  if (sourceUrl === '手动粘贴') return '手动粘贴'
  return '链接卡片'
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_\-[\]()`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readYtDlpInfo(url) {
  if (process.env.MINE_SKIP_YTDLP === '1') throw Object.assign(new Error('yt-dlp skipped'), { code: 'ENOENT' })
  const { stdout } = await execFileAsync('yt-dlp', createYtDlpArgs(['-J', '--skip-download', '--no-warnings', url]), {
    timeout: ytDlpTimeout(15000),
    maxBuffer: 1024 * 1024 * 8,
  })
  return JSON.parse(stdout)
}

async function isYtDlpAvailable() {
  if (process.env.MINE_SKIP_YTDLP === '1') return false
  try {
    await execFileAsync('yt-dlp', ['--version'], {
      timeout: 2500,
      maxBuffer: 1024 * 32,
    })
    return true
  } catch {
    return false
  }
}

async function readBestCaption(info) {
  const languages = ['zh-Hans', 'zh-CN', 'zh', 'en']
  const captionGroups = [info.subtitles, info.automatic_captions].filter(Boolean)

  for (const language of languages) {
    for (const group of captionGroups) {
      const captions = group[language]
      const caption = Array.isArray(captions) && captions.find((item) => item.url && item.ext === 'vtt')
      if (caption) {
        const response = await fetch(caption.url, { headers: { 'User-Agent': userAgent } })
        if (response.ok) return parseVttToText(await response.text())
      }
    }
  }

  return ''
}

async function tryTranscribeVideo(url, aiConfig) {
  if (!hasTranscriptionConfig(aiConfig)) return ''
  const tempDir = await mkdtemp(join(tmpdir(), 'mine-video-'))

  try {
    const outputTemplate = join(tempDir, 'audio.%(ext)s')
    await execFileAsync('yt-dlp', createYtDlpArgs(['-f', 'ba', '-o', outputTemplate, '--no-warnings', url]), {
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 4,
    })
    const files = await readdir(tempDir)
    const audioName = files.find((name) => name.startsWith('audio.'))
    if (!audioName) return ''
    const audioPath = join(tempDir, audioName)
    const buffer = await readFile(audioPath)
    return transcribeBuffer(buffer, audioName, 'audio/mpeg', aiConfig)
  } catch {
    return ''
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function transcribeBuffer(buffer, fileName, mimeType, aiConfig) {
  const transcriptionConfig = effectiveTranscriptionConfig(aiConfig)
  const form = new FormData()
  form.append('model', transcriptionConfig.model)
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName)

  const response = await fetch(`${transcriptionConfig.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${transcriptionConfig.apiKey}` },
    body: form,
  })

  if (!response.ok) throw new Error(`转写接口返回 ${response.status}`)
  const data = await response.json()
  return data.text || ''
}

async function callVisionModel(imageUrl, aiConfig) {
  const visionConfig = effectiveVisionConfig(aiConfig)
  const response = await fetch(`${visionConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${visionConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: visionConfig.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请提取图片中的文字，概括主要内容，并给出适合内容素材库的标签建议。用中文 Markdown 返回。' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) throw new Error(`视觉接口返回 ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType || 'image/png'};base64,${buffer.toString('base64')}`
}

function firstLine(value) {
  return value
    .replace(/^#+\s+/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 48)
}

function baseUrl(aiConfig) {
  return (aiConfig.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
}

function effectiveVisionConfig(aiConfig) {
  const mainBaseUrl = baseUrl(aiConfig)
  const visionBaseUrl = (aiConfig.visionBaseUrl || '').trim().replace(/\/$/, '')
  const finalBaseUrl = visionBaseUrl || mainBaseUrl
  const canReuseMainKey = !visionBaseUrl || sameBaseUrl(visionBaseUrl, mainBaseUrl)

  return {
    apiKey: (aiConfig.visionApiKey || (canReuseMainKey ? aiConfig.apiKey : '') || '').trim(),
    baseUrl: finalBaseUrl || 'https://api.openai.com/v1',
    model: (aiConfig.visionModel || aiConfig.model || 'gpt-4o-mini').trim(),
  }
}

function effectiveTranscriptionConfig(aiConfig) {
  const mainBaseUrl = baseUrl(aiConfig)
  const transcriptionBaseUrl = (aiConfig.transcriptionBaseUrl || '').trim().replace(/\/$/, '')
  const finalBaseUrl = transcriptionBaseUrl || mainBaseUrl
  const canReuseMainKey = !transcriptionBaseUrl || sameBaseUrl(transcriptionBaseUrl, mainBaseUrl)

  return {
    apiKey: (aiConfig.transcriptionApiKey || (canReuseMainKey ? aiConfig.apiKey : '') || '').trim(),
    baseUrl: finalBaseUrl || 'https://api.openai.com/v1',
    model: (aiConfig.transcriptionModel || 'gpt-4o-transcribe').trim(),
  }
}

function hasTranscriptionConfig(aiConfig) {
  const config = effectiveTranscriptionConfig(aiConfig)
  return Boolean(config.apiKey && !isDeepSeekBase(config.baseUrl))
}

function sameBaseUrl(left, right) {
  return left.replace(/\/$/, '') === right.replace(/\/$/, '')
}

function isDeepSeekBase(value) {
  return /(^|\.)deepseek\.com/i.test(value)
}

function ready(result) {
  return { status: 'ready', warnings: [], ...result }
}

function needsAction(sourceType, sourceUrl, warning, title = '外部内容') {
  return {
    status: 'needs-action',
    sourceType,
    platform: sourceUrl ? detectPlatform(sourceUrl) : '外部来源',
    title,
    sourceUrl,
    markdown: buildSourceMarkdown(title, `> ${warning}`, {
      platform: sourceUrl ? detectPlatform(sourceUrl) : '外部来源',
      sourceUrl,
      importMethod: '链接卡片待补全',
      sourceType,
    }),
    extractedText: '',
    warnings: [warning],
  }
}

function videoDiagnostics(reason, transcriptionConfigured) {
  const suggestedActions = [
    {
      type: 'upload-media',
      label: '上传音视频',
      description: '如果平台限制链接解析，上传你本地能播放的视频或音频最稳定。',
    },
    {
      type: 'paste-transcript',
      label: '粘贴字幕/文案',
      description: '把视频文案、字幕或评论区整理内容粘贴进 Mine，可以立即保存并 AI 收纳。',
    },
    {
      type: 'save-link-card',
      label: '先保存链接卡片',
      description: '先把标题、平台和原始链接保存进素材库，之后再回来补充字幕或文稿。',
    },
  ]

  return {
    authConfigured: hasYtDlpAuth(),
    transcriptionConfigured,
    reason,
    suggestedActions,
  }
}

function visionDiagnostics(visionConfig) {
  return {
    reason: isDeepSeekBase(visionConfig.baseUrl)
      ? '当前图片 OCR 请求会发往 DeepSeek 文本接口，该接口不适合直接处理 image_url 图片输入。'
      : '未配置可用的视觉模型服务。',
    suggestedActions: [
      {
        type: 'configure-vision',
        label: '配置视觉服务',
        description: '文本可以继续用 DeepSeek；图片 OCR 需要单独配置支持图片输入的 Base URL、API Key 和视觉模型。',
      },
      {
        type: 'paste-transcript',
        label: '手动粘贴图片文字',
        description: '如果只是少量截图，可以先手动粘贴文字，保存后继续 AI 收纳。',
      },
    ],
  }
}

function podcastDiagnostics(audioDetected, transcriptionConfigured) {
  const suggestedActions = [
    {
      type: 'upload-media',
      label: '上传播客音频',
      description: '如果平台音频无法直接下载，上传本地音频文件可以继续转写。',
    },
    {
      type: 'paste-transcript',
      label: '粘贴节目文稿',
      description: '如果你已有 shownotes 或逐字稿，可以粘贴为素材后继续 AI 收纳。',
    },
    {
      type: 'save-link-card',
      label: '先保存链接卡片',
      description: '先保存播客标题、简介和音频来源，后续再补逐字稿或转写。',
    },
  ]

  return {
    transcriptionConfigured,
    reason: audioDetected ? '已找到音频，但还不能生成全文转写。' : '未找到可直接访问的播客音频。',
    suggestedActions,
  }
}

export function createYtDlpArgs(args) {
  const cookiesPath = process.env.MINE_YTDLP_COOKIES?.trim()
  const browser = process.env.MINE_YTDLP_BROWSER?.trim()
  const authArgs = cookiesPath
    ? ['--cookies', cookiesPath]
    : browser
      ? ['--cookies-from-browser', browser]
      : []

  return [...authArgs, '--socket-timeout', '10', ...args]
}

function ytDlpTimeout(defaultTimeout) {
  const value = Number(process.env.MINE_YTDLP_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : defaultTimeout
}

function hasYtDlpAuth() {
  return Boolean(process.env.MINE_YTDLP_COOKIES?.trim() || process.env.MINE_YTDLP_BROWSER?.trim())
}

function failed(message) {
  return {
    status: 'failed',
    sourceType: 'article',
    platform: '外部来源',
    title: '导入失败',
    sourceUrl: '',
    markdown: '',
    extractedText: '',
    warnings: [message],
  }
}

function readableError(error) {
  if (error?.code === 'ENOENT') return '本机未安装 yt-dlp'
  if (error?.killed || error?.signal === 'SIGTERM') {
    return hasYtDlpAuth()
      ? '平台响应过慢，建议稍后重试，或改用上传视频/粘贴文稿'
      : '平台需要登录状态。请配置 Cookie 后重试，或上传视频/粘贴文稿'
  }
  if (String(error?.message || '').startsWith('Command failed: yt-dlp')) {
    return hasYtDlpAuth()
      ? '平台仍然限制读取，可能是视频权限、Cookie 失效或链接不可公开访问'
      : '平台需要登录状态。请配置 Cookie 后重试，或上传视频/粘贴文稿'
  }
  return error?.message || '未知错误'
}
