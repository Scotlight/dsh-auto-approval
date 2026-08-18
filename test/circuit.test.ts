import { describe, expect, it } from 'vitest'
import type { ResolvedAutoApprovalConfig } from '../src/config.js'
import { TurnCircuitBreaker } from '../src/circuit.js'

const config: ResolvedAutoApprovalConfig = {
  enabled: true,
  baseUrl: 'http://127.0.0.1/v1',
  model: 'review-model',
  reasoningEffort: 'medium',
  apiStyle: 'responses',
  timeoutMs: 1000,
  retryCount: 0,
  maxOutputTokens: 700,
  circuitConsecutiveDenials: 3,
  circuitWindowReviews: 5,
  circuitWindowDenials: 3,
}

describe('TurnCircuitBreaker', () => {
  it('opens after consecutive denials and stays isolated by turn key', () => {
    const breaker = new TurnCircuitBreaker()
    breaker.record('session:1', 'denied', config)
    breaker.record('session:1', 'denied', config)
    expect(breaker.isOpen('session:1', config)).toBeUndefined()
    breaker.record('session:1', 'denied', config)
    expect(breaker.isOpen('session:1', config)).toContain('熔断')
    expect(breaker.isOpen('session:2', config)).toBeUndefined()
  })

  it('resets consecutive denials after an allow', () => {
    const breaker = new TurnCircuitBreaker()
    breaker.record('session:1', 'denied', config)
    breaker.record('session:1', 'denied', config)
    breaker.record('session:1', 'allowed', config)
    expect(breaker.isOpen('session:1', config)).toBeUndefined()
  })

  it('opens after consecutive channel errors with a service-failure reason', () => {
    const breaker = new TurnCircuitBreaker()
    breaker.record('session:1', 'error', config)
    breaker.record('session:1', 'error', config)
    expect(breaker.isOpen('session:1', config)).toBeUndefined()
    breaker.record('session:1', 'error', config)
    expect(breaker.isOpen('session:1', config)).toContain('评审服务连续 3 次失败')
  })

  it('an allow clears the error streak', () => {
    const breaker = new TurnCircuitBreaker()
    breaker.record('session:1', 'error', config)
    breaker.record('session:1', 'error', config)
    breaker.record('session:1', 'allowed', config)
    breaker.record('session:1', 'error', config)
    expect(breaker.isOpen('session:1', config)).toBeUndefined()
  })

  it('errors do not count toward the denial window', () => {
    const breaker = new TurnCircuitBreaker()
    for (let i = 0; i < config.circuitWindowReviews; i += 1) {
      breaker.record('session:1', 'error', config)
    }
    const reason = breaker.isOpen('session:1', config) ?? ''
    expect(reason).toContain('评审服务连续')
    expect(reason).not.toContain('窗口')
  })
})
