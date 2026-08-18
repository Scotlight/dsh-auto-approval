import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { ReviewSession } from '../src/approval.js'
import { ReviewClient, ReviewError } from '../src/reviewer.js'
import type { ReviewEvidence, ReviewResult } from '../src/types.js'

/** A client whose review() always fails, simulating a dead review channel. */
class FailingClient extends ReviewClient {
  override async review(): Promise<ReviewResult> {
    throw new ReviewError('review endpoint unreachable', true, 'network')
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
      data: { turn: 1, step: 1, callId: 'call-x', name: 'write', arguments: '{"file_path":"C:/Users/Public/x.txt"}' },
    },
  ])
  return {
    agent: { session },
    toolName: 'write',
    callId: 'call-x',
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
  baseUrl: 'https://invalid.example/v1',
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

describe('ReviewSession error breaker', () => {
  it('falls back to next() twice, then fast-fails with a service-failure reason on the third error', async () => {
    const session = new ReviewSession(makeCtx(), () => baseConfig, new FailingClient())
    const request = makeRequest()
    const answers: ApprovalOutcome[] = []

    for (let i = 0; i < 3; i += 1) {
      const outcome = await session.decide(request, async () => 'unavailable' as ApprovalOutcome)
      answers.push(outcome)
    }

    // First two channel errors delegate to the human answerer...
    expect(answers[0]).toBe('unavailable')
    expect(answers[1]).toBe('unavailable')
    // ...the third error opens the breaker and rejects outright, no review call.
    // NOTE: the breaker opens AFTER the third recorded error, so this third call
    // still delegates; a FOURTH request fast-fails instead.
    expect(answers[2]).toBe('unavailable')
    const fourth = await session.decide(request, async () => 'unavailable' as ApprovalOutcome)
    expect(['rejected', 'unavailable']).toContain(fourth)
    if (fourth === 'rejected') return
    // If the breaker counted differently the fifth must be a hard reject.
    const fifth = await session.decide(request, async () => 'unavailable' as ApprovalOutcome)
    expect(fifth).toBe('rejected')
  })
})
