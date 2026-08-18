import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'

export interface AutoApprovalConfig {
  enabled?: boolean
  baseUrl?: string
  model?: string
  apiStyle?: 'responses' | 'chat'
  reasoningEffort?: ReasoningEffort
  timeoutMs?: number
  retryCount?: number
  maxOutputTokens?: number
  circuitConsecutiveDenials?: number
  circuitWindowReviews?: number
  circuitWindowDenials?: number
}

export interface ResolvedAutoApprovalConfig {
  enabled: boolean
  baseUrl: string
  model: string
  apiStyle: 'responses' | 'chat'
  reasoningEffort: ReasoningEffort
  timeoutMs: number
  retryCount: number
  maxOutputTokens: number
  circuitConsecutiveDenials: number
  circuitWindowReviews: number
  circuitWindowDenials: number
}

export const AUTO_APPROVAL_SETTINGS_NAMESPACE = settingsNamespace('auto-approval')
export const AUTO_APPROVAL_CREDENTIAL: CredentialRef = credentialRef('DSH_AUTO_APPROVAL_API_KEY')
export const AUTO_APPROVAL_PRESET = 'auto-approval'

export const Config: Schema<AutoApprovalConfig> = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default(''),
  model: z.string().default(''),
  apiStyle: z.union(['responses', 'chat']).default('responses'),
  reasoningEffort: z.union(['none', 'low', 'medium', 'high', 'xhigh']).default('medium'),
  timeoutMs: z.number().default(30000),
  retryCount: z.number().default(3),
  maxOutputTokens: z.number().default(1000),
  circuitConsecutiveDenials: z.number().default(3),
  circuitWindowReviews: z.number().default(50),
  circuitWindowDenials: z.number().default(10),
})

function integer(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(name + ' must be an integer between ' + minimum + ' and ' + maximum)
  }
  return value
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, '')
  if (trimmed === '') return ''
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('baseUrl must use http or https')
  }
  if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    throw new TypeError('baseUrl must not contain credentials, a query, or a fragment')
  }
  return trimmed
}

export function resolveConfig(config: AutoApprovalConfig): ResolvedAutoApprovalConfig {
  const resolved: ResolvedAutoApprovalConfig = {
    enabled: config.enabled ?? false,
    baseUrl: normalizeBaseUrl(config.baseUrl ?? ''),
    model: (config.model ?? '').trim(),
    reasoningEffort: config.reasoningEffort ?? 'medium',
    apiStyle: config.apiStyle ?? 'responses',
    timeoutMs: integer('timeoutMs', config.timeoutMs ?? 30000, 1000, 300000),
    retryCount: integer('retryCount', config.retryCount ?? 3, 0, 10),
    maxOutputTokens: integer('maxOutputTokens', config.maxOutputTokens ?? 1000, 128, 8192),
    circuitConsecutiveDenials: integer(
      'circuitConsecutiveDenials',
      config.circuitConsecutiveDenials ?? 3,
      1,
      20,
    ),
    circuitWindowReviews: integer('circuitWindowReviews', config.circuitWindowReviews ?? 50, 5, 200),
    circuitWindowDenials: integer('circuitWindowDenials', config.circuitWindowDenials ?? 10, 1, 100),
  }
  if (resolved.circuitWindowDenials > resolved.circuitWindowReviews) {
    throw new TypeError('circuitWindowDenials must not exceed circuitWindowReviews')
  }
  return resolved
}