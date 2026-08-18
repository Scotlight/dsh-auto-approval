import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { ReviewSession } from './approval.js'
import {
  AUTO_APPROVAL_SETTINGS_NAMESPACE,
  Config,
  type AutoApprovalConfig,
} from './config.js'
import { AutoApprovalWebBackend, installAutoApprovalWeb } from './web.js'

export const name = 'dsh-auto-approval'
export { Config }
export const inject = ['approval', 'credentials', 'settings', 'permissionPresets']

function approvalEventContext(ctx: Context): Context {
  const service = (ctx as unknown as { approval?: object }).approval
  if (service === undefined) return ctx
  const owner = Object.getOwnPropertyDescriptor(service, 'ctx')?.value
  return owner !== undefined && typeof owner.on === 'function' ? owner as Context : ctx
}

export function apply(ctx: Context, base: AutoApprovalConfig = {}): () => void {
  const settings = ctx.settings.register(AUTO_APPROVAL_SETTINGS_NAMESPACE, Config, {
    base,
    applies: 'live',
  })
  const reviews = new ReviewSession(ctx, () => settings.get())
  const approvalCtx = approvalEventContext(ctx)
  const disposeApproval = approvalCtx.on(
    'approval/request',
    async (request, next) => reviews.decide(request, next),
    { prepend: true, global: true },
  )
  // Replay the reviewer's deny rationale into the denied call's tool result so
  // the calling model sees WHY it was denied (course-correct, not retry blind).
  const disposePostExecute = ctx.on(
    'tools/post-execute',
    async (exec, result, next) => reviews.injectDenyReason(exec, result, next) as Promise<never>,
  )
  installAutoApprovalWeb(ctx, new AutoApprovalWebBackend(ctx))
  return () => {
    disposeApproval()
    disposePostExecute()
  }
}