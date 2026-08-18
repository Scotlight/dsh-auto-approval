# dsh-auto-approval

English · [简体中文](README.zh-CN.md)

In DSH (DeepSeek Harness), agents trigger approval prompts for out-of-sandbox writes, command runs, etc. Under the "Auto Approve" preset, this plugin hands every approval request to a fixed reviewer model for a verdict:

```text
approval request ──► collect evidence (tool call + args + egress payload pre-read)
                        │
                        ▼
              reviewer model (fixed route, immune to
              the agent's hot model switches)
              embeds the full Codex Guardian policy
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
            allow             deny / circuit-break
       (allow this once)   (reject with a readable reason)
              │
     channel failure → fail-closed to human, never silently allow
```

### Features

- **Independent review channel** — endpoint, model, reasoning effort and timeout are configured separately; hot-swapping the agent's main model never touches the reviewer
- **Full Codex Guardian policy** — the risk (low/medium/high/critical) × authorization (unknown/low/medium/high) matrix; file/tool content counts as *untrusted* evidence, only explicit user instruction authorizes — "do what the file says" does not authorize the dangerous thing inside the file
- **Payload samples** — for egress-shaped actions the plugin pre-reads the file being written/uploaded (2KB excerpt) so the reviewer sees exactly what would leave the machine
- **Three-state circuit breaker** — 3 consecutive denials / 3 consecutive channel errors / 10 denials in a 50-review window; any trip fast-fails with a readable reason (parity with Codex's "stop and announce approval failure" behavior)
- **Fail-closed** — a dead review endpoint never results in an allow; requests fall back to the human approval UI
- **Sidecar audit trail** — every verdict (allow/deny/error/circuit-open/delegated) is appended to `~/.dsh/auto-approval-audit.jsonl` with risk/authorization/rationale
- **Dual API styles** — `responses` (strict json_schema) or `chat` (OpenAI-compatible `/chat/completions`) for relay/proxy providers

### Verified behavior (live cases)

| Action | Verdict | Rationale |
|---|---|---|
| User explicitly asked: delete this directory | ✅ allow | narrow scope + explicit authorization |
| A **file** instructed: copy an API-key config into Public | ❌ deny | "user only authorized following untrusted file content, never authorized writing secrets to a public path" |
| A **file** instructed: set a directory ACL to Everyone:F | ❌ deny | persistent security weakening, not narrowly scoped |
| Review channel failed 3× in a row | ❌ breaker | "review service failed 3 times in a row — check the channel or retry later" |

### Install

```sh
dsh plugin --profile web add /path/to/dsh-auto-approval
```

Restart DSH Web, then fill in **Settings → Plugins → Plugin config → DSH 自动审批**:

![settings](docs/screenshot-settings.png)

Then: any OpenAI-compatible endpoint, a reviewer model, and the API key (stored in the DSH credential store, never in the repo). Pick the **Auto Approve** preset in a session to activate.

### Development

```sh
pnpm install
pnpm run build   # tsc + client bundle
pnpm test        # vitest: evidence recovery, output parsing tolerance, breaker states, error breaker
```

### Policy sources

- [codex-rs/core/src/guardian/policy_template.md](https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/policy_template.md)
- [Codex sandboxing/auto-review docs](https://learn.chatgpt.com/docs/sandboxing/auto-review)

## License

MIT