# Mine

Mine 是一个面向内容创作者和知识工作者的 AI 素材收纳与内容输出工作台。它帮助用户把文章、公众号、视频、播客、图片和灵感收进来，整理成可搜索、可引用、可输出的素材。

产品闭环：收集外部素材 → AI 收纳整理 → 标签/关联沉淀 → 带来源问答 → 生成可发布内容。

## 功能

- 新建、编辑、删除素材
- 所见即所得编辑，保留 Markdown 导入/导出
- 从公开链接、图片、音视频导入材料并保存为 Markdown 素材
- 在支持 File System Access API 的浏览器里打开本地 Markdown 素材库，并写回本地库
- AI 自动生成标题、摘要、标签、主题和关联素材
- 基于素材库的问答，回答展示来源素材
- 从当前素材列表生成文章大纲、选题卡、研究摘要、公众号草稿、小红书笔记或短视频脚本
- 内置 Demo 数据，首次打开即可演示完整闭环

## 本地运行

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动前端和本地导入服务。导入服务运行在 `127.0.0.1:8787`，前端通过 `/api/import/*` 代理访问它。

如果只想启动前端或导入服务：

```bash
pnpm dev:vite
pnpm dev:import
```

## 数据库与账号

Mine 支持邮箱密码注册登录。未配置 `DATABASE_URL` 时，后端会使用内存存储，适合临时演示；重启后账号和素材会清空。

要启用持久化，推荐使用 Neon Postgres。复制 `.env.example` 为 `.env.local`，填入 Neon 的 `DATABASE_URL` 后运行：

```bash
pnpm db:generate
pnpm db:migrate
```

后端重启后会自动使用 Postgres，每个用户只能访问自己的素材库。

## AI 配置

应用支持 OpenAI-compatible API。普通用户不需要填写 API Key，平台统一从服务端环境变量读取：

```bash
AI_API_KEY=your_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_EMBEDDING_API_KEY=
AI_EMBEDDING_BASE_URL=
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
AI_VISION_API_KEY=
AI_VISION_BASE_URL=https://api.openai.com/v1
AI_VISION_MODEL=gpt-4o-mini
AI_TRANSCRIPTION_API_KEY=
AI_TRANSCRIPTION_BASE_URL=https://api.openai.com/v1
AI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

Embedding Key 和 Base URL 留空时会复用普通对话的 `AI_API_KEY` 和 `AI_BASE_URL`。向量维度固定为 `1536`，必须与数据库的 `vector(1536)` 列一致。

素材问答有三种检索模式：

- `hybrid`：Postgres 与 Embedding 均可用，同时融合向量和关键词结果。
- `keyword`：使用 Postgres 中已就绪索引的关键词结果；关闭 Embedding 配置会无损回退到此模式。
- `basic`：未配置 Postgres 时，使用内存中的整篇素材进行基础问答。

旧素材会异步回填索引；回填期间，已经 ready 的内容仍然可以查询。关闭 Embedding 不会删除已有 chunks，适合作为回滚方式，但新增或修改素材需要恢复 Embedding 后才会继续建立索引。

未配置 API Key 时，应用会使用 fallback，保证 Demo 闭环仍然可演示。

## 外部内容导入

- 文章链接：公开博客、网页、部分公众号文章会尝试提取正文并转为 Markdown。
- 视频链接：B站、抖音等链接会优先尝试读取字幕。若本机安装了 `yt-dlp` 且配置了转写模型，会尝试音频转写；否则会给出上传本地音视频或粘贴字幕的提示。
- 视频站登录态：B站、抖音经常需要登录后的 Cookie。可把浏览器导出的 `cookies.txt` 路径填入 `MINE_YTDLP_COOKIES`，或把 `MINE_YTDLP_BROWSER` 设为 `chrome` / `edge`，让本地解析服务尝试读取浏览器 Cookie。
- 图片：配置 AI Key 和视觉模型后可提取图片文字与摘要；未配置时会保存来源并提示补充配置。

首版只支持公开可访问内容。付费、私密、登录后可见或强反爬内容会返回明确提示，不会生成空白素材。

## 单服务部署

生产环境中，Express 会同时提供 `/api/*` 和前端 `dist/` 静态文件。推荐部署到 Render、Railway 或 Fly.io，并使用 Neon 作为 Postgres 数据库。

```bash
pnpm build
pnpm db:deploy
pnpm start
```

部署说明见 [`docs/deployment.md`](docs/deployment.md)。

## 验证

```bash
pnpm lint
pnpm test
pnpm test:db
pnpm build
```

`pnpm test:db` 仅供确认过的临时 pgvector 数据库使用，并且还需要显式设置 `MINE_RUN_DB_TESTS=1`；没有 opt-in 时会安全跳过。
