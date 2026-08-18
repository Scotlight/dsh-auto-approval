"use strict";

const React = require("react");
const h = React.createElement;
const SETTINGS_ROUTE = "/_dsh/auto-approval/settings";

const css = ".daa-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:6px;list-style:none;overflow:hidden}.daa-header{width:100%;min-height:52px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:transparent;border:0;display:flex;align-items:center;justify-content:space-between;padding:12px 14px}.daa-header:hover{background:var(--dsw-alias-interactive-bg-hover)}.daa-title{color:var(--dsw-alias-label-primary);font-weight:600}.daa-chevron{color:var(--dsw-alias-label-tertiary);font-size:13px;transition:transform .12s}.daa-chevron-open{transform:rotate(180deg)}.daa-body{border-top:1px solid var(--dsw-alias-border-l2);padding:14px}.daa-loading,.daa-error{font-size:13px;line-height:1.5}.daa-loading{color:var(--dsw-alias-label-tertiary)}.daa-error{color:var(--dsw-alias-label-danger,#c93f48);margin-bottom:10px}.daa-form{display:flex;flex-direction:column;gap:14px}.daa-toggle{display:flex;align-items:center;gap:9px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;cursor:pointer}.daa-toggle input{width:16px;height:16px;margin:0}.daa-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.daa-field{display:flex;flex-direction:column;gap:6px;min-width:0}.daa-field-wide{grid-column:1/-1}.daa-label{color:var(--dsw-alias-label-secondary);font-size:13px}.daa-input,.daa-select{width:100%;height:34px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 9px}.daa-input:focus,.daa-select:focus{outline:2px solid var(--dsw-alias-button-info-fill);outline-offset:1px}.daa-key-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.daa-status{color:var(--dsw-alias-label-tertiary);font-size:12px}.daa-clear{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:13px;white-space:nowrap;height:34px}.daa-section{border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px}.daa-section-title{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;margin-bottom:10px}.daa-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px}.daa-button{height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 14px;cursor:pointer}.daa-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.daa-button-primary{border-color:var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-button-info-label,#fff)}.daa-button:disabled{cursor:not-allowed;opacity:.55}@media(max-width:680px){.daa-grid{grid-template-columns:minmax(0,1fr)}.daa-field-wide{grid-column:auto}.daa-key-row{grid-template-columns:minmax(0,1fr)}.daa-clear{height:auto}.daa-actions{justify-content:stretch}.daa-button{flex:1}}@media(prefers-reduced-motion:reduce){.daa-chevron{transition:none}}.daa-select-wrap{position:relative}.daa-select-trigger{display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer}.daa-select-open{border-color:var(--dsw-alias-button-info-fill);box-shadow:0 0 0 2px rgba(120,180,255,.22)}.daa-select-chevron{color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transform:translateY(-1px)}.daa-select-menu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:220px;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 8px 24px #0008}.daa-select-option{display:block;width:100%;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;padding:8px 9px;cursor:pointer}.daa-select-option:hover,.daa-select-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}.daa-select-option-selected{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-label-primary))}";
if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-auto-approval"]') === null) {
  const style = document.createElement("style");
  style.dataset.pluginCss = "dsh-auto-approval";
  style.textContent = css;
  document.head.appendChild(style);
}

async function apiRequest(init) {
  const response = await fetch(SETTINGS_ROUTE, Object.assign({ credentials: "same-origin" }, init));
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(body && body.error && body.error.message ? body.error.message : "请求失败（HTTP " + response.status + "）");
  }
  return body.value;
}

class SettingsController {
  constructor() {
    this.state = { status: "idle", data: null, error: null, saving: false };
    this.listeners = new Set();
    this.generation = 0;
    this.subscribe = this.subscribe.bind(this);
    this.snapshot = this.snapshot.bind(this);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return this.state;
  }

  publish(next) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  async load() {
    const generation = ++this.generation;
    this.publish(Object.assign({}, this.state, { status: "loading", error: null }));
    try {
      const data = await apiRequest({ method: "GET" });
      if (generation !== this.generation) return;
      this.publish({ status: "ready", data, error: null, saving: false });
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish({ status: "error", data: this.state.data, error: error instanceof Error ? error.message : "加载失败", saving: false });
    }
  }

  async save(value, apiKey) {
    if (!this.state.data) return;
    const generation = ++this.generation;
    this.publish(Object.assign({}, this.state, { saving: true, error: null }));
    try {
      const data = await apiRequest({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: this.state.data.revision, value, apiKey }),
      });
      if (generation !== this.generation) return;
      this.publish({ status: "ready", data, error: null, saving: false });
    } catch (error) {
      if (generation !== this.generation) return;
      this.publish(Object.assign({}, this.state, { error: error instanceof Error ? error.message : "保存失败", saving: false }));
      throw error;
    }
  }
}

function Field(props) {
  return h("label", { className: "daa-field" + (props.wide ? " daa-field-wide" : "") },
    h("span", { className: "daa-label" }, props.label),
    props.children,
  );
}

const REASONING_OPTIONS = ["none", "low", "medium", "high", "xhigh"];

function SelectField(props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const selectedIndex = Math.max(0, props.options.findIndex(option => option.value === props.value));

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (!rootRef.current || !rootRef.current.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (selectedIndex + delta + props.options.length) % props.options.length;
        props.onChange(props.options[next].value);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, props, selectedIndex]);

  const selected = props.options[selectedIndex];
  return h("div", { className: "daa-select-wrap", ref: rootRef },
    h("button", {
      type: "button",
      className: "daa-select daa-select-trigger" + (open ? " daa-select-open" : ""),
      role: "combobox",
      "aria-expanded": open,
      "aria-haspopup": "listbox",
      "aria-controls": props.id + "-listbox",
      onClick: () => setOpen(value => !value),
      onKeyDown: event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      },
    },
      h("span", null, selected ? selected.label : props.value),
      h("span", { className: "daa-select-chevron", "aria-hidden": "true" }, "⌄"),
    ),
    open ? h("div", { id: props.id + "-listbox", className: "daa-select-menu", role: "listbox", "aria-label": props.label },
      props.options.map(option => h("button", {
        key: option.value,
        type: "button",
        role: "option",
        "aria-selected": option.value === props.value,
        className: "daa-select-option" + (option.value === props.value ? " daa-select-option-selected" : ""),
        onClick: () => {
          props.onChange(option.value);
          setOpen(false);
        },
      }, option.label)),
    ) : null,
  );
}

function NumberField(props) {
  return h(Field, { label: props.label },
    h("input", {
      className: "daa-input",
      type: "number",
      min: props.min,
      max: props.max,
      step: 1,
      value: props.value,
      onChange: event => props.onChange(Number(event.target.value)),
    }),
  );
}

function SettingsForm(props) {
  const state = props.state;
  const controller = props.controller;
  const data = state.data;
  const [draft, setDraft] = React.useState(data.value);
  const [apiKey, setApiKey] = React.useState("");
  const [clearKey, setClearKey] = React.useState(false);

  React.useEffect(() => {
    setDraft(data.value);
    setApiKey("");
    setClearKey(false);
  }, [data.revision]);

  const update = (name, value) => setDraft(current => Object.assign({}, current, { [name]: value }));
  const discard = () => {
    setDraft(data.value);
    setApiKey("");
    setClearKey(false);
  };
  const save = async () => {
    const keyAction = clearKey
      ? { mode: "clear" }
      : apiKey.trim() === ""
        ? { mode: "preserve" }
        : { mode: "set", value: apiKey.trim() };
    try {
      await controller.save(draft, keyAction);
      setApiKey("");
      setClearKey(false);
    } catch {}
  };

  return h("div", { className: "daa-form" },
    state.error ? h("div", { className: "daa-error", role: "alert" }, state.error) : null,
    h("label", { className: "daa-toggle" },
      h("input", {
        type: "checkbox",
        checked: draft.enabled,
        onChange: event => update("enabled", event.target.checked),
      }),
      h("span", null, "启用自动审批"),
    ),
    h("div", { className: "daa-grid" },
      h(Field, { label: "API Key", wide: true },
        h("div", { className: "daa-key-row" },
          h("div", { className: "daa-field" },
            h("input", {
              className: "daa-input",
              type: "password",
              autoComplete: "off",
              disabled: clearKey || !data.credential.writable,
              value: apiKey,
              placeholder: data.credential.configured ? "已配置密钥" : "输入 API Key",
              onChange: event => setApiKey(event.target.value),
            }),
            h("span", { className: "daa-status" },
              data.credential.configured ? "已配置密钥" : "尚未配置密钥",
              data.credential.writable ? "" : "（当前来源只读）",
            ),
          ),
          data.credential.configured
            ? h("label", { className: "daa-clear" },
                h("input", {
                  type: "checkbox",
                  checked: clearKey,
                  disabled: !data.credential.writable,
                  onChange: event => setClearKey(event.target.checked),
                }),
                h("span", null, "清除密钥"),
              )
            : null,
        ),
      ),
      h(Field, { label: "接口地址", wide: true },
        h("input", {
          className: "daa-input",
          type: "url",
          value: draft.baseUrl,
          placeholder: "https://HOST/v1",
          onChange: event => update("baseUrl", event.target.value),
        }),
      ),
      h(Field, { label: "评审模型" },
        h("input", {
          className: "daa-input",
          type: "text",
          value: draft.model,
          placeholder: "MODEL",
          onChange: event => update("model", event.target.value),
        }),
      ),
      h(Field, { label: "推理强度" },
        h(SelectField, {
          id: "daa-reasoning-effort",
          label: "推理强度",
          value: draft.reasoningEffort,
          options: REASONING_OPTIONS.map(value => ({ value, label: value })),
          onChange: value => update("reasoningEffort", value),
        }),
      ),
      h(NumberField, { label: "审批超时（毫秒）", min: 1000, max: 300000, value: draft.timeoutMs, onChange: value => update("timeoutMs", value) }),
      h(NumberField, { label: "失败重试次数", min: 0, max: 10, value: draft.retryCount, onChange: value => update("retryCount", value) }),
      h(NumberField, { label: "最大输出 Token", min: 128, max: 8192, value: draft.maxOutputTokens, onChange: value => update("maxOutputTokens", value) }),
    ),
    h("div", { className: "daa-section" },
      h("div", { className: "daa-section-title" }, "拒绝熔断"),
      h("div", { className: "daa-grid" },
        h(NumberField, { label: "连续拒绝次数", min: 1, max: 20, value: draft.circuitConsecutiveDenials, onChange: value => update("circuitConsecutiveDenials", value) }),
        h(NumberField, { label: "统计窗口（次）", min: 5, max: 200, value: draft.circuitWindowReviews, onChange: value => update("circuitWindowReviews", value) }),
        h(NumberField, { label: "窗口拒绝次数", min: 1, max: 100, value: draft.circuitWindowDenials, onChange: value => update("circuitWindowDenials", value) }),
      ),
    ),
    h("div", { className: "daa-actions" },
      h("button", { className: "daa-button", type: "button", disabled: state.saving, onClick: discard }, "放弃修改"),
      h("button", { className: "daa-button daa-button-primary", type: "button", disabled: state.saving || !data.writable, onClick: save }, state.saving ? "保存中..." : "保存"),
    ),
  );
}

function AutoApprovalCard(props) {
  const controller = props.controller;
  const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [open, setOpen] = React.useState(false);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state.status === "idle") controller.load();
  };

  let body = null;
  if (open) {
    if (state.status === "idle" || (state.status === "loading" && !state.data)) {
      body = h("div", { className: "daa-loading" }, "正在加载...");
    } else if (!state.data) {
      body = h("div", { className: "daa-error", role: "alert" }, state.error || "设置不可用");
    } else {
      body = h(SettingsForm, { controller, state });
    }
  }

  return h("li", { className: "daa-card" },
    h("button", {
      type: "button",
      className: "daa-header",
      "aria-expanded": open,
      "aria-label": (open ? "收起" : "展开") + "：DSH 自动审批",
      onClick: toggle,
    },
      h("span", { className: "daa-title" }, "DSH 自动审批"),
      h("span", { className: "daa-chevron" + (open ? " daa-chevron-open" : ""), "aria-hidden": "true" }, "▾"),
    ),
    open ? h("div", { className: "daa-body" }, body) : null,
  );
}

function decoratePermissionPreset() {
  const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
  const item = items.find(candidate => candidate.textContent && candidate.textContent.trim() === "Auto Approve");
  if (!item || item.dataset.autoApprovalDecorated === "true") return;
  const label = Array.from(item.children).find(child => child.textContent && child.textContent.trim() === "Auto Approve");
  const sample = items.map(candidate => candidate.querySelector("span:has(> svg)")).find(Boolean);
  if (!label || !sample) return;
  const icon = document.createElement("span");
  icon.className = sample.className;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"></path><path d="m9 12 2 2 4-4"></path></svg>';
  item.insertBefore(icon, label);
  item.dataset.autoApprovalDecorated = "true";
}

exports.inject = ["slots"];
exports.apply = function apply(ctx) {
  const controller = new SettingsController();
  ctx.effect(() => {
    const observer = new MutationObserver(decoratePermissionPreset);
    observer.observe(document.body, { childList: true, subtree: true });
    decoratePermissionPreset();
    return () => observer.disconnect();
  }, "dsh-auto-approval: permission preset icon");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "auto-approval",
    order: 85,
    inject: () => ({ controller }),
  }, AutoApprovalCard));
};