// @vitest-environment node

import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createYtDlpArgs,
  extractArticleUrl,
  extractFromUrl,
  extractImage,
  extractPodcastUrl,
  getImportCapabilities,
  parseVttToText,
} from './extractors.js'

let server

beforeEach(() => {
  process.env.MINE_SKIP_YTDLP = '1'
})

afterEach(async () => {
  delete process.env.MINE_SKIP_YTDLP
  if (!server) return
  await new Promise((resolve) => server.close(resolve))
  server = undefined
})

describe('external content extractors', () => {
  it('extracts a regular html article as markdown', async () => {
    const url = await serveHTML(`
      <!doctype html>
      <html>
        <head><title>Mine Import Test</title></head>
        <body>
          <article>
            <h1>公开博客文章</h1>
            <p>这是一篇用于测试的公开文章，内容足够长，可以被 Readability 提取。</p>
            <p>Mine 应该把它转成 Markdown，并保留来源链接。</p>
          </article>
        </body>
      </html>
    `)

    const result = await extractArticleUrl(url)

    expect(result.status).toBe('ready')
    expect(result.markdown).toContain('# 公开博客文章')
    expect(result.markdown).toContain('## 来源追踪')
    expect(result.markdown).toContain('- 来源可信度：原文链接')
  })

  it('cleans vtt subtitles into readable transcript text', () => {
    expect(
      parseVttToText(`WEBVTT

1
00:00:00.000 --> 00:00:02.000
<c>第一句字幕</c>

2
00:00:02.000 --> 00:00:03.000
第二句字幕
`),
    ).toBe('第一句字幕\n第二句字幕')
  })

  it('uses the WeChat article body instead of generic page noise', async () => {
    const url = await serveHTML(`
      <!doctype html>
      <html>
        <head><title>微信公众平台</title><meta property="og:title" content="公众号真实标题"></head>
        <body>
          <h1>平台噪音标题</h1>
          <div id="activity-name">公众号真实标题</div>
          <span id="js_name">Mine 作者</span>
          <em id="publish_time">2026-06-28</em>
          <div id="js_content">
            <p>这是公众号正文第一段，应该被保留。</p>
            <p>这是公众号正文第二段，而不是页面上的推荐、广告或平台噪音。</p>
          </div>
        </body>
      </html>
    `)

    const result = await extractArticleUrl(`${url}?__biz=wechat`)

    expect(result.status).toBe('ready')
    expect(result.platform).toBe('微信公众号')
    expect(result.markdown).toContain('公众号真实标题')
    expect(result.markdown).toContain('这是公众号正文第二段')
    expect(result.markdown).not.toContain('平台噪音标题')
  })

  it('creates a podcast note from an RSS feed', async () => {
    const url = await serveXML(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Mine 播客</title>
          <item>
            <title>第一期：知识库导入</title>
            <description><![CDATA[<p>这一期讨论如何把播客内容沉淀到个人知识库。</p>]]></description>
            <enclosure url="https://example.com/audio.mp3" type="audio/mpeg" />
          </item>
        </channel>
      </rss>`)

    const result = await extractPodcastUrl(url, {})

    expect(result.sourceType).toBe('podcast')
    expect(result.title).toBe('第一期：知识库导入')
    expect(result.markdown).toContain('播客信息')
    expect(result.markdown).toContain('## 来源追踪')
    expect(result.diagnostics.suggestedActions.map((action) => action.type)).toContain('save-link-card')
  })

  it('finds a url inside pasted Douyin share text', async () => {
    const result = await extractFromUrl({
      url: '复制打开抖音，看看这个视频 https://www.douyin.com/video/not-real 这条内容很有意思',
    })

    expect(result.sourceType).toBe('video')
    expect(result.platform).toBe('抖音')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.diagnostics.suggestedActions.map((action) => action.type)).toEqual(
      expect.arrayContaining(['upload-media', 'paste-transcript', 'save-link-card']),
    )
    expect(result.markdown).toContain('## 待补全素材')
    expect(result.markdown).toContain('## 来源追踪')
  })

  it('routes Xiaohongshu links into the stable video fallback flow', async () => {
    const result = await extractFromUrl({
      url: 'https://www.xiaohongshu.com/explore/not-real',
    })

    expect(result.sourceType).toBe('video')
    expect(result.platform).toBe('小红书')
    expect(result.markdown).toContain('链接卡片待补全')
    expect(result.diagnostics.suggestedActions.map((action) => action.type)).toContain('save-link-card')
  })

  it('reports local import capabilities', async () => {
    const result = await getImportCapabilities()

    expect(result.ytDlpAvailable).toBe(false)
    expect(result.authConfigured).toBe(false)
  })

  it('passes configured cookies to the video parser', () => {
    const cookiesFile = 'C:\\mine\\cookies.txt'
    try {
      process.env.MINE_YTDLP_COOKIES = cookiesFile

      const args = createYtDlpArgs(['-J', '--skip-download', 'https://www.bilibili.com/video/BV1234567890'])

      expect(args).toContain('--cookies')
      expect(args).toContain(cookiesFile)
      expect(args).toContain('--socket-timeout')
    } finally {
      delete process.env.MINE_YTDLP_COOKIES
    }
  })

  it('returns a needs-action image result without an api key', async () => {
    const result = await extractImage({ imageUrl: 'https://example.com/a.png', aiConfig: {} })

    expect(result.status).toBe('needs-action')
    expect(result.warnings[0]).toContain('未配置')
  })

  it('does not send image OCR requests to the DeepSeek text endpoint', async () => {
    const result = await extractImage({
      imageUrl: 'https://example.com/a.png',
      aiConfig: {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        visionModel: 'deepseek-v4-flash',
      },
    })

    expect(result.status).toBe('needs-action')
    expect(result.warnings[0]).toContain('DeepSeek')
    expect(result.diagnostics.suggestedActions.map((action) => action.type)).toContain('configure-vision')
  })
})

async function serveHTML(html) {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
    response.end(html)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${address.port}/article`
}

async function serveXML(xml) {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml;charset=utf-8' })
    response.end(xml)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${address.port}/feed.xml`
}
