export const evaluationNotes = [
  {
    key: 'meeting-capture',
    title: '会议记录 Meeting Capture',
    topic: 'Workflow',
    tags: ['meeting', 'capture'],
    content: '会议结束后五分钟内记录 decision owner 和 deadline。快速 capture 能减少后续信息丢失。',
  },
  {
    key: 'weekly-review',
    title: '每周复盘 Weekly Review',
    topic: 'Workflow',
    tags: ['review', 'planning'],
    content: '每周五进行 weekly review，先清空 inbox，再确认下周 three priorities。',
  },
  {
    key: 'reading-notes',
    title: '阅读笔记 Reading Notes',
    topic: 'Learning',
    tags: ['reading', 'notes'],
    content: '阅读时先写一句 original insight，再补充 source quote 和自己的反驳。',
  },
  {
    key: 'customer-interview',
    title: '用户访谈 Customer Interview',
    topic: 'Research',
    tags: ['customer', 'interview'],
    content: 'Customer interview 要追问最近一次真实行为，不要只询问未来意愿。',
  },
  {
    key: 'launch-checklist',
    title: '发布清单 Launch Checklist',
    topic: 'Product',
    tags: ['launch', 'checklist'],
    content: 'Launch 前检查 rollback plan、health endpoint 和 database backup。',
  },
  {
    key: 'deep-work',
    title: '深度工作 Deep Work',
    topic: 'Focus',
    tags: ['focus', 'deep-work'],
    content: '上午九点到十一点关闭 notification，保留一个 deep work block。',
  },
  {
    key: 'idea-triage',
    title: '灵感筛选 Idea Triage',
    topic: 'Writing',
    tags: ['idea', 'triage'],
    content: '新 idea 先进入 inbox，只有关联到 active project 才升级为 task。',
  },
  {
    key: 'source-trust',
    title: '来源可信度 Source Trust',
    topic: 'Research',
    tags: ['source', 'trust'],
    content: '引用数据前核对 primary source、发布日期和 sample size。',
  },
  {
    key: 'feedback-loop',
    title: '反馈循环 Feedback Loop',
    topic: 'Product',
    tags: ['feedback', 'experiment'],
    content: '每个 experiment 都要定义 signal、review date 和下一步 feedback loop。',
  },
  {
    key: 'writing-outline',
    title: '写作提纲 Writing Outline',
    topic: 'Writing',
    tags: ['writing', 'outline'],
    content: 'Writing outline 先列 reader question，再安排 evidence 和 conclusion。',
  },
  {
    key: 'api-errors',
    title: '接口错误 API Errors',
    topic: 'Engineering',
    tags: ['api', 'errors'],
    content: 'API error log 只记录 request id 和 fixed category，不保存 payload content。',
  },
  {
    key: 'database-migration',
    title: '数据库迁移 Database Migration',
    topic: 'Engineering',
    tags: ['database', 'migration'],
    content: 'Database migration 先在 disposable staging 验证，再执行 production deploy。',
  },
  {
    key: 'vector-search',
    title: '向量检索 Vector Search',
    topic: 'Engineering',
    tags: ['vector', 'search'],
    content: 'Vector search 使用 cosine distance，embedding dimensions 固定为 1536。',
  },
  {
    key: 'keyword-search',
    title: '关键词检索 Keyword Search',
    topic: 'Engineering',
    tags: ['keyword', 'search'],
    content: '中文检索使用 bigram token，English keyword 统一 lowercase normalization。',
  },
  {
    key: 'hybrid-ranking',
    title: '混合排序 Hybrid Ranking',
    topic: 'Engineering',
    tags: ['hybrid', 'ranking'],
    content: 'Hybrid ranking 用 reciprocal rank fusion 合并 dense 和 keyword results。',
  },
  {
    key: 'citation-validation',
    title: '引用校验 Citation Validation',
    topic: 'Safety',
    tags: ['citation', 'validation'],
    content: '每条 citation quote 必须是 source chunk 的 exact substring。',
  },
  {
    key: 'secret-handling',
    title: '密钥管理 Secret Handling',
    topic: 'Safety',
    tags: ['secret', 'security'],
    content: 'API key 和 database URL 只放 environment，不进入 log 或 note。',
  },
  {
    key: 'stale-writes',
    title: '过期写入 Stale Writes',
    topic: 'Engineering',
    tags: ['lease', 'concurrency'],
    content: 'Worker 用 lease token 和 content hash 拒绝 stale write。',
  },
  {
    key: 'retry-policy',
    title: '重试策略 Retry Policy',
    topic: 'Engineering',
    tags: ['retry', 'worker'],
    content: 'Retry policy 使用 5 seconds、30 seconds、5 minutes 三段 backoff。',
  },
  {
    key: 'user-isolation',
    title: '用户隔离 User Isolation',
    topic: 'Safety',
    tags: ['privacy', 'isolation'],
    content: '所有 retrieval SQL 同时约束 chunk userId 和 note userId。',
  },
  {
    key: 'async-backfill',
    title: '异步回填 Async Backfill',
    topic: 'Operations',
    tags: ['backfill', 'indexing'],
    content: '旧 notes 通过 async backfill 建立索引，ready content 继续可查询。',
  },
  {
    key: 'rollback-mode',
    title: '回滚模式 Rollback Mode',
    topic: 'Operations',
    tags: ['rollback', 'keyword'],
    content: '关闭 Embedding config 会 non-destructive rollback 到 keyword mode。',
  },
  {
    key: 'smoke-test',
    title: '冒烟测试 Smoke Test',
    topic: 'Operations',
    tags: ['smoke', 'search'],
    content: 'Staging smoke test 要确认 created 或 edited note 在 60 seconds 内可搜索。',
  },
  {
    key: 'password-rotation',
    title: '密码轮换 Password Rotation',
    topic: 'Operations',
    tags: ['password', 'launch'],
    content: '正式 launch 前 rotate Neon password，再更新 deployment DATABASE_URL。',
  },
  {
    key: 'context-diversity',
    title: '上下文多样性 Context Diversity',
    topic: 'AI',
    tags: ['context', 'diversity'],
    content: 'Context selection 每个 note 最多 two chunks，总计最多 eight chunks。',
  },
  {
    key: 'question-rewrite',
    title: '问题改写 Question Rewrite',
    topic: 'AI',
    tags: ['question', 'rewrite'],
    content: 'Follow-up question rewrite 只使用最近的 user history，不拼接 assistant text。',
  },
  {
    key: 'content-hash',
    title: '内容哈希 Content Hash',
    topic: 'Engineering',
    tags: ['hash', 'indexing'],
    content: 'Content hash 变化时重新 queue index job，metadata-only edit 不触发。',
  },
  {
    key: 'delete-cascade',
    title: '级联删除 Delete Cascade',
    topic: 'Engineering',
    tags: ['delete', 'cascade'],
    content: '删除 note 时 database cascade 会同时移除 chunks 和 index job。',
  },
  {
    key: 'safe-metrics',
    title: '安全指标 Safe Metrics',
    topic: 'Operations',
    tags: ['metrics', 'privacy'],
    content: 'Safe metrics 仅包含 duration、mode、counts 和 fixed failure category。',
  },
  {
    key: 'evidence-threshold',
    title: '证据门槛 Evidence Threshold',
    topic: 'AI',
    tags: ['evidence', 'evaluation'],
    content: 'Retrieval evaluation 要求 expected evidence top five hit rate 至少 90 percent。',
  },
]

export const evaluationQuestions = [
  { question: '会议结束后如何 capture 决策？', expectedKey: 'meeting-capture', expectedOrdinal: 0, expectedQuote: '会议结束后五分钟内记录 decision owner 和 deadline。' },
  { question: 'weekly review 应该确认什么？', expectedKey: 'weekly-review', expectedOrdinal: 0, expectedQuote: '每周五进行 weekly review，先清空 inbox，再确认下周 three priorities。' },
  { question: '阅读笔记怎样记录自己的 insight？', expectedKey: 'reading-notes', expectedOrdinal: 0, expectedQuote: '阅读时先写一句 original insight，再补充 source quote 和自己的反驳。' },
  { question: 'Customer interview 应该追问什么？', expectedKey: 'customer-interview', expectedOrdinal: 0, expectedQuote: 'Customer interview 要追问最近一次真实行为，不要只询问未来意愿。' },
  { question: 'Launch checklist 包含哪些上线保护？', expectedKey: 'launch-checklist', expectedOrdinal: 0, expectedQuote: 'Launch 前检查 rollback plan、health endpoint 和 database backup。' },
  { question: '什么时候安排 deep work block？', expectedKey: 'deep-work', expectedOrdinal: 0, expectedQuote: '上午九点到十一点关闭 notification，保留一个 deep work block。' },
  { question: '如何判断新 idea 是否升级成 task？', expectedKey: 'idea-triage', expectedOrdinal: 0, expectedQuote: '新 idea 先进入 inbox，只有关联到 active project 才升级为 task。' },
  { question: '引用数据前怎样检查 source trust？', expectedKey: 'source-trust', expectedOrdinal: 0, expectedQuote: '引用数据前核对 primary source、发布日期和 sample size。' },
  { question: 'Writing outline 从什么开始？', expectedKey: 'writing-outline', expectedOrdinal: 0, expectedQuote: 'Writing outline 先列 reader question，再安排 evidence 和 conclusion。' },
  { question: 'API error log 可以记录什么？', expectedKey: 'api-errors', expectedOrdinal: 0, expectedQuote: 'API error log 只记录 request id 和 fixed category，不保存 payload content。' },
  { question: 'vector search 的维度和距离是什么？', expectedKey: 'vector-search', expectedOrdinal: 0, expectedQuote: 'Vector search 使用 cosine distance，embedding dimensions 固定为 1536。' },
  { question: '中文和 English keyword 如何 tokenize？', expectedKey: 'keyword-search', expectedOrdinal: 0, expectedQuote: '中文检索使用 bigram token，English keyword 统一 lowercase normalization。' },
  { question: 'dense 与 keyword results 如何融合？', expectedKey: 'hybrid-ranking', expectedOrdinal: 0, expectedQuote: 'Hybrid ranking 用 reciprocal rank fusion 合并 dense 和 keyword results。' },
  { question: 'citation quote 的校验规则是什么？', expectedKey: 'citation-validation', expectedOrdinal: 0, expectedQuote: '每条 citation quote 必须是 source chunk 的 exact substring。' },
  { question: '如何阻止 worker stale write？', expectedKey: 'stale-writes', expectedOrdinal: 0, expectedQuote: 'Worker 用 lease token 和 content hash 拒绝 stale write。' },
  { question: 'index retry 的 backoff 多久？', expectedKey: 'retry-policy', expectedOrdinal: 0, expectedQuote: 'Retry policy 使用 5 seconds、30 seconds、5 minutes 三段 backoff。' },
  { question: 'retrieval SQL 怎样保证 user isolation？', expectedKey: 'user-isolation', expectedOrdinal: 0, expectedQuote: '所有 retrieval SQL 同时约束 chunk userId 和 note userId。' },
  { question: '旧 notes backfill 时还能查询吗？', expectedKey: 'async-backfill', expectedOrdinal: 0, expectedQuote: '旧 notes 通过 async backfill 建立索引，ready content 继续可查询。' },
  { question: '关闭 Embedding 后系统如何 rollback？', expectedKey: 'rollback-mode', expectedOrdinal: 0, expectedQuote: '关闭 Embedding config 会 non-destructive rollback 到 keyword mode。' },
  { question: 'staging 搜索 smoke test 的时间要求？', expectedKey: 'smoke-test', expectedOrdinal: 0, expectedQuote: 'Staging smoke test 要确认 created 或 edited note 在 60 seconds 内可搜索。' },
]

export function fixtureEmbedding(value) {
  const characters = Array.from(
    String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ''),
  )
  const features = characters.length < 3
    ? [characters.join('')]
    : characters.slice(0, -2).map((_, index) => characters.slice(index, index + 3).join(''))
  const embedding = Array(1536).fill(0)
  for (const feature of new Set(features)) {
    embedding[hashFeature(feature) % embedding.length] += 1
  }
  const magnitude = Math.hypot(...embedding) || 1
  return embedding.map((value) => value / magnitude)
}

function hashFeature(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
