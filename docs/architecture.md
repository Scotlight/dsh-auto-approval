# 架构深剖 / Architecture Deep Dive

[中文](#中文) · [English](#english)

---

## 中文

### 1. 挂载点：approval/request waterfall

DSH 的审批流是一条 cordis waterfall。工具层（dsh-tools）决策 `ask` 时发射 `approval/request`，默认终点是人工审批 UI。本插件以 `{prepend: true, global: true}` 挂在**审批服务 owner fiber** 的 events 表上，插队到人工 UI 之前：

```text
dsh-tools (ask)
  └─► ApprovalService
        └─► waterfall 'approval/request'
              ├─[prepend] dsh-auto-approval   ← 本插件
              │     ├─ allow  ──► 'allowed-once'，人工 UI 不再触发
              │     ├─ deny   ──► 'rejected'
              │     └─ 跳过   ──► next() 传给下一环
              └─[default] 人工审批 UI
```

关键语义：

- **只有 `allowed-once`**。插件不能授予会话级权限——每次放行只对当前这一次工具调用生效。
- **`next()` 保留人工 fallback**。插件在任何不确定场景（未配置、预设不符、证据恢复失败、评审渠道挂了）都调用 `next()` 把请求交给人工，而不是自作主张拒绝。
- **监听器异常 = fail-closed**。ApprovalService 会吞掉 waterfall 监听器的异常并视为 `unavailable`——插件内部任何抛错最终都会坍缩成「不可用」，即不放行。这是 DSH 的安全默认，插件顺势依赖它。

### 2. 证据组装（evidence.ts）

评审器不读会话全文，只拿一份紧凑证据包：

| 字段 | 来源 | 说明 |
|---|---|---|
| `tool` / `arguments` | session log 的 `tool/call` 事件 | 精确动作与参数（从日志恢复而非内存，防篡改口径不一致） |
| `user_instruction` | 最近用户消息 | 授权判断的唯一可信来源 |
| `recent_events` | 滚动窗口内的工具调用摘要 | 行为模式上下文（侦察→读取→外泄 的链条在这里显形） |
| `payload_samples` | **预读文件内容** | 对 egress 形动作（上传/外发/写公共目录），按参数里的路径预读文件前 2KB，最多 4 个文件 |

`payload_samples` 是本插件相对「只看命令行」评审的关键增强：评审器能直接看到「要发出去的到底是什么」。一份写着 `api_key=` 的配置文件即使改名叫 `notes.txt`，预读内容也会暴露其本质。

动作恢复失败（日志里找不到对应 `tool/call`）时直接转人工——宁可烦人，不可盲目放行。

### 3. 评审调用（reviewer.ts）

- **固定路由**：baseUrl/model/reasoningEffort/timeout 全部来自插件配置，与主模型的热切换完全隔离。
- **双 API 风格**：`responses`（OpenAI `/responses`，严格 json_schema 输出）与 `chat`（`/chat/completions`，兼容各类中转渠道）。chat 通道带多层容错：markdown fence 剥离、`reasoning_content` 尾部 JSON 恢复、枚举同义词映射（`blocked`/`request_confirmation` → `deny` 等）、rationale 缺失兜底。
- **输出契约**：`{risk_level, user_authorization, outcome, rationale}`。host 侧再做一层校验，拒绝「ALLOW + CRITICAL」这类自相矛盾的组合。

### 4. 三态熔断（circuit.ts）

按 `sessionId:turn` 为键维护三组计数：

| 状态线 | 阈值 | 触发后 |
|---|---|---|
| 连续拒绝 | 3 | 后续请求秒拒，理由「连续 N 次评审拒绝，已触发熔断」 |
| 连续渠道错误 | 3 | 后续请求秒拒，理由「评审服务连续 N 次失败，已熔断」 |
| 滚动窗口 | 50 次中 10 拒 | 同上，窗口熔断 |

设计要点：

- **错误不进拒绝窗口**——渠道挂了 50 次应该报「服务失败」，而不是误导性地报「拒绝率过高」。
- **任一成功（allow/deny 都算「评审成功」）清零两条连续计数线**——熔断不是惩罚，是止损。
- 熔断打开期间的请求以 `circuit-open` 状态写审计并返回 `rejected`，agent 能读到人话原因并停止重试（对齐 Codex「连续失败自己掐停并说明」的行为）。

### 5. 审计（sidecar JSONL）

每次裁决追加写入 `~/.dsh/auto-approval-audit.jsonl`：

```json
{"sessionId":"session-…","time":1786970745107,"audit":{
  "reviewId":"…","turn":20,"callId":"…","actionHash":"sha256…",
  "status":"denied","risk":"high","authorization":"low","outcome":"deny",
  "rationale":"…","reviewerRoute":"https://…/v1","attempts":1,
  "startedAt":…,"finishedAt":…}}
```

`status` 全集：`allowed` / `denied` / `error` / `cancelled` / `circuit-open` / `delegated`（转人工）。

**为什么是 sidecar 而不是写进 session log**：DSH 的 session 日志有封闭的事件类型表（`KNOWN_SESSION_EVENT_TYPES`），重启 resume 时遇到未知类型直接抛 `SessionFormatUnsupportedError`——早期版本把审计事件写进 session log，导致该会话永久无法恢复。教训沉淀为：**审计走独立文件，永远不碰 session vocabulary**。

### 6. 安全边界

- 插件不替换 DSH 的沙箱/工具决策，只做「审批请求的裁决器」；沙箱阶梯（read-only → workspace-write → danger-full-access）与严格拓宽校验仍由 DSH 核心执行。
- 评审器本身是纯文本任务：无工具、无网络、无嵌套审批。
- API Key 存 DSH 凭据库（`DSH_AUTO_APPROVAL_API_KEY`），不落仓库与日志。
- 配置校验（normalizeBaseUrl 等）拒绝带凭据/query/fragment 的 baseUrl，防止 key 被塞进 URL。

---

## English

### 1. Mount point: the approval/request waterfall

DSH's approval flow is a cordis waterfall. The tool layer (dsh-tools) emits `approval/request` when it decides `ask`; the default terminus is the human approval UI. This plugin hooks the approval service's **owner-fiber events table** with `{prepend: true, global: true}`, cutting in line before the human UI:

```text
dsh-tools (ask)
  └─► ApprovalService
        └─► waterfall 'approval/request'
              ├─[prepend] dsh-auto-approval   ← this plugin
              │     ├─ allow  ──► 'allowed-once'; human UI never fires
              │     ├─ deny   ──► 'rejected'
              │     └─ skip   ──► next() passes to the next handler
              └─[default] human approval UI
```

Key semantics:

- **`allowed-once` only.** The plugin can never grant session-level permissions — each allow covers exactly one tool call.
- **`next()` preserves the human fallback.** In every uncertain scenario (unconfigured, preset mismatch, evidence-recovery failure, dead review channel) the plugin calls `next()` and defers to the human instead of deciding on its own.
- **A throwing listener fails closed.** ApprovalService swallows waterfall listener exceptions and treats them as `unavailable` — any internal error collapses to "not approved". That's DSH's safe default, and the plugin leans on it.

### 2. Evidence assembly (evidence.ts)

The reviewer never reads the whole session; it gets a compact evidence pack:

| Field | Source | Purpose |
|---|---|---|
| `tool` / `arguments` | `tool/call` event in the session log | The exact action and args (recovered from the log, not memory, for a consistent tamper-resistant view) |
| `user_instruction` | Most recent user message | The only trusted source for authorization |
| `recent_events` | Rolling window of tool-call summaries | Behavioral context (the recon → read → exfiltrate chain shows up here) |
| `payload_samples` | **Pre-read file contents** | For egress-shaped actions (upload/send/write-to-public), pre-reads up to 4 files at 2KB each from the paths in the args |

`payload_samples` is the key upgrade over command-line-only review: the reviewer sees *what would actually leave the machine*. A config file full of `api_key=` lines exposes its nature in the pre-read even if renamed to `notes.txt`.

If the action can't be recovered (no matching `tool/call` in the log), the request goes straight to the human — annoying beats blind allowing.

### 3. Review call (reviewer.ts)

- **Fixed route**: baseUrl / model / reasoningEffort / timeout all come from plugin config, fully isolated from the agent's hot model switches.
- **Dual API styles**: `responses` (OpenAI `/responses`, strict json_schema output) and `chat` (`/chat/completions`, for relay/proxy providers). The chat path carries layered tolerance: markdown-fence stripping, tail-JSON recovery from `reasoning_content`, enum synonym mapping (`blocked`/`request_confirmation` → `deny`, …), and a rationale fallback.
- **Output contract**: `{risk_level, user_authorization, outcome, rationale}`. The host re-validates and rejects self-contradictory pairs like "ALLOW + CRITICAL".

### 4. Three-state circuit breaker (circuit.ts)

Keyed by `sessionId:turn`, three independent counters:

| Line | Threshold | After trip |
|---|---|---|
| Consecutive denials | 3 | Later requests fast-fail: "N consecutive denials, breaker open" |
| Consecutive channel errors | 3 | Later requests fast-fail: "review service failed N times" |
| Rolling window | 10 denials in 50 | Same, window breaker |

Design notes:

- **Errors never enter the denial window** — 50 dead-channel calls should report "service failure", not misleadingly "high denial rate".
- **Any successful review (allow or deny) resets both consecutive counters** — the breaker is a stop-loss, not a punishment.
- While open, requests are audited as `circuit-open` and return `rejected` with a human-readable reason, so the agent stops retrying (parity with Codex's "stop and announce approval failure").

### 5. Audit (sidecar JSONL)

Every verdict appends to `~/.dsh/auto-approval-audit.jsonl` (sample row above in the Chinese section). Full `status` set: `allowed` / `denied` / `error` / `cancelled` / `circuit-open` / `delegated`.

**Why a sidecar and not the session log**: DSH session logs have a closed event-type vocabulary (`KNOWN_SESSION_EVENT_TYPES`); on resume, an unknown type raises `SessionFormatUnsupportedError`. An early version wrote audit events into the session log and bricked that session's resume permanently. The lesson is baked in: **audit goes to its own file, never touches the session vocabulary**.

### 6. Security boundary

- The plugin does not replace DSH's sandbox/tool decisions; it is purely the adjudicator of approval requests. The sandbox ladder (read-only → workspace-write → danger-full-access) and strict-widening checks remain in DSH core.
- The reviewer itself is a plain-text task: no tools, no network, no nested approvals.
- The API key lives in the DSH credential store (`DSH_AUTO_APPROVAL_API_KEY`), never in the repo or logs.
- Config validation (normalizeBaseUrl etc.) rejects baseUrls containing credentials, queries, or fragments, so keys can't leak into URLs.
