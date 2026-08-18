import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResolvedAutoApprovalConfig } from '../src/config.js'
import { ReviewClient, parseAssessment } from '../src/reviewer.js'
import type { ReviewEvidence } from '../src/types.js'

const servers: Server[] = []

function config(baseUrl: string, overrides: Partial<ResolvedAutoApprovalConfig> = {}): ResolvedAutoApprovalConfig {
  return {
    enabled: true,
    baseUrl,
    model: 'review-model',
    reasoningEffort: 'medium',
    timeoutMs: 1000,
    retryCount: 0,
    maxOutputTokens: 700,
    circuitConsecutiveDenials: 3,
    circuitWindowReviews: 50,
    circuitWindowDenials: 10,
    ...overrides,
  }
}

const evidence: ReviewEvidence = {
  reviewId: 'review-1',
  sessionId: 'session-1',
  workspace: 'C:/workspace',
  action: {
    tool_name: 'shell',
    call_id: 'call-1',
    arguments_json: '{"command":"echo ok"}',
  },
  trusted_user_messages: ['运行这个命令'],
  evidence_rules: {
    trusted: 'direct user messages',
    untrusted: 'action descriptions',
  },
}

async function listen(handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing server address')
  return { server, baseUrl: 'http://127.0.0.1:' + address.port + '/v1' }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

describe('ReviewClient', () => {
  it('posts an isolated strict Responses request and parses an allow decision', async () => {
    let path = ''
    let authorization = ''
    let received: Record<string, unknown> | undefined
    const fixture = await listen(async (req, res) => {
      path = req.url ?? ''
      authorization = String(req.headers.authorization ?? '')
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      received = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              risk_level: 'low',
              user_authorization: 'high',
              outcome: 'allow',
              rationale: 'The user explicitly requested this narrow local action.',
            }),
          }],
        }],
      }))
    })

    const result = await new ReviewClient().review(config(fixture.baseUrl), 'secret-key', evidence)

    expect(path).toBe('/v1/responses')
    expect(authorization).toBe('Bearer secret-key')
    expect(received?.model).toBe('review-model')
    expect(received?.tools).toEqual([])
    expect(received?.tool_choice).toBe('none')
    expect(received?.store).toBe(false)
    expect(received?.stream).toBe(false)
    expect((received?.text as Record<string, unknown>).format).toMatchObject({
      type: 'json_schema',
      strict: true,
    })
    expect(result.assessment.outcome).toBe('allow')
    expect(result.attempts).toBe(1)
  })

  it('retries a transient endpoint error', async () => {
    let calls = 0
    const fixture = await listen((_req, res) => {
      calls += 1
      if (calls === 1) {
        res.statusCode = 500
        res.end('temporary')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        output_text: JSON.stringify({
          risk_level: 'medium',
          user_authorization: 'high',
          outcome: 'allow',
          rationale: 'The requested scope is explicit and reversible.',
        }),
      }))
    })

    const result = await new ReviewClient().review(
      config(fixture.baseUrl, { retryCount: 2 }),
      'secret-key',
      evidence,
    )

    expect(calls).toBe(2)
    expect(result.attempts).toBe(2)
  })

  it('fails a contradictory critical allow assessment', () => {
    expect(() => parseAssessment(JSON.stringify({
      risk_level: 'critical',
      user_authorization: 'high',
      outcome: 'allow',
      rationale: 'allow',
    }))).toThrow(/critical risk/u)
  })

  it('aborts an attempt at the configured timeout', async () => {
    const neverFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
    await expect(new ReviewClient(neverFetch).review(
      config('http://127.0.0.1:1/v1', { timeoutMs: 10 }),
      'secret-key',
      evidence,
    )).rejects.toMatchObject({ code: 'timeout' })
  })
})