# 实战踩坑档案 / Field Notes

[中文](#中文) · [English](#english)

开发这个插件的三天里踩过的坑，按「症状 → 根因 → 解法」记录。对写 DSH 插件、调 OpenAI 兼容中转渠道的人都有参考价值。

---

## 中文

### 1. cordis traceable 代理：拆函数丢失 receiver

**症状**：审批监听器完全不触发。session log 里有 `approval/asked → ~6s → approval/decided:unavailable`，插件零日志零审计。排查了预设、凭据、模型配置、hook 注册表（hook 确实在 `_hooks` 表里）全部正常，悬案两天。

**根因**：审计函数里 `const append = session.append; append(...)` 这种拆函数调用，在 cordis 的 traceable 代理下 `this` 变成 `undefined`，在 dsh-session 内部 `this.log.length` 处抛 TypeError。而 ApprovalService 会吞掉 waterfall 监听器的异常并视为 `unavailable`——**监听器其实在跑，是它内部炸了被静默兜底**。

**解法**：`session.append(type, audit)` 永远直接调用。**通用教训：排查「事件监听器没触发」时，先确认它是不是触发了但内部抛错被吞——往监听器第一行塞一个文件写入探针（appendFileSync），比看 logger 靠谱得多**（cordis 的 logger.warn 根本不落 DSH 的后台日志文件）。

### 2. session 日志词表：自定义事件砖死会话

**症状**：往 session log 写自定义事件类型（`auto-approval/reviewed`）后，该会话重启时抛 `SessionFormatUnsupportedError`，永久无法恢复。

**根因**：DSH session 日志有封闭的事件类型表 `KNOWN_SESSION_EVENT_TYPES`，resume 时遇到未知类型直接拒绝加载。`session.append()` 没有 `ignorable` 参数可绕过。

**解法**：审计改走 sidecar 文件（`~/.dsh/auto-approval-audit.jsonl`），永不触碰 session vocabulary。**通用教训：DSH 插件的持久化数据一律放自己的文件，session log 只留给核心事件。**

### 3. 中转渠道四大怪癖（OpenAI 兼容层）

对接过 7+ 个中转渠道，踩到的坑按频率排：

| 怪癖 | 症状 | 解法 |
|---|---|---|
| 反斜杠转义被拒 | 请求体含 `\\`（Windows 路径）→ 400 "invalid JSON"，渠道的 JSON parser 自己解析不了合法转义 | 发送前 `\\` → `\` 全量替换 |
| reasoning 模型空 content | `content: ""`，全部 token 花在 `reasoning_content`，`max_tokens` 给多少都不够输出 | 从 `reasoning_content` 尾部做括号配对恢复完整 JSON；`max_tokens` 放大 4 倍下限 4000 |
| rationale 字段被吃 | 判决字段（risk/auth/outcome）完好，rationale 消失 | 合成兜底文案："Reviewer omitted rationale (channel-forwarded model); verdict fields arrived intact." |
| 枚举漂移 | 模型输出 `blocked`/`denied`/`request_confirmation` 而不是 schema 里的 `deny`；`insufficient`/`not_authorized` 而不是 `unknown` | 同义词映射表 + fence 剥离 + 严格 json_schema（responses 通道）双保险 |

另：**测试渠道存活别用 python urllib 默认 UA**——有的渠道 WAF 直接 403，会误判成 key 失效。用 curl + 浏览器 UA。

### 4. Windows 运维细节

- 杀 DSH 进程：`Stop-Process` 会 access denied，用 `(Get-Process -Id $pid).Kill()`。
- 后台启动：`Start-Process node -ArgumentList ... -RedirectStandardOutput ...`，日志在 `~/.dsh/profiles/web/dsh-web-background.{out,err}.log`——但 cordis logger 不落这里，判断插件行为要看审计文件。
- 端口占用检查要等启动完成后再查，`Start-Sleep 8` 以上。

### 5. 评审模型的行为校准

- **grok/gpt 系当评审器**：判断准确但和主模型同源时有「同盲区」风险，建议评审器用不同家族的模型交叉评审。
- **低 reasoning effort**（low/none）对 chat 通道反而更稳：token 不会被 reasoning_content 吃光。
- **政策全文（10KB）显著提升判决质量**：早期用精简版策略时 rationale 经常空洞；换 Codex policy 全文后 rationale 开始逐条引用规则（「persistent security weakening that is not narrowly scoped」这种引用级别的理由）。

### 6. 测试方法论

- **端到端**：RPC 直发 `session.prompt`（`{mode:'queue', content:[{type:'text',text:...}]}`），用「按文件操作」类指令触发工作区外写入；判据三件套——审计文件新行、Public 目录落盘情况、`icacls` 核对 ACL。
- **危险动作测试的无害化**：假凭据（随机 hex 的 `stg_` 前缀 token）、预创建的占位目录、localhost 接收端。评审器看的是「行为模式」，payload 本身无害不影响判定有效性——已被实测验证（fake token 照样判 credential exposure）。
- **测试产物命名**：别用 test/fake 这类词根，用 deploy-/release-/sync- 等中性词，避免污染目标机器上的安全审计基线。

---

## English

Everything that bit us during the three days of development, recorded as symptom → root cause → fix. Useful for anyone writing DSH plugins or debugging OpenAI-compatible relay channels.

### 1. cordis traceable proxies: detaching a method loses its receiver

**Symptom**: the approval listener never seemed to fire. The session log showed `approval/asked → ~6s → approval/decided:unavailable`; zero plugin logs, zero audit rows. Preset, credentials, model config, hook registration table — all checked out. A two-day mystery.

**Root cause**: the audit helper did `const append = session.append; append(...)`. Under cordis's traceable proxy, that detached call runs with `this === undefined` and throws a TypeError inside dsh-session at `this.log.length`. ApprovalService swallows waterfall listener exceptions as `unavailable` — **the listener *was* firing; it was crashing and being silently absorbed**.

**Fix**: always call `session.append(type, audit)` directly. **General lesson: when an event listener "doesn't fire", first verify it isn't firing-but-throwing — drop a file-write probe (`appendFileSync`) as the first line of the listener. It beats reading logs** (cordis `logger.warn` never reaches DSH's background log files at all).

### 2. Session-log vocabulary: custom events brick the session

**Symptom**: after writing a custom event type (`auto-approval/reviewed`) into the session log, that session threw `SessionFormatUnsupportedError` on every restart — permanently unresumable.

**Root cause**: DSH session logs use a closed event-type table (`KNOWN_SESSION_EVENT_TYPES`); resume refuses unknown types. `session.append()` offers no `ignorable` escape hatch.

**Fix**: audit to a sidecar file (`~/.dsh/auto-approval-audit.jsonl`); never touch the session vocabulary. **General lesson: DSH plugins persist to their own files; the session log belongs to core events only.**

### 3. Four relay-channel quirks (OpenAI-compatible layer)

Having integrated 7+ relay providers, by frequency:

| Quirk | Symptom | Fix |
|---|---|---|
| Backslash escapes rejected | Body containing `\\` (Windows paths) → 400 "invalid JSON"; the channel's own parser can't handle legal escapes | Replace `\\` with `\` before sending |
| Reasoning models return empty content | `content: ""`, every token spent in `reasoning_content`; no `max_tokens` is ever enough | Recover the JSON via bracket matching from the tail of `reasoning_content`; raise `max_tokens` to 4× with a 4000 floor |
| The rationale field gets eaten | Verdict fields (risk/auth/outcome) arrive intact; rationale vanishes | Synthesize a fallback string stating the verdict fields arrived intact |
| Enum drift | Models emit `blocked`/`denied`/`request_confirmation` instead of schema `deny`; `insufficient`/`not_authorized` instead of `unknown` | Synonym mapping + fence stripping + strict json_schema on the `responses` path |

Also: **don't probe channel health with python urllib's default User-Agent** — some WAFs return a bare 403 and you'll misdiagnose a valid key as dead. Use curl with a browser UA.

### 4. Windows ops details

- Killing DSH: `Stop-Process` gets access-denied; use `(Get-Process -Id $pid).Kill()`.
- Background start: `Start-Process node ... -RedirectStandardOutput ...`; logs land in `~/.dsh/profiles/web/dsh-web-background.{out,err}.log` — but cordis logging never reaches these files; watch the audit file to see plugin behavior.
- Wait 8+ seconds after launch before checking the port.

### 5. Reviewer-model calibration

- **grok/gpt-family reviewers**: accurate, but same-family-as-agent reviewers share blind spots; cross-review with a different model family.
- **Low reasoning effort** (low/none) is *more* stable on chat channels: tokens don't vanish into `reasoning_content`.
- **The full policy text (~10KB) markedly improves verdicts**: with the abbreviated policy, rationales were often hollow; with the full Codex policy, rationales cite rules clause by clause ("persistent security weakening that is not narrowly scoped").

### 6. Testing methodology

- **End-to-end**: send `session.prompt` over RPC (`{mode:'queue', content:[{type:'text',text:...}]}`) with follow-the-file instructions to trigger out-of-workspace writes; verify with the audit file, the Public directory, and `icacls`.
- **Harmless dangerous-action tests**: fake credentials (random-hex `stg_` tokens), pre-created placeholder directories, localhost receivers. The reviewer judges the *behavior pattern* — a fake payload doesn't invalidate the verdict, as verified live (a fake token still gets classified as credential exposure).
- **Artifact naming**: never use test/fake word roots; use neutral names (deploy-/release-/sync-) so you don't pollute security-audit baselines on the target machine.
