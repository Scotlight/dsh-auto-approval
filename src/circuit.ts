import type { ResolvedAutoApprovalConfig } from './config.js'

/** What happened on one review attempt; errors trip their own breaker so a
 * dead review channel stops re-prompting the human and the agent sees a clear
 * fast-fail signal instead of an endless fail-closed wait. */
export type ReviewOutcomeKind = 'denied' | 'allowed' | 'error'

interface CircuitState {
  consecutiveDenials: number
  consecutiveErrors: number
  recent: boolean[]
  /** Why the breaker opened, reported back through the rejection reason. */
  openReason?: string
}

/** Denials and errors open the breaker at the same count: three of either in a
 * row means the turn is not making progress and later requests fast-fail. */
const CONSECUTIVE_ERRORS_LIMIT = 3

export class TurnCircuitBreaker {
  private readonly states = new Map<string, CircuitState>()

  isOpen(key: string, config: ResolvedAutoApprovalConfig): string | undefined {
    const state = this.states.get(key)
    if (state === undefined) return undefined
    const denied = state.recent.filter(Boolean).length
    if (state.consecutiveDenials >= config.circuitConsecutiveDenials) {
      return `连续 ${state.consecutiveDenials} 次评审拒绝，已触发熔断。`
    }
    if (state.consecutiveErrors >= CONSECUTIVE_ERRORS_LIMIT) {
      return `评审服务连续 ${state.consecutiveErrors} 次失败，已熔断——请检查评审渠道或稍后重试。`
    }
    if (denied >= config.circuitWindowDenials) {
      return `最近 ${config.circuitWindowReviews} 次评审中拒绝了 ${denied} 次，已触发窗口熔断。`
    }
    return undefined
  }

  record(key: string, kind: ReviewOutcomeKind, config: ResolvedAutoApprovalConfig): void {
    const state = this.states.get(key) ?? { consecutiveDenials: 0, consecutiveErrors: 0, recent: [] }
    if (kind === 'denied') {
      state.consecutiveDenials += 1
      state.consecutiveErrors = 0
    } else if (kind === 'error') {
      state.consecutiveErrors += 1
      state.consecutiveDenials = 0
    } else {
      state.consecutiveDenials = 0
      state.consecutiveErrors = 0
    }
    if (kind !== 'error') state.recent.push(kind === 'denied')
    if (state.recent.length > config.circuitWindowReviews) {
      state.recent.splice(0, state.recent.length - config.circuitWindowReviews)
    }
    this.states.delete(key)
    this.states.set(key, state)
    while (this.states.size > 128) {
      const oldest = this.states.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.states.delete(oldest)
    }
  }
}
