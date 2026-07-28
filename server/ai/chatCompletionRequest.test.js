// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildChatCompletionRequest } from './chatCompletionRequest.js'

const messages = [{ role: 'user', content: 'Question' }]

describe('Chat Completions request compatibility', () => {
  it('uses low-latency reasoning settings without temperature for GPT-5.6', () => {
    expect(buildChatCompletionRequest({
      model: 'gpt-5.6-terra',
      messages,
      temperature: 0.2,
      jsonMode: true,
    })).toEqual({
      model: 'gpt-5.6-terra',
      messages,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
    })
  })

  it('preserves temperature and omits reasoning settings for legacy models', () => {
    expect(buildChatCompletionRequest({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      jsonMode: true,
    })).toEqual({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })
  })
})
