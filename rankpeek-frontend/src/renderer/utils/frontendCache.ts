const TRANSIENT_CACHE_PREFIXES = [
  'rankpeek.cache.',
  'rankpeek.temp.'
] as const

export function clearFrontendTransientCache() {
  if (typeof localStorage === 'undefined') {
    return 0
  }

  const keysToRemove: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && TRANSIENT_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach(key => {
    localStorage.removeItem(key)
  })

  return keysToRemove.length
}
