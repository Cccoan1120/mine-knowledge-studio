export function createWikiService({ store, chatConfigured }) {
  return {
    async queueOutline(userId, projectId) {
      requireChat(chatConfigured)
      const project = await store.getWikiProject(userId, projectId)
      if (!project) return null
      if (project.pages.some((page) => ['queued', 'generating', 'ready'].includes(page.status))) {
        throw conflict('已有正文后不能重新生成目录。')
      }
      await requireCoverage(store, userId, project.scope)
      return store.enqueueWikiJob(userId, projectId, { kind: 'outline' })
    },

    async queuePages(userId, projectId, pageIds) {
      requireChat(chatConfigured)
      const project = await store.getWikiProject(userId, projectId)
      if (!project) return null
      await requireCoverage(store, userId, project.scope)
      const pages = pageIds.map((id) => project.pages.find((page) => page.id === id))
      if (pages.some((page) => !page)) throw conflict('页面不属于当前 Wiki。')
      const jobs = []
      for (const page of pages) {
        if (!['planned', 'failed'].includes(page.status)) continue
        jobs.push(await store.enqueueWikiJob(userId, projectId, { kind: 'page', pageId: page.id }))
      }
      return jobs.filter(Boolean)
    },

    async queueRefresh(userId, projectId, pageId) {
      requireChat(chatConfigured)
      const project = await store.getWikiProject(userId, projectId)
      if (!project) return null
      const page = project.pages.find((item) => item.id === pageId)
      if (!page) return null
      if (page.status !== 'ready') throw conflict('页面正文尚未生成。')
      if (page.hasCandidate) throw conflict('请先处理当前候选版本。')
      await requireCoverage(store, userId, project.scope)
      return store.enqueueWikiJob(userId, projectId, { kind: 'refresh', pageId })
    },

    async exportProject(userId, projectId) {
      const project = await store.getWikiProject(userId, projectId)
      return project ? exportWikiMarkdown(project) : null
    },

    async exportPage(userId, projectId, pageId) {
      const project = await store.getWikiProject(userId, projectId)
      if (!project) return null
      const page = project.pages.find((item) => item.id === pageId)
      return page ? exportWikiPageMarkdown(page) : null
    },
  }
}

export function exportWikiMarkdown(project) {
  const pages = [...project.pages].sort((left, right) => left.position - right.position)
  const toc = pages.map((page) => `- [${page.title}](#${page.slug})`).join('\n')
  const body = pages.map((page) => {
    const content = page.content.replace(/\]\((?:\.\/)?([^)]+)\.md\)/g, '](#$1)')
    return [`## ${page.title} {#${page.slug}}`, content, citationFootnotes(page, content)].filter(Boolean).join('\n\n')
  }).join('\n\n---\n\n')
  return `# ${project.title}\n\n${toc}\n\n${body}\n`
}

export function exportWikiPageMarkdown(page) {
  const footnotes = citationFootnotes(page, page.content)
  return [`# ${page.title}`, page.content, footnotes].filter(Boolean).join('\n\n') + '\n'
}

function citationFootnotes(page, content) {
  const used = new Set([...content.matchAll(/\[\^([^\]]+)\]/g)].map((match) => match[1]))
  return page.citations
    .filter((citation) => used.has(citation.id))
    .map((citation) => {
      const source = citation.sourceUrl ? `[${citation.noteTitle}](${citation.sourceUrl})` : citation.noteTitle
      return `[^${citation.id}]: ${citation.quote} - ${source}`
    })
    .join('\n')
}

async function requireCoverage(store, userId, scope) {
  const coverage = await store.getIndexCoverage(userId, scope)
  if (!coverage.total) throw conflict('当前范围没有可用于生成的素材。')
  if (coverage.ready !== coverage.total) {
    const error = conflict('当前范围的素材索引尚未完成。')
    error.coverage = coverage
    throw error
  }
  return coverage
}

function requireChat(configured) {
  if (!configured) throw conflict('平台 LLM 尚未配置，Wiki 生成暂不可用。')
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 })
}
