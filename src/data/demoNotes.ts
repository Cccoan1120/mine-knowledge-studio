import type { Note } from '../types'

const now = new Date('2026-06-30T08:00:00.000Z').toISOString()

export const demoNotes: Note[] = [
  {
    id: 'demo-material-loop',
    title: '内容创作者真正需要的是素材复用闭环',
    content:
      '# 内容创作者真正需要的是素材复用闭环\n\n很多创作者收藏了大量文章、视频、播客和截图，但写作时仍然从零开始。问题不在于资料不够，而在于资料没有被整理成可搜索、可引用、可输出的素材。\n\n一个可演示的 AI 素材库应该完成五步：\n\n1. 把外部内容收进来。\n2. 提炼摘要、观点和标签。\n3. 找到相似素材之间的关联。\n4. 基于素材回答问题，并展示来源。\n5. 生成文章大纲、选题卡或脚本草稿。\n',
    summary: 'Mine 的核心价值不是保存笔记，而是把分散资料整理成可复用、可引用、可输出的素材。',
    tags: ['素材复用', '内容创作', '产品定位'],
    topic: '产品定位',
    source: 'Demo 数据',
    createdAt: now,
    updatedAt: now,
    relatedNoteIds: ['demo-video-material', 'demo-output-types', 'demo-local-first'],
  },
  {
    id: 'demo-video-material',
    title: '视频素材导入的产品边界',
    content:
      '# 视频素材导入的产品边界\n\nB站和抖音的视频内容很适合作为创作素材，但它们经常需要登录态、Cookie 或平台权限。产品不能假装所有链接都能稳定解析，而应该把失败状态产品化。\n\n合理的处理方式：\n\n- 优先读取字幕。\n- 有 Cookie 时使用用户本机登录态提高成功率。\n- 没有字幕时尝试音频转写。\n- 平台限制时提示上传音视频或粘贴文稿。\n- 永远不生成空白素材。\n',
    summary: '视频导入的关键不是承诺万能抓取，而是在字幕、转写、Cookie 和手动文稿之间提供稳定兜底。',
    tags: ['视频素材', 'B站', '抖音', '导入兜底'],
    topic: '视频素材',
    source: 'Demo 数据',
    createdAt: now,
    updatedAt: now,
    relatedNoteIds: ['demo-material-loop'],
  },
  {
    id: 'demo-output-types',
    title: '素材输出应该贴近真实发布场景',
    content:
      '# 素材输出应该贴近真实发布场景\n\n如果 Mine 只生成摘要，它很容易变成一个普通 AI 笔记功能。对内容创作者来说，更有价值的是把已有素材转换成真实输出。\n\n首版可以支持：\n\n- 文章大纲：适合公众号和长文。\n- 选题卡：适合选题规划。\n- 研究摘要：适合知识工作者。\n- 小红书笔记：适合轻量观点表达。\n- 短视频脚本：适合把素材变成口播结构。\n\n输出必须带来源，避免 AI 凭空发挥。',
    summary: '内容输出应该从摘要扩展到文章大纲、选题卡、小红书笔记和短视频脚本，并保留来源。',
    tags: ['内容输出', '选题', '小红书', '短视频脚本'],
    topic: '内容输出',
    source: 'Demo 数据',
    createdAt: now,
    updatedAt: now,
    relatedNoteIds: ['demo-material-loop'],
  },
  {
    id: 'demo-local-first',
    title: '本地优先仍然是 Mine 的信任基础',
    content:
      '# 本地优先仍然是 Mine 的信任基础\n\nMine 的定位从个人知识库收敛到素材收纳台，但本地优先仍然重要。创作者会保存草稿、判断、灵感和未发布内容，底层使用 Markdown 可以降低迁移成本，也适合开源项目展示。\n\n体验上不应该要求用户懂 Markdown。用户在界面里用所见即所得编辑，Mine 在底层保留 Markdown 导入、导出和本地库写回。',
    summary: '所见即所得降低写作门槛，Markdown 负责本地优先、可迁移和开源友好。',
    tags: ['本地优先', 'Markdown', '开源'],
    topic: '产品信任',
    source: 'Demo 数据',
    createdAt: now,
    updatedAt: now,
    relatedNoteIds: ['demo-material-loop'],
  },
]
