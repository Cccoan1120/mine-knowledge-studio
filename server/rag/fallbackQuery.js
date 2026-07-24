export function buildFallbackQuery(question, history = []) {
  const recentUserMessages = history
    .slice(-6)
    .filter((message) => message?.role === 'user')
    .map((message) => String(message.content ?? '').trim())
    .filter(Boolean)

  return [...recentUserMessages, String(question ?? '').trim()].filter(Boolean).join('\n')
}
