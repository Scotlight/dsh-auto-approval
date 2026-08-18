import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { ReviewSession } from '../src/approval.js'
import { ReviewClient, type ReviewResult } from '../src/reviewer.js'

/** A client whose review() always denies with a fixed rationale. */
class DenyingClient extends ReviewClient {
  override async review(): Promise<ReviewResult> {
    return {
      assessment: { risk_level: 'high', user_authorization: 'low', outcome: 'deny', rationale: 'credential exposure to a public path' },
      attempts: 1,
      startedAt: Date.now(),
      finishedAt: Date.now(),
    }
  }
}

function makeSession(events: unknown[] = []): ApprovalRequest['agent']['session'] {
  return {
    events,
    append: () => ({}),
    header: { id: 'session-test' },
  } as unknown as ApprovalRequest['agent']['session']
}

function makeRequest(): ApprovalRequest {
  const session = makeSession([
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    {
      type: 'tool/call',
      seq: 1,
      time: 2,
      data: { turn: 1, step: 1, callId: 'call-deny', name: 'write', arguments: '{"file_path":"C:/Users/Public/x.conf"}' },
    },
  ])
  return {
    agent: { session },
    toolName: 'write',
    callId: 'call-deny',
    signal: undefined,
  } as unknown as ApprovalRequest
}

function makeCtx(): Context {
  return {
    logger: { warn: () => undefined },
    permissionPresets: { current: () => 'auto-approval' },
    credentials: { resolve: async () => ({ value: 'sk-test', source: 'test' }) },
  } as unknown as Context
}

const baseConfig = {
  enabled: true,
  baseUrl: 'https://review.example/v1',
  model: 'review-model',
  apiStyle: 'responses' as const,
  reasoningEffort: 'low' as const,
  timeoutMs: 5000,
  retryCount: 0,
  maxOutputTokens: 500,
  circuitConsecutiveDenials: 3,
  circuitWindowReviews: 50,
  circuitWindowDenials: 10,
}

describe('ReviewSession deny-reason injection', () => {
  it('records the rationale and replays it into the denied tool result once', async () => {
    const session = new ReviewSession(makeCtx(), () => baseConfig, new DenyingClient())
    const outcome = await session.decide(makeRequest(), async () => 'unavailable' as ApprovalOutcome)
    expect(outcome).toBe('rejected')

    // The post-execute hook replaces the error result with the rationale.
    const replaced = await session.injectDenyReason(
      { callId: 'call-deny' },
      { isError: true },
      async () => ({ kind: 'accept' }) as never,
    ) as { kind: string; feedback: Array<{ text: string }> }
    expect(replaced.kind).toBe('block')
    expect(replaced.feedback[0]?.text).toContain('credential exposure to a public path')

    // Second dispatch of the same call delegates: feedback is consumed once.
    const passthrough = await session.injectDenyReason(
      { callId: 'call-deny' },
      { isError: true },
      async () => ({ kind: 'accept' }) as never,
    )
    expect(passthrough).toEqual({ kind: 'accept' })
  })

  it('leaves non-error results and unknown calls untouched', async () => {
    const session = new ReviewSession(makeCtx(), () => baseConfig, new DenyingClient())
    await session.decide(makeRequest(), async () => 'unavailable' as ApprovalOutcome)

    const kept = await session.injectDenyReason(
      { callId: 'call-deny' },
      { isError: false },
      async () => ({ kind: 'accept' }) as never,
    )
    expect(kept).toEqual({ kind: 'accept' })

    const unknown = await session.injectDenyReason(
      { callId: 'call-other' },
      { isError: true },
      async () => ({ kind: 'accept' }) as never,
    )
    expect(unknown).toEqual({ kind: 'accept' })
  })
})
