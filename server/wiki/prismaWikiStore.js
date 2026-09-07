import { randomUUID } from 'node:crypto'

export function createPrismaWikiStore(prisma) {
  return {
    async listWikiProjects(userId) {
      const projects = await prisma.wikiProject.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          pages: { select: { status: true } },
          jobs: { where: { status: { in: ['pending', 'processing'] } }, select: { kind: true, status: true } },
        },
      })
      return projects.map(publicProject)
    },

    async createWikiProject(userId, input) {
      const project = await prisma.wikiProject.create({
        data: { userId, title: input.title, topic: input.topic, scope: input.scope },
        include: { pages: true, jobs: true },
      })
      return publicDetail(project)
    },

    async getWikiProject(userId, projectId) {
      const project = await loadProject(prisma, userId, projectId)
      return project ? publicDetail(project) : null
    },

    async updateWikiProject(userId, projectId, patch) {
      const current = await prisma.wikiProject.findFirst({ where: { id: projectId, userId } })
      if (!current) return null
      const data = {}
      if (patch.title !== undefined) data.title = patch.title
      if (patch.topic !== undefined) data.topic = patch.topic
      if (patch.scope !== undefined) {
        data.scope = patch.scope
        data.scopeUpdatedAt = new Date()
      }
      await prisma.wikiProject.update({ where: { id: projectId }, data })
      return publicDetail(await loadProject(prisma, userId, projectId))
    },

    async deleteWikiProject(userId, projectId) {
      const result = await prisma.wikiProject.deleteMany({ where: { id: projectId, userId } })
      return result.count === 1
    },

    async replaceWikiOutline(userId, projectId, outline) {
      const updated = await prisma.$transaction(async (transaction) => {
        const project = await transaction.wikiProject.findFirst({ where: { id: projectId, userId } })
        if (!project) return false
        await transaction.wikiPage.deleteMany({ where: { projectId } })
        const used = new Set()
        for (const [position, item] of outline.entries()) {
          await transaction.wikiPage.create({
            data: {
              projectId,
              title: item.title,
              slug: uniqueSlug(item.slug || item.title, used),
              summary: item.summary || '',
              position,
            },
          })
        }
        await transaction.wikiProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } })
        return true
      })
      return updated ? publicDetail(await loadProject(prisma, userId, projectId)) : null
    },

    async createWikiPage(userId, projectId, input) {
      const project = await prisma.wikiProject.findFirst({ where: { id: projectId, userId } })
      if (!project) return null
      const existing = await prisma.wikiPage.findMany({ where: { projectId }, select: { slug: true } })
      const page = await prisma.wikiPage.create({
        data: {
          projectId,
          title: input.title,
          slug: uniqueSlug(input.slug || input.title, new Set(existing.map((item) => item.slug))),
          summary: input.summary || '',
          position: await prisma.wikiPage.count({ where: { projectId } }),
        },
      })
      return publicPage(page, project)
    },

    async updateWikiPage(userId, projectId, pageId, patch) {
      const page = await ownedPage(prisma, userId, projectId, pageId)
      if (!page) return null
      if (patch.expectedUpdatedAt !== undefined && iso(patch.expectedUpdatedAt) !== iso(page.updatedAt)) throw editConflict()
      const data = { updatedAt: nextUpdatedAt(page.updatedAt) }
      for (const field of ['title', 'summary', 'content', 'position']) {
        if (patch[field] !== undefined) data[field] = patch[field]
      }
      return prisma.$transaction(async (transaction) => {
        const result = await transaction.wikiPage.updateMany({ where: { id: pageId, updatedAt: page.updatedAt }, data })
        if (result.count !== 1) throw editConflict()
        const updated = await transaction.wikiPage.findUnique({
          where: { id: pageId },
          include: {
            citations: { include: { note: { select: { updatedAt: true } } } },
            outgoingLinks: true,
            incomingLinks: true,
          },
        })
        return publicPage(updated, page.project)
      })
    },

    async deleteWikiPage(userId, projectId, pageId) {
      const page = await ownedPage(prisma, userId, projectId, pageId)
      if (!page) return false
      await prisma.wikiPage.delete({ where: { id: pageId } })
      return true
    },

    async saveGeneratedWikiPage(userId, projectId, pageId, output, { candidate = false } = {}) {
      const saved = await prisma.$transaction(async (transaction) => {
        const page = await ownedPage(transaction, userId, projectId, pageId)
        if (!page) return false
        if (candidate) {
          await transaction.wikiPage.update({ where: { id: pageId }, data: { candidateData: output } })
          return true
        }
        await replacePageOutput(transaction, pageId, projectId, output)
        return true
      })
      if (!saved) return null
      const project = await loadProject(prisma, userId, projectId)
      return publicPage(project.pages.find((page) => page.id === pageId), project)
    },

    async acceptWikiCandidate(userId, projectId, pageId) {
      const accepted = await prisma.$transaction(async (transaction) => {
        const page = await ownedPage(transaction, userId, projectId, pageId)
        if (!page?.candidateData) return false
        await replacePageOutput(transaction, pageId, projectId, page.candidateData)
        await transaction.wikiGenerationJob.updateMany({
          where: { userId, projectId, pageId, kind: 'refresh', status: 'succeeded' },
          data: { status: 'accepted' },
        })
        return true
      })
      if (!accepted) return null
      const project = await loadProject(prisma, userId, projectId)
      return publicPage(project.pages.find((page) => page.id === pageId), project)
    },

    async discardWikiCandidate(userId, projectId, pageId) {
      const page = await ownedPage(prisma, userId, projectId, pageId)
      if (!page) return null
      await prisma.$transaction([
        prisma.wikiPage.update({ where: { id: pageId }, data: { candidateData: null } }),
        prisma.wikiGenerationJob.updateMany({
          where: { userId, projectId, pageId, kind: 'refresh', status: 'succeeded' },
          data: { status: 'discarded' },
        }),
      ])
      const project = await loadProject(prisma, userId, projectId)
      return publicPage(project.pages.find((item) => item.id === pageId), project)
    },

    async enqueueWikiJob(userId, projectId, { kind, pageId = null }) {
      const project = await prisma.wikiProject.findFirst({ where: { id: projectId, userId } })
      if (!project) return null
      if (pageId && !await ownedPage(prisma, userId, projectId, pageId)) return null
      const active = await prisma.wikiGenerationJob.findFirst({
        where: { userId, projectId, pageId, kind, status: { in: ['pending', 'processing'] } },
      })
      if (active) return active
      return prisma.$transaction(async (transaction) => {
        if (kind === 'page' && pageId) {
          await transaction.wikiPage.update({
            where: { id: pageId },
            data: { status: 'queued', lastError: null },
          })
        }
        return transaction.wikiGenerationJob.create({ data: { userId, projectId, pageId, kind } })
      })
    },

    async claimNextWikiJob() {
      return prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`
          WITH expired AS (
            UPDATE "WikiGenerationJob"
            SET "status" = 'failed', "lockedAt" = NULL, "leaseToken" = NULL,
                "lastError" = 'LEASE_EXPIRED', "updatedAt" = NOW()
            WHERE "status" = 'processing' AND "attempts" >= 2
              AND "lockedAt" <= NOW() - INTERVAL '5 minutes'
            RETURNING "pageId", "kind"
          )
          UPDATE "WikiPage" AS page
          SET "status" = 'failed', "lastError" = 'LEASE_EXPIRED', "updatedAt" = NOW()
          FROM expired
          WHERE page."id" = expired."pageId" AND expired."kind" = 'page'
        `)
        const [job] = await transaction.$queryRawUnsafe(`
          UPDATE "WikiGenerationJob" AS job
          SET "status" = 'processing',
              "attempts" = job."attempts" + 1,
              "lockedAt" = NOW(),
              "leaseToken" = gen_random_uuid()::text,
              "updatedAt" = NOW()
          FROM (
            SELECT "id"
            FROM "WikiGenerationJob"
            WHERE "attempts" < 2 AND (
              ("status" = 'pending' AND "availableAt" <= NOW())
              OR ("status" = 'processing' AND "lockedAt" <= NOW() - INTERVAL '5 minutes')
            )
            ORDER BY "availableAt" ASC, "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          ) AS candidate
          WHERE job."id" = candidate."id"
          RETURNING job.*
        `)
        if (!job) return null
        if (job.kind === 'page' && job.pageId) {
          await transaction.wikiPage.update({ where: { id: job.pageId }, data: { status: 'generating' } })
        }
        return internalJob(job)
      })
    },

    async loadWikiJobContext(job) {
      if (!job.leaseToken) return null
      const current = await prisma.wikiGenerationJob.findFirst({
        where: { id: job.id, status: 'processing', leaseToken: job.leaseToken },
      })
      if (!current) return null
      const project = await loadProject(prisma, current.userId, current.projectId)
      if (!project) return null
      return {
        job: internalJob(current),
        project: publicDetail(project),
        page: current.pageId ? publicPage(project.pages.find((page) => page.id === current.pageId), project) : null,
      }
    },

    async completeWikiOutlineJob(job, outline) {
      if (!job.leaseToken) return false
      return prisma.$transaction(async (transaction) => {
        const current = await lockedJob(transaction, job)
        if (!current) return false
        await transaction.wikiPage.deleteMany({ where: { projectId: job.projectId } })
        const used = new Set()
        for (const [position, item] of outline.entries()) {
          await transaction.wikiPage.create({
            data: {
              projectId: job.projectId,
              title: item.title,
              slug: uniqueSlug(item.title, used),
              summary: item.summary,
              position,
            },
          })
        }
        await finishJob(transaction, job.id)
        return true
      })
    },

    async completeWikiPageJob(job, output) {
      if (!job.leaseToken || !job.pageId) return false
      return prisma.$transaction(async (transaction) => {
        const current = await lockedJob(transaction, job)
        if (!current) return false
        if (job.kind === 'refresh') {
          await transaction.wikiPage.update({ where: { id: job.pageId }, data: { candidateData: output } })
        } else {
          await replacePageOutput(transaction, job.pageId, job.projectId, output)
        }
        await finishJob(transaction, job.id, output)
        return true
      })
    },

    async recordWikiJobFailure(job, { retryAt, errorCode }) {
      if (!job.leaseToken) return false
      return prisma.$transaction(async (transaction) => {
        const data = retryAt
          ? { status: 'pending', availableAt: retryAt, lockedAt: null, leaseToken: null, lastError: errorCode }
          : { status: 'failed', lockedAt: null, leaseToken: null, lastError: errorCode }
        const result = await transaction.wikiGenerationJob.updateMany({
          where: { id: job.id, status: 'processing', leaseToken: job.leaseToken },
          data,
        })
        if (result.count !== 1) return false
        if (!retryAt && job.kind === 'page' && job.pageId) {
          await transaction.wikiPage.update({ where: { id: job.pageId }, data: { status: 'failed', lastError: errorCode } })
        }
        return true
      })
    },
  }
}

async function loadProject(prisma, userId, projectId) {
  return prisma.wikiProject.findFirst({
    where: { id: projectId, userId },
    include: {
      pages: {
        orderBy: { position: 'asc' },
        include: {
          citations: { include: { note: { select: { updatedAt: true } } } },
          outgoingLinks: true,
          incomingLinks: true,
        },
      },
      jobs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  })
}

function ownedPage(prisma, userId, projectId, pageId) {
  return prisma.wikiPage.findFirst({
    where: { id: pageId, projectId, project: { userId } },
    include: { project: true },
  })
}

async function replacePageOutput(transaction, pageId, projectId, output) {
  await transaction.wikiCitation.deleteMany({ where: { pageId } })
  await transaction.wikiPageLink.deleteMany({ where: { fromPageId: pageId } })
  if (output.citations?.length) {
    await transaction.wikiCitation.createMany({
      data: output.citations.map((citation) => ({
        id: citation.id || randomUUID(),
        pageId,
        noteId: citation.noteId,
        chunkId: citation.chunkId,
        noteTitle: citation.noteTitle,
        quote: citation.quote,
        sourceUrl: citation.sourceUrl || '',
        sourceUpdatedAt: citation.sourceUpdatedAt ? new Date(citation.sourceUpdatedAt) : null,
      })),
    })
  }
  const linkedPageIds = [...new Set(output.linkedPageIds || [])].filter((id) => id !== pageId)
  if (linkedPageIds.length) {
    const valid = await transaction.wikiPage.findMany({
      where: { id: { in: linkedPageIds }, projectId },
      select: { id: true },
    })
    if (valid.length) {
      await transaction.wikiPageLink.createMany({
        data: valid.map((page) => ({ fromPageId: pageId, toPageId: page.id })),
        skipDuplicates: true,
      })
    }
  }
  await transaction.wikiPage.update({
    where: { id: pageId },
    data: {
      content: output.content,
      status: 'ready',
      lastError: null,
      generatedAt: output.generatedAt ? new Date(output.generatedAt) : new Date(),
      candidateData: null,
    },
  })
}

function publicDetail(project) {
  return {
    ...publicProject(project),
    scope: project.scope,
    pages: project.pages.map((page) => publicPage(page, project)),
    jobs: project.jobs.map(publicJob),
  }
}

function publicProject(project) {
  const pages = project.pages || []
  const jobs = project.jobs || []
  return {
    id: project.id,
    title: project.title,
    topic: project.topic,
    status: projectStatus(pages, jobs),
    pageCount: pages.length,
    readyPageCount: pages.filter((page) => page.status === 'ready').length,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  }
}

function publicPage(page, project) {
  const citations = (page.citations || []).map((citation) => ({
    id: citation.id,
    chunkId: citation.chunkId,
    noteId: citation.noteId,
    noteTitle: citation.noteTitle,
    quote: citation.quote,
    sourceUrl: citation.sourceUrl,
    sourceUpdatedAt: iso(citation.sourceUpdatedAt),
    sourceMissing: !citation.noteId,
  }))
  const stale = Boolean(page.generatedAt) && (
    new Date(project.scopeUpdatedAt) > new Date(page.generatedAt) ||
    (page.citations || []).some((citation) => !citation.noteId || iso(citation.note?.updatedAt) !== iso(citation.sourceUpdatedAt))
  )
  return {
    id: page.id,
    projectId: page.projectId,
    title: page.title,
    slug: page.slug,
    summary: page.summary,
    content: page.content,
    position: page.position,
    status: page.status,
    lastError: page.lastError,
    generatedAt: iso(page.generatedAt),
    createdAt: iso(page.createdAt),
    updatedAt: iso(page.updatedAt),
    citations,
    linkedPageIds: (page.outgoingLinks || []).map((link) => link.toPageId),
    backlinkPageIds: (page.incomingLinks || []).map((link) => link.fromPageId),
    stale,
    sourceMissing: citations.some((citation) => citation.sourceMissing),
    hasCandidate: Boolean(page.candidateData),
    candidateData: page.candidateData || null,
  }
}

function publicJob(job) {
  return {
    id: job.id,
    projectId: job.projectId,
    pageId: job.pageId,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    leaseToken: job.leaseToken || undefined,
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

function uniqueSlug(value, used) {
  const base = slugify(value) || 'page'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let index = 2
  while (used.has(`${base}-${index}`)) index += 1
  const slug = `${base}-${index}`
  used.add(slug)
  return slug
}

function slugify(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

async function lockedJob(transaction, job) {
  const [current] = await transaction.$queryRawUnsafe(`
    SELECT * FROM "WikiGenerationJob"
    WHERE "id" = $1 AND "status" = 'processing' AND "leaseToken" = $2
    FOR UPDATE
  `, job.id, job.leaseToken)
  return current || null
}

function internalJob(job) {
  return { ...publicJob(job), userId: job.userId }
}

function nextUpdatedAt(previous) {
  return new Date(Math.max(Date.now(), new Date(previous).getTime() + 1))
}

function editConflict() {
  return Object.assign(new Error('页面已被更新，请刷新后确认内容再保存。'), { status: 409 })
}

function finishJob(transaction, jobId, result) {
  return transaction.wikiGenerationJob.update({
    where: { id: jobId },
    data: { status: 'succeeded', lockedAt: null, leaseToken: null, lastError: null, ...(result ? { result } : {}) },
  })
}

function iso(value) {
  return value ? new Date(value).toISOString() : null
}
