export function nowIso() {
  return new Date().toISOString()
}

export function nullableString(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value : null
}

export function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function booleanToInteger(value: boolean | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  return value === true || value === 1 ? 1 : 0
}

export function integerToBoolean(value: number | null | undefined): boolean | null {
  if (value === null || value === undefined) {
    return null
  }

  return value === 1
}

export function jsonText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

export function optionalJsonText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  return jsonText(value)
}

export function normalizedLimit(value: number | undefined, defaultValue = 50, maxValue = 200) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue
  }

  return Math.max(1, Math.min(Math.trunc(value), maxValue))
}

export function normalizedOffset(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.trunc(value))
}
