export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type UserAuthorization = 'unknown' | 'low' | 'medium' | 'high'
export type ReviewDecision = 'allow' | 'deny'

export interface ReviewAssessment {
  risk_level: RiskLevel
  user_authorization: UserAuthorization
  outcome: ReviewDecision
  rationale: string
}

export interface ExactAction {
  toolName: string
  callId: string
  argumentsJson: string
  reason?: string
  turn: number
  step: number
}

export interface ReviewEvidence {
  reviewId: string
  sessionId: string
  workspace: string
  action: {
    tool_name: string
    call_id: string
    arguments_json: string
    reason?: string
  }
  trusted_user_messages: string[]
  /**
   * Truncated contents of local files referenced by the action when it also
   * shows network-egress intent — the Codex Guardian rule that a payload must
   * be "fully investigated" before an egress decision. Absent when the action
   * has no egress shape or the files are unreadable.
   */
  payload_samples?: Array<{ path: string; bytes: number; excerpt: string }>
  evidence_rules: {
    trusted: string
    untrusted: string
  }
}

export interface ReviewResult {
  assessment: ReviewAssessment
  attempts: number
  startedAt: number
  finishedAt: number
}

export interface ReviewAudit {
  reviewId: string
  turn: number
  callId?: string
  actionHash?: string
  status: 'allowed' | 'denied' | 'delegated' | 'error' | 'circuit-open' | 'cancelled'
  risk?: RiskLevel
  authorization?: UserAuthorization
  outcome?: ReviewDecision
  rationale: string
  reviewerRoute: string
  attempts: number
  startedAt: number
  finishedAt: number
}