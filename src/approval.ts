import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-session'
import { TurnCircuitBreaker } from './circuit.js'
import {
  AUTO_APPROVAL_CREDENTIAL,
  AUTO_APPROVAL_PRESET,
  resolveConfig,
  type AutoApprovalConfig,
} from './config.js'
import { actionHash, buildReviewEvidence, recoverExactAction } from './evidence.js'
import { ReviewClient, ReviewError } from './reviewer.js'
import type { ReviewAudit } from './types.js'

type NextApproval = () => Promise<ApprovalOutcome>

// Audit goes to a sidecar JSONL, NOT the session log: Session.append has no
// `ignorable` envelope option, so an out-of-vocabulary session event bricks the
// log's resume (SessionFormatUnsupportedError on next startup). Sidecar keeps
// the durable audit without touching the session vocabulary.
function appendAudit(session: ApprovalRequest['agent']['session'], audit: ReviewAudit): void {
  const row = JSON.stringify({ sessionId: String(session.header.id ?? ''), time: Date.now(), audit }) + '\n'
  const path = join(homedir(), '.dsh', 'auto-approval-audit.jsonl')
  try {
    appendFileSync(path, row)
  } catch {
    // audit is best-effort telemetry; never fail the approval path on it
  }
}

function sessionKey(request: ApprovalRequest, turn: number): string {
  return String(request.agent.session.header.id ?? '') + ':' + turn
}

function delegateAudit(
  request: ApprovalRequest,
  rationale: string,
  startedAt: number,
  reviewerRoute: string,
): void {
  appendAudit(request.agent.session, {
    reviewId: 'delegated-' + startedAt + '-' + String(request.callId ?? ''),
    turn: 0,
    ...(request.callId === undefined ? {} : { callId: String(request.callId) }),
    status: 'delegated',
    rationale,
    reviewerRoute,
    attempts: 0,
    startedAt,
    finishedAt: Date.now(),
  })
}

export class ReviewSession {
  constructor(
    private readonly ctx: Context,
    private readonly config: () => AutoApprovalConfig,
    private readonly client = new ReviewClient(),
    private readonly circuit = new TurnCircuitBreaker(),
  ) {}

  async decide(request: ApprovalRequest, next: NextApproval): Promise<ApprovalOutcome> {
    const startedAt = Date.now()
    let config
    try {
      config = resolveConfig(this.config())
    } catch (error) {
      this.ctx.logger.warn('dsh-auto-approval has invalid settings')
      this.ctx.logger.warn(error)
      return next()
    }

    if (!config.enabled) {
      this.ctx.logger.warn('dsh-auto-approval skipped approval request: plugin disabled')
      return next()
    }
    const currentPreset = this.ctx.permissionPresets.current(request.agent.session.events)
    if (currentPreset !== AUTO_APPROVAL_PRESET) {
      this.ctx.logger.warn(
        'dsh-auto-approval skipped approval request: preset=%s expected=%s',
        currentPreset,
        AUTO_APPROVAL_PRESET,
      )
      return next()
    }
    if (config.baseUrl === '' || config.model === '') {
      this.ctx.logger.warn('dsh-auto-approval delegated approval request: endpoint or model missing')
      delegateAudit(request, '评审接口或模型尚未配置，已转交人工审批。', startedAt, config.baseUrl)
      return next()
    }

    const recovered = recoverExactAction(request.agent.session.events, request)
    if (recovered.action === undefined) {
      delegateAudit(request, recovered.error ?? '无法恢复精确工具调用，已转交人工审批。', startedAt, config.baseUrl)
      return next()
    }
    const action = recovered.action
    const hash = actionHash(action)
    const key = sessionKey(request, action.turn)

    const openReason = this.circuit.isOpen(key, config)
    if (openReason !== undefined) {
      appendAudit(request.agent.session, {
        reviewId: 'circuit-' + startedAt + '-' + action.callId,
        turn: action.turn,
        callId: action.callId,
        actionHash: hash,
        status: 'circuit-open',
        outcome: 'deny',
        rationale: openReason,
        reviewerRoute: config.baseUrl,
        attempts: 0,
        startedAt,
        finishedAt: Date.now(),
      })
      return 'rejected'
    }

    const credential = await this.ctx.credentials.resolve(AUTO_APPROVAL_CREDENTIAL)
    if (credential === undefined) {
      this.ctx.logger.warn('dsh-auto-approval delegated approval request: credential missing')
      delegateAudit(request, 'API Key 尚未配置，已转交人工审批。', startedAt, config.baseUrl)
      return next()
    }

    const evidence = buildReviewEvidence(request.agent.session, action, recovered.callSeq)
    this.ctx.logger.warn(
      'dsh-auto-approval starting model review: tool=%s callId=%s model=%s',
      action.toolName,
      action.callId,
      config.model,
    )
    try {
      const result = await this.client.review(config, credential.value, evidence, request.signal)
      const denied = result.assessment.outcome === 'deny'
      this.circuit.record(key, denied ? 'denied' : 'allowed', config)
      appendAudit(request.agent.session, {
        reviewId: evidence.reviewId,
        turn: action.turn,
        callId: action.callId,
        actionHash: hash,
        status: denied ? 'denied' : 'allowed',
        risk: result.assessment.risk_level,
        authorization: result.assessment.user_authorization,
        outcome: result.assessment.outcome,
        rationale: result.assessment.rationale,
        reviewerRoute: config.baseUrl,
        attempts: result.attempts,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
      })
      return denied ? 'rejected' : 'allowed-once'
    } catch (error) {
      const reviewError = error instanceof ReviewError
        ? error
        : new ReviewError('review failed', false, 'unknown', { cause: error })
      const cancelled = reviewError.code === 'cancelled' || request.signal?.aborted === true
      appendAudit(request.agent.session, {
        reviewId: evidence.reviewId,
        turn: action.turn,
        callId: action.callId,
        actionHash: hash,
        status: cancelled ? 'cancelled' : 'error',
        rationale: cancelled ? '审批请求已取消。' : '评审接口失败：' + reviewError.code + ' ' + reviewError.message.slice(0, 300),
        reviewerRoute: config.baseUrl,
        attempts: config.retryCount + 1,
        startedAt,
        finishedAt: Date.now(),
      })
      if (cancelled) return 'cancelled'
      // Channel failures trip the error breaker too: after a few in a row the
      // breaker fast-fails later requests with a readable reason instead of
      // endlessly falling back to the human approval UI.
      this.circuit.record(key, 'error', config)
      this.ctx.logger.warn('dsh-auto-approval review failed: %s', reviewError.code)
      return next()
    }
  }
}