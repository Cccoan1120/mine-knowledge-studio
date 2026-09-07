import { randomUUID } from 'node:crypto'

export function createMemoryWikiStore({ notes }) {
  const projects = new Map()
  const pages = new Map()
  const citations = new Map()
  const links = new Map()
  const jobs = new Map()

  return {
    async listWikiProjects(userId) {
      return Array.from(projects.values())
        .filter((project) => project.userId === userId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((project) => publicProject(project, projectPages(project.id), projectJobs(project.id)))
    },

    async createWikiProject(userId, input) {
      const now = new Date().toISOString()
      const project = {
        id: randomUUID(),
        userId,
        title: String(input.title),
        topic: String(input.topic),
        scope: cloneScope(input.scope),
        scopeUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      projects.set(project.id, project)
      return detail(project)
    },

    async getWikiProject(userId, projectId) {
      const project = ownedProject(userId, projectId)
      return project ? detail(project) : null
    },

    async updateWikiProject(userId, projectId, patch) {
      const project = ownedProject(userId, projectId)
      if (!project) return null
      const now = new Date().toISOString()
      if (patch.title !== undefined) project.title = String(patch.title)
      if (patch.topic !== undefined) project.topic = String(patch.topic)
      if (patch.scope !== undefined) {
        project.scope = cloneScope(patch.scope)
        project.scopeUpdatedAt = now
      }
      project.updatedAt = now
      return detail(project)
    },

    async deleteWikiProject(userId, projectId) {
      const project = ownedProject(userId, projectId)
      if (!project) return false
      for (const page of projectPages(projectId)) removePage(page.id)
      for (const job of projectJobs(projectId)) jobs.delete(job.id)
      projects.delete(projectId)
      return true
    },

    async replaceWikiOutline(userId, projectId, outline) {
      const project = ownedProject(userId, projectId)
      if (!project) return null
      for (const page of projectPages(projectId)) removePage(page.id)
      for (const [position, item] of outline.entries()) createPage(project, item, position)
      project.updatedAt = new Date().toISOString()
      return detail(project)
    },

    async createWikiPage(userId, projectId, input) {
      const project = ownedProject(userId, projectId)
      if (!project) return null
      const page = createPage(project, input, projectPages(projectId).length)
      project.updatedAt = page.updatedAt
      return publicPage(page, project)
    },

    async updateWikiPage(userId, projectId, pageId, patch) {
      const project = ownedProject(userId, projectId)
      const page = pages.get(pageId)
      if (!project || !page || page.projectId !== projectId) return null
      if (patch.expectedUpdatedAt !== undefined && new Date(patch.expectedUpdatedAt).toISOString() !== page.updatedAt) {
        throw Object.assign(new Error('页面已被更新，请刷新后确认内容再保存。'), { status: 409 })
      }
      if (patch.title !== undefined) page.title = String(patch.title)
      if (patch.summary !== undefined) page.summary = String(patch.summary)
      if (patch.content !== undefined) page.content = String(patch.content)
      if (patch.position !== undefined) page.position = Number(patch.position)
      page.updatedAt = new Date(Math.max(Date.now(), new Date(page.updatedAt).getTime() + 1)).toISOString()
      project.updatedAt = page.updatedAt
      return publicPage(page, project)
    },

    async deleteWikiPage(userId, projectId, pageId) {
      const project = ownedProject(userId, projectId)
      const page = pages.get(pageId)
      if (!project || !page || page.projectId !== projectId) return false
      removePage(pageId)
      project.updatedAt = new Date().toISOString()
      return true
    },

    async saveGeneratedWikiPage(userId, projectId, pageId, output, { candidate = false } = {}) {
      const project = ownedProject(userId, projectId)
      const page = pages.get(pageId)
      if (!project || !page || page.projectId !== projectId) return null
      if (candidate) {
        page.candidateData = structuredClone(output)
        page.updatedAt = new Date().toISOString()
        return publicPage(page, project)
      }
      replacePageOutput(page, output)
      project.updatedAt = page.updatedAt
      return publicPage(page, project)
    },

    async acceptWikiCandidate(userId, projectId, pageId) {
      const project = ownedProject(userId, projectId)
      const page = pages.get(pageId)
      if (!project || !page || page.projectId !== projectId || !page.candidateData) return null
      replacePageOutput(page, page.candidateData)
      return publicPage(page, project)
    },

    async discardWikiCandidate(userId, projectId, pageId) {
      const project = ownedProject(userId, projectId)
      const page = pages.get(pageId)
      if (!project || !page || page.projectId !== projectId) return null
      page.candidateData = null
      page.updatedAt = new Date().toISOString()
      return publicPage(page, project)
    },

    async enqueueWikiJob(userId, projectId, { kind, pageId = null }) {
      const project = ownedProject(userId, projectId)
      const page = pageId ? pages.get(pageId) : null
      if (!project || (pageId && page?.projectId !== projectId)) return null
      const active = projectJobs(projectId).find((job) => (
        job.pageId === pageId && job.kind === kind && ['pending', 'processing'].includes(job.status)
      ))
      if (active) return publicJob(active)
      const now = new Date().toISOString()
      const job = {
        id: randomUUID(),
        userId,
        projectId,
        pageId,
        kind,
        status: 'pending',
        attempts: 0,
        availableAt: now,
        lockedAt: null,
        leaseToken: null,
        lastError: null,
        result: null,
        createdAt: now,
        updatedAt: now,
      }
      jobs.set(job.id, job)
      if (kind === 'page' && page) page.status = 'queued'
      return publicJob(job)
    },

    async claimNextWikiJob() {
      const now = new Date()
      const expired = (item) => item.status === 'processing' && new Date(item.lockedAt).getTime() <= now.getTime() - 5 * 60_000
      for (const current of jobs.values()) {
        if (!expired(current) || current.attempts < 2) continue
        current.status = 'failed'
        current.lockedAt = null
        current.leaseToken = null
        current.lastError = 'LEASE_EXPIRED'
        current.updatedAt = now.toISOString()
        const page = current.kind === 'page' ? pages.get(current.pageId) : null
        if (page) {
          page.status = 'failed'
          page.lastError = 'LEASE_EXPIRED'
          page.updatedAt = current.updatedAt
        }
      }
      const job = Array.from(jobs.values())
        .filter((item) => item.attempts < 2 && ((item.status === 'pending' && new Date(item.availableAt) <= now) || expired(item)))
        .sort((left, right) => left.availableAt.localeCompare(right.availableAt) || left.createdAt.localeCompare(right.createdAt))[0]
      if (!job) return null
      job.status = 'processing'
      job.attempts += 1
      job.lockedAt = now.toISOString()
      job.leaseToken = randomUUID()
      job.updatedAt = job.lockedAt
      const page = job.pageId ? pages.get(job.pageId) : null
      if (job.kind === 'page' && page) page.status = 'generating'
      return publicJob(job)
    },

    async loadWikiJobContext(job) {
      const current = jobs.get(job.id)
      if (!current || current.status !== 'processing' || current.leaseToken !== job.leaseToken) return null
      const project = projects.get(current.projectId)
      if (!project) return null
      const page = current.pageId ? pages.get(current.pageId) : null
      return { job: publicJob(current), project: detail(project), page: page ? publicPage(page, project) : null }
    },

    async completeWikiOutlineJob(job, outline) {
      const current = jobs.get(job.id)
      const project = projects.get(job.projectId)
      if (!locked(current, job) || !project) return false
      for (const page of projectPages(project.id)) removePage(page.id)
      for (const [position, item] of outline.entries()) createPage(project, item, position)
      finishJob(current, outline)
      project.updatedAt = current.updatedAt
      return true
    },

    async completeWikiPageJob(job, output) {
      const current = jobs.get(job.id)
      const project = projects.get(job.projectId)
      const page = job.pageId ? pages.get(job.pageId) : null
      if (!locked(current, job) || !project || !page) return false
      if (job.kind === 'refresh') {
        page.candidateData = structuredClone(output)
        page.updatedAt = new Date().toISOString()
      } else {
        replacePageOutput(page, output)
      }
      finishJob(current, output)
      project.updatedAt = current.updatedAt
      return true
    },

    async recordWikiJobFailure(job, { retryAt, errorCode }) {
      const current = jobs.get(job.id)
      if (!locked(current, job)) return false
      current.status = retryAt ? 'pending' : 'failed'
      current.availableAt = retryAt ? retryAt.toISOString() : current.availableAt
      current.lockedAt = null
      current.leaseToken = null
      current.lastError = errorCode
      current.updatedAt = new Date().toISOString()
      const page = job.pageId ? pages.get(job.pageId) : null
      if (!retryAt && job.kind === 'page' && page) {
        page.status = 'failed'
        page.lastError = errorCode
      }
      return true
    },
  }

  function ownedProject(userId, projectId) {
    const project = projects.get(projectId)
    return project?.userId === userId ? project : null
  }

  function createPage(project, input, position) {
    const now = new Date().toISOString()
    const page = {
      id: randomUUID(),
      projectId: project.id,
      title: String(input.title),
      slug: uniqueSlug(project.id, input.slug || input.title),
      summary: String(input.summary || ''),
      content: '',
      position,
      status: 'planned',
      lastError: null,
      generatedAt: null,
      candidateData: null,
      createdAt: now,
      updatedAt: now,
    }
    pages.set(page.id, page)
    return page
  }

  function replacePageOutput(page, output) {
    for (const [id, citation] of citations) if (citation.pageId === page.id) citations.delete(id)
    for (const [key, link] of links) if (link.fromPageId === page.id) links.delete(key)
    for (const item of output.citations || []) {
      const id = String(item.id || randomUUID())
      citations.set(id, { ...item, id, pageId: page.id })
    }
    for (const toPageId of output.linkedPageIds || []) {
      const target = pages.get(toPageId)
      if (target?.projectId === page.projectId && target.id !== page.id) {
        links.set(`${page.id}:${target.id}`, { fromPageId: page.id, toPageId: target.id })
      }
    }
    page.content = String(output.content || '')
    page.status = 'ready'
    page.lastError = null
    page.generatedAt = output.generatedAt || new Date().toISOString()
    page.candidateData = null
    page.updatedAt = new Date(Math.max(Date.now(), new Date(page.updatedAt).getTime() + 1)).toISOString()
  }

  function detail(project) {
    return {
      ...publicProject(project, projectPages(project.id), projectJobs(project.id)),
      scope: cloneScope(project.scope),
      pages: projectPages(project.id).map((page) => publicPage(page, project)),
      jobs: projectJobs(project.id).map(publicJob),
    }
  }

  function publicPage(page, project) {
    const pageCitations = Array.from(citations.values()).filter((citation) => citation.pageId === page.id)
    const outgoing = Array.from(links.values()).filter((link) => link.fromPageId === page.id).map((link) => link.toPageId)
    const incoming = Array.from(links.values()).filter((link) => link.toPageId === page.id).map((link) => link.fromPageId)
    const publicCitations = pageCitations.map((citation) => {
      const source = citation.noteId ? notes.get(citation.noteId) : null
      return {
        ...citation,
        noteId: source ? citation.noteId : null,
        sourceMissing: !source,
      }
    })
    const stale = Boolean(page.generatedAt) && (
      project.scopeUpdatedAt > page.generatedAt ||
      publicCitations.some((citation) => citation.sourceMissing || notes.get(citation.noteId)?.updatedAt !== citation.sourceUpdatedAt)
    )
    return {
      ...page,
      citations: publicCitations,
      linkedPageIds: outgoing,
      backlinkPageIds: incoming,
      stale,
      sourceMissing: publicCitations.some((citation) => citation.sourceMissing),
      hasCandidate: Boolean(page.candidateData),
    }
  }

  function projectPages(projectId) {
    return Array.from(pages.values())
      .filter((page) => page.projectId === projectId)
      .sort((left, right) => left.position - right.position)
  }

  function projectJobs(projectId) {
    return Array.from(jobs.values()).filter((job) => job.projectId === projectId)
  }

  function removePage(pageId) {
    pages.delete(pageId)
    for (const [id, citation] of citations) if (citation.pageId === pageId) citations.delete(id)
    for (const [key, link] of links) if (link.fromPageId === pageId || link.toPageId === pageId) links.delete(key)
  }

  function uniqueSlug(projectId, value) {
    const base = slugify(value) || 'page'
    const used = new Set(projectPages(projectId).map((page) => page.slug))
    if (!used.has(base)) return base
    let index = 2
    while (used.has(`${base}-${index}`)) index += 1
    return `${base}-${index}`
  }
}

function publicProject(project, pages, jobs) {
  return {
    id: project.id,
    title: project.title,
    topic: project.topic,
    status: projectStatus(pages, jobs),
    pageCount: pages.length,
    readyPageCount: pages.filter((page) => page.status === 'ready').length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

function projectStatus(pages, jobs) {
  if (jobs.some((job) => job.kind === 'outline' && ['pending', 'processing'].includes(job.status))) return 'outlining'
  if (jobs.some((job) => ['page', 'refresh'].includes(job.kind) && ['pending', 'processing'].includes(job.status))) return 'generating'
  if (pages.some((page) => page.status === 'failed')) return 'partial-failure'
  if (pages.length && pages.every((page) => page.status === 'ready')) return 'ready'
  if (pages.length) return 'outline-ready'
  return 'draft'
}

function publicJob(job) {
  return { ...job, leaseToken: job.leaseToken || undefined }
}

function locked(current, claimed) {
  return Boolean(current && current.status === 'processing' && current.leaseToken === claimed.leaseToken)
}

function finishJob(job, result) {
  job.status = 'succeeded'
  job.lockedAt = null
  job.leaseToken = null
  job.lastError = null
  job.result = structuredClone(result)
  job.updatedAt = new Date().toISOString()
}

function cloneScope(scope = {}) {
  return {
    noteIds: [...(scope.noteIds || [])],
    topics: [...(scope.topics || [])],
    tags: [...(scope.tags || [])],
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}
