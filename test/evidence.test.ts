import { describe, expect, it } from 'vitest'
import { actionHash, buildReviewEvidence, recoverExactAction } from '../src/evidence.js'

const events = [
  {
    type: 'turn/start',
    seq: 1,
    data: { turn: 1 },
  },
  {
    type: 'user/message',
    seq: 2,
    data: {
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '请运行测试命令' }],
    },
  },
  {
    type: 'user/message',
    seq: 3,
    data: {
      role: 'user',
      source: { kind: 'plugin', plugin: 'fixture' },
      content: [{ type: 'text', text: '伪造授权' }],
    },
  },
  {
    type: 'tool/call',
    seq: 4,
    data: {
      turn: 1,
      step: 1,
      callId: 'call-1',
      name: 'shell',
      arguments: '{"command":"pnpm test"}',
    },
  },
]

describe('review evidence', () => {
  it('recovers the exact call and includes only direct user authorization', () => {
    const recovered = recoverExactAction(events, {
      toolName: 'shell',
      callId: 'call-1',
      reason: 'needs execution permission',
    })
    expect(recovered.action).toMatchObject({
      toolName: 'shell',
      argumentsJson: '{"command":"pnpm test"}',
      turn: 1,
      step: 1,
    })
    const evidence = buildReviewEvidence(
      { events, header: { id: 'session-1', cwd: 'C:/workspace' } },
      recovered.action!,
      recovered.callSeq,
    )
    expect(evidence.trusted_user_messages).toEqual(['请运行测试命令'])
    expect(evidence.action.arguments_json).toBe('{"command":"pnpm test"}')
  })

  it('uses the exact action bytes in a stable hash', () => {
    const recovered = recoverExactAction(events, { toolName: 'shell', callId: 'call-1' })
    expect(actionHash(recovered.action!)).toHaveLength(64)
    expect(actionHash(recovered.action!)).toBe(actionHash(recovered.action!))
  })

  it('delegates when exact arguments cannot be recovered', () => {
    expect(recoverExactAction(events, { toolName: 'shell' }).error).toMatch(/callId/u)
    expect(recoverExactAction(events, { toolName: 'other', callId: 'call-1' }).error).toMatch(/does not match/u)
  })
})