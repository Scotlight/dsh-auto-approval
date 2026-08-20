# DSH 自动审批插件设计

## 目标

提供一个独立 DSH 插件，在用户选择“Auto Approve”权限预设后，由插件自己的评审模型逐次判断审批请求。评审接口、模型和密钥独立配置，不读取当前会话的模型请求路由，因此主模型热切换不会影响审批。

## 边界

- 插件只处理 DSH 已经判定为需要审批的请求，不替换工具、沙箱或权限扩大检查。
- allowed-once 只放行当前调用；插件不授予持久权限。
- 未选择“Auto Approve”、插件未启用或配置不完整时，继续交给现有人工审批。
- 评审接口异常或响应无效时不自动放行，回落到人工审批。
- 明确拒绝、关键风险或熔断状态直接返回 rejected。

## 数据流

1. 监听 approval/request waterfall，并以 prepend 排在 Web 人工回答器之前。
2. 确认当前权限预设为 auto-approval。
3. 从当前 Session 的 tool/call 事件按 callId 恢复完整工具名与参数。
4. 只把直接用户消息当作可信授权证据；审批理由和工具参数只作为不可信事实输入。
5. 使用插件设置中的 baseUrl、model 和 DSH 凭据引用直接请求 {baseUrl}/responses。
6. 使用严格 JSON Schema 解析 risk_level、user_authorization、outcome 和 rationale。
7. 宿主侧再次检查组合一致性，再映射为 allowed-once 或 rejected。
8. 在 Session 中追加不含原始参数和密钥的 auto-approval/reviewed 审计事件。

## 密钥

API Key 固定使用凭据引用 DSH_AUTO_APPROVAL_API_KEY。设置文档只保存非敏感字段。Web 设置接口只返回 configured 和 writable，空输入保留现有密钥，并提供明确清除操作。

## 熔断

状态按 Session 和 turn 隔离。连续拒绝达到阈值，或最近窗口内拒绝数达到阈值后，本 turn 后续请求直接拒绝。一次允许会清零连续拒绝计数。

## Web 设置

客户端在 settings.plugin.item 注册与内置插件卡一致的折叠项，标题为“DSH 自动审批”。设置包括启用状态、API Key、接口地址、评审模型、推理强度、超时、重试、最大输出 Token 和熔断参数。

“推理强度”使用仿 DSH 的自绘深色菜单，而不是受操作系统主题影响的原生 select 展开层。菜单沿用宿主背景、边框、悬浮和选中态变量，并支持鼠标点击、外部点击关闭以及方向键、Enter、Space、Escape 键盘交互；配置值和服务端保存格式保持不变。