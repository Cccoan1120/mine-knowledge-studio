# Mine GPT-5.6 Terra 兼容设计

## 目标

让 Mine 现有两条 Chat Completions 调用路径兼容 `gpt-5.6-terra`，并把它设为默认聊天模型，同时保持旧模型、Embedding、Vision 和 Transcription 的现有行为。

## 范围

- 默认 `AI_MODEL` 从 `gpt-4o-mini` 改为 `gpt-5.6-terra`。
- `gpt-5.6-terra` 请求显式发送 `reasoning_effort: "none"`，保持当前问答延迟基线。
- GPT-5.6 系列请求不发送现有 `temperature` 字段。
- 非 GPT-5.6 模型继续发送当前温度值。
- 两条调用路径继续使用 `/chat/completions`、JSON mode、现有提示词和 60 秒超时。
- Embedding 继续使用 `text-embedding-3-small` 和固定 1536 维。
- Vision 与 Transcription 默认模型保持不变。

## 设计

在 `server/ai/chatCompletionRequest.js` 提供一个纯函数，根据模型、消息、温度和 JSON mode 构造请求体。`server/ai/service.js` 与 `server/rag/questionService.js` 复用该函数，避免两条路径产生不同的 Terra 兼容行为。

模型名按小写判断 `gpt-5.6` 或 `gpt-5.6-*`。匹配时加入 `reasoning_effort: "none"` 并省略 `temperature`；其他模型保持原请求形态。请求 URL、认证、错误处理、响应解析均不改变。

## 验证

- 单元测试覆盖默认模型、Embedding 不变、Terra 请求参数和旧模型兼容。
- 聚焦测试覆盖两条真实请求构造路径。
- 完整运行 `pnpm lint`、`pnpm test`、`pnpm build` 和 `pnpm audit --prod --no-optional`。
- 本次不调用真实模型 API，不修改 Render 环境变量，不产生模型费用。
