/** Redaction of secret-shaped values before anything enters the reviewer prompt. */

/** Keys whose values are stripped from evidence (reviewers judge shape, not secrets). */
const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|credential|private[_-]?key|access[_-]?key|client[_-]?secret)/iu

const REDACTED = '[REDACTED]'

/**
 * Recursively redact sensitive values from a JSON-like value: any object key
 * matching {@link SENSITIVE_KEY_PATTERN} has its value replaced. The reviewer
 * needs to see that a credential is involved, never the credential itself.
 * @param value - the detached JSON value to sanitize.
 * @returns a detached copy with sensitive values redacted.
 */
export function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJson)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeJson(item)
    }
    return out
  }
  return value
}

/**
 * Redact secret-shaped assignments inside free text (payload file excerpts,
 * tool arguments rendered as strings). Catches `api_key=…`, `"token": "…"`,
 * `Bearer …`, PEM blocks — the shapes a reviewer must recognize without
 * receiving the actual secret bytes.
 * @param text - the raw text.
 * @returns text with secret values replaced by [REDACTED].
 */
export function sanitizeText(text: string): string {
  return text
    // Bearer tokens first — the generic authorization rule below would
    // otherwise swallow "Bearer" itself as the value.
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu, '$1' + REDACTED)
    // Negative lookahead keeps "Bearer …" for the Bearer rule above and an
    // already-masked "[REDACTED]" stable.
    .replace(/((?:api[_-]?key|token|secret|password|passwd|pwd|authorization|credential|access[_-]?key|client[_-]?secret)\s*[=:]\s*)(?!Bearer\b|\[REDACTED\])[^\s"',;}\n]+/giu, '$1' + REDACTED)
    .replace(/("(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|credential|access[_-]?key|client[_-]?secret)"\s*:\s*)"[^"]*"/giu, '$1"' + REDACTED + '"')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, '-----BEGIN PRIVATE KEY-----' + REDACTED + '-----END PRIVATE KEY-----')
}
