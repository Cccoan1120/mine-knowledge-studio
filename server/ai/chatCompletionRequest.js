export function buildChatCompletionRequest({
  model,
  messages,
  temperature,
  jsonMode = false,
}) {
  const request = {
    model,
    messages,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  }

  if (/^gpt-5\.6(?:-|$)/i.test(model)) {
    return { ...request, reasoning_effort: 'none' }
  }

  return { ...request, temperature }
}
