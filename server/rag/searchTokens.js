export function buildSearchTokens(content) {
  const text = String(content ?? '').toLowerCase()
  const englishWords = text.match(/[a-z0-9]+/g) ?? []
  const chineseBigrams = Array.from(text.matchAll(/[\u4e00-\u9fff]{2,}/g)).flatMap((match) => {
    const characters = Array.from(match[0])
    return characters.slice(0, -1).map((_, index) => characters.slice(index, index + 2).join(''))
  })

  return [...new Set([...englishWords, ...chineseBigrams])].join(' ')
}
