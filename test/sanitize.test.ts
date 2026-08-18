import { describe, expect, it } from 'vitest'
import { sanitizeJson, sanitizeText } from '../src/sanitize.js'

describe('sanitizeJson', () => {
  it('redacts sensitive keys recursively and keeps the rest', () => {
    const input = {
      file_path: 'C:/Users/Public/notes.txt',
      content: 'hello',
      api_key: 'sk-abcdef123456',
      nested: { access_token: 'tok_987', keep: 'me' },
      list: [{ password: 'hunter2' }, 'plain'],
    }
    expect(sanitizeJson(input)).toEqual({
      file_path: 'C:/Users/Public/notes.txt',
      content: 'hello',
      api_key: '[REDACTED]',
      nested: { access_token: '[REDACTED]', keep: 'me' },
      list: [{ password: '[REDACTED]' }, 'plain'],
    })
  })

  it('leaves primitives and empty structures untouched', () => {
    expect(sanitizeJson('text')).toBe('text')
    expect(sanitizeJson(42)).toBe(42)
    expect(sanitizeJson(null)).toBe(null)
    expect(sanitizeJson([])).toEqual([])
  })
})

describe('sanitizeText', () => {
  it('masks key=value style secrets', () => {
    expect(sanitizeText('api_key=sk-Z1Qabc123def456\ntenant=x'))
      .toBe('api_key=[REDACTED]\ntenant=x')
    expect(sanitizeText('token: ghp_abcdefghijklmnop'))
      .toBe('token: [REDACTED]')
  })

  it('masks JSON-style quoted secrets', () => {
    expect(sanitizeText('{"password": "hunter2", "name": "ok"}'))
      .toBe('{"password": "[REDACTED]", "name": "ok"}')
  })

  it('masks bearer tokens', () => {
    expect(sanitizeText('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6'))
      .toBe('Authorization: Bearer [REDACTED]')
  })

  it('masks PEM private key blocks entirely', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7x9\n-----END RSA PRIVATE KEY-----'
    expect(sanitizeText(pem)).not.toContain('MIIEpA')
    expect(sanitizeText(pem)).toContain('[REDACTED]')
  })

  it('keeps ordinary text readable', () => {
    const text = '# deploy notes\n1. write to C:/Users/Public/deploy.md\n2. done'
    expect(sanitizeText(text)).toBe(text)
  })
})
