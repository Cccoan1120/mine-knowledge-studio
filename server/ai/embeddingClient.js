import { getEmbeddingConfig } from './config.js'

export function createEmbeddingClient({ config = getEmbeddingConfig(), fetchImpl = fetch } = {}) {
  return {
    async embed(inputs) {
      if (!inputs.length) return []

      let response
      try {
        response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: inputs,
            dimensions: config.dimensions,
          }),
          signal: AbortSignal.timeout(60_000),
        })
      } catch {
        throw new Error('Embedding request failed.')
      }

      if (!response.ok) {
        throw new Error(`Embedding request failed (HTTP ${response.status}).`)
      }

      let body
      try {
        body = await response.json()
      } catch {
        throw new Error('Embedding provider returned an invalid response.')
      }

      if (!Array.isArray(body?.data) || body.data.length !== inputs.length) {
        throw new Error('Embedding provider returned an invalid response.')
      }

      const ordered = Array(inputs.length)
      for (const item of body.data) {
        if (
          !Number.isInteger(item?.index) ||
          item.index < 0 ||
          item.index >= inputs.length ||
          ordered[item.index] ||
          !Array.isArray(item.embedding) ||
          item.embedding.length !== config.dimensions ||
          !item.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
        ) {
          throw new Error('Embedding provider returned an invalid response.')
        }
        ordered[item.index] = item.embedding
      }

      if (ordered.some((embedding) => !embedding)) {
        throw new Error('Embedding provider returned an invalid response.')
      }
      return ordered
    },
  }
}
