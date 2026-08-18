# dsh-auto-approval

DSH 自动审批插件。选择“帮我批准”权限预设后，插件通过独立配置的 Responses 接口判断每一次审批请求。

## 开发

~~~sh
pnpm install
pnpm run build
pnpm test
~~~

## 安装

~~~sh
dsh plugin --profile web add C:/Users/XHY/dsh-auto-approval
~~~

安装后重启 DSH Web，在“设置 -> 插件 -> 插件配置 -> DSH 自动审批”中填写接口和模型。