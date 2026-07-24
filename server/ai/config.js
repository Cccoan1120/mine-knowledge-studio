export function getPlatformAIConfig() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    visionApiKey: process.env.AI_VISION_API_KEY || '',
    visionBaseUrl: process.env.AI_VISION_BASE_URL || '',
    visionModel: process.env.AI_VISION_MODEL || 'gpt-4o-mini',
    transcriptionApiKey: process.env.AI_TRANSCRIPTION_API_KEY || '',
    transcriptionBaseUrl: process.env.AI_TRANSCRIPTION_BASE_URL || '',
    transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
  }
}

export function getEmbeddingConfig() {
  const dimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS || 1536)
  if (dimensions !== 1536) {
    throw new Error('AI_EMBEDDING_DIMENSIONS must be 1536.')
  }

  return {
    apiKey: process.env.AI_EMBEDDING_API_KEY || process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_EMBEDDING_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions,
  }
}

export function getAICapabilities() {
  const config = getPlatformAIConfig()
  const embeddingConfig = getEmbeddingConfig()
  return {
    chatConfigured: Boolean(config.apiKey),
    visionConfigured: Boolean(config.visionApiKey || config.apiKey),
    transcriptionConfigured: Boolean(config.transcriptionApiKey || config.apiKey),
    embeddingConfigured: Boolean(embeddingConfig.apiKey),
    model: config.model,
    visionModel: config.visionModel,
    transcriptionModel: config.transcriptionModel,
  }
}
