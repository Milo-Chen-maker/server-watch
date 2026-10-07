# Server Watch

2026-10-07 Pi 更新：独立后端已嵌入 Pi Agent SDK，接入 GPU、进程、用户、存储、告警五个只读工具、会话工具记录和取消链路，详见 [Pi Agent 接入](docs/PI-AGENT.md)。Sites 保留原直接文本接口。

2026-10-07 监控更新：26-server 独立版已接入真实只读采集、15 秒自动刷新和服务端阈值持久化，详见 [真实监控接入](docs/REAL-MONITORING.md)。下面的模拟原型描述仍适用于默认 mock 模式及 Sites 版本；独立服务设置 `SERVER_WATCH_MONITOR_MODE=script` 后使用真实采样。

Vue 3 + TypeScript + Element Plus 管理面板；Fastify 独立服务；共用监控协议与规则。监控仍使用可替换的模拟数据。新增独立 AI 助手与快速提问，共用服务端会话、模型与 API 配置；配置后可调用 OpenAI 兼容接口。默认模式使用模拟采样；独立服务的真实采集和 Pi 工具能力见上方更新，邮件发送尚未实现。

## 结构

- `web/`：Vue 前端。可折叠侧栏（200/64px，浏览器记忆）；顶栏单一标题；窄屏抽屉导航；GPU/存储表格；用户汇总、进程筛选；详情、问答、分析和邮件预览抽屉；GPU详情可复制PID和命令、跳转到GPU进程筛选；显存可排序；本浏览器阈值保存。
- `server/`：可独立运行的 Fastify 服务。默认只监听 `127.0.0.1:3000`。
- `contracts/monitoring.ts`：Snapshot、GPU、进程、磁盘、阈值、分析与运行时校验；mock 生成和确定性告警规则。
- `contracts/questions.ts`：用户汇总与模拟问答规则。
- `contracts/assistant.ts`：服务商、会话与消息协议；`lib/assistant-service.ts`：服务商配置、AES-GCM 密钥加密、连接测试、模型发现、NDJSON 流式问答与会话保存。
- `lib/assistant-db.ts`：Sites D1 存储；`server/assistant-repository.ts`：独立 Node 版本文件存储适配器。
- `lib/adapters.ts`：MonitorAdapter、AnalysisAdapter、QuestionAdapter；接入真实采集和 pi-agent 的替换位置。
- `app/api/`：Sites 预览使用的 Worker API 路由，与独立服务复用同一协议、规则和适配器。
- `app/page.tsx`：Sites 入口重定向到 Vue 构建页面，不承载产品 UI。
- `public/console/`：Vue 构建产物。部署时保留，重新构建会替换。

## 本机开发

Node 22.19.0+，pnpm。仓库已有 lockfile。

```sh
pnpm install --frozen-lockfile
pnpm web:check
pnpm server:check
pnpm web:build
pnpm server:dev
```

访问 `http://127.0.0.1:3000/`。前后端同源，不需要 CORS。修改 Vue 后运行 `pnpm web:build` 并刷新；后端通过 tsx watch 自动重启。

```sh
pnpm check:core
```

验证 API 输入校验、GPU/进程显存一致、跨卡 PID 去重、用户汇总、阈值启停、问答和静态页面服务。

独立 Fastify 服务尚未实现应用登录或权限管理，默认只绑定本机。正式开放访问前需加入认证、服务器访问权限与反向代理；当前私有托管的认证由 Sites 提供，不应把它当作独立服务已有的能力。

## 接口

| 方法 | 地址 | 输入 | 输出 |
|---|---|---|---|
| GET | /api/assistant | 无 | 服务商（无密钥）和会话 |
| POST | /api/assistant | action + 对应参数 | 配置/会话操作；chat 为 NDJSON 事件流 |
| GET | /api/monitor | scenario=normal/pressure/critical, tick=0..1000000 | Snapshot |
| POST | /api/analyze | {snapshot,thresholds} | Analysis |
| POST | /api/chat | {question,snapshot,thresholds,history:[{question}]} | QuestionReply |
| POST | /api/users | Snapshot | UserStatistics[]（独立 Fastify 服务） |
| GET | /api/health | 无 | {status,mode}（独立 Fastify 服务） |

监控数据使用 `schemaVersion: '1.0'`。Snapshot 包含 server、source、capturedAt、gpus、disks、可选 processes 和模拟 history；全部字段和校验以 contracts 为准。显存、存储容量按 GB 展示；真实采集需统一转换，避免 GiB/GB 混用。

进程记录：`{gpuId,pid,user,command,task,memoryUsed}`。同一 PID 跨卡可有多条分配；PID-GPU 组合不可重复，gpuId 必须存在。进程数按 PID 去重，显存按 GPU 分配求和。GPU 利用率属于整卡，不能推算单进程利用率。真实 GPU 显存可能包含非进程开销，需保留未归属部分，不强行分摊。

模拟场景为 8 张 A800 80 GB，用户 alice、bob、chen、svc-llm 均为虚构。任务标签是模拟数据；真实采集应允许未知用途，并区分人工标签与命令推断。

## 阈值与告警

GPU、显存、存储 1–100%；温度 30–110°C；value >= threshold 触发。关闭告警后返回空告警。规则使用确定性代码，模型不决定是否超阈值。默认 90% / 90% / 85% / 80°C。

阈值仅保存在当前浏览器 localStorage。设置页区分编辑草稿与当前生效值，显示未保存提示；保存前不影响监控规则。告警页只展示当前采样的预览，不是持久化历史，不发送邮件。暂停告警仅停止告警预览，资源页仍独立对照阈值显示风险；低于阈值不等于任务运行正常。采样超过2分钟标为过期（每15秒检查）；刷新失败保留旧采样，状态不能当成当前事实。当前无持续时间、冷却或后台调度。规则严重级别：百分比 >=95% 或温度超过配置阈值至少5°C 标为严重，否则警告。

## 问答与分析

用户主动提问；不主动追问。规则模拟支持 GPU、用户、进程、磁盘、温度、显存余量及告警查询。问题 <=1000字符。顶部“提问”与 AI 助手共用会话、模型选择和输入草稿；GPU/告警入口只预填问题，不自动发送。会话支持新建、搜索、重命名、删除，最多100个会话、每会话100条消息。Sites 使用 D1 持久化；独立 Node 使用默认 `server-data/` 文件目录（可由 `SERVER_WATCH_DATA_DIR` 指定）。规则模拟使用最近6个问题；API 模型发送最近20条消息及本次采样，支持流式输出/停止。每条回答记录模型、采样时间和生成状态。单会话采用比较更新和150秒占用状态，防止多标签页同时生成覆盖消息。

分析固定四部分：结论、证据、建议、告警。报告在采样或阈值更新后标为旧状态。邮件预览可复制，没有发送接口。

## 下一阶段

1. Python 采集器在被监测服务器运行 nvidia-smi、磁盘和 ps 查询，统一容量单位；补充 GPU UUID、进程开始时间、任务标签来源；移除命令中的凭据。
2. Fastify 接收带认证的上报，保存 PostgreSQL。增加服务器、采样、阈值、告警与用户权限。阈值由浏览器迁到服务端。
3. 后端调度采集与持续超阈值、恢复、冷却规则；采样超时单独判断，不把离线当正常。
4. 在 Node 服务嵌入 pi-agent SDK，将查询 GPU/进程/用户/存储/告警作为只读工具，替换 questionAdapter 和 analysisAdapter。遵循本项目协议，保留采样 ID 与固定输出校验。
5. Docker Compose + Nginx 私有部署，加入登录、审计、持久存储，再接邮件。

Sites 仅托管当前 Vue 原型与 Worker 兼容 API；独立 Fastify 是供服务器部署的可运行代码，未部署在 Sites。Worker 不能直接执行服务器脚本。采集程序、PostgreSQL 和 pi-agent 在目标服务器运行，面板通过受保护的 HTTP 接口连接。

## 模型与 API

AI 助手顶部模型选择器支持规则模拟和多个启用的服务商/模型。`模型与 API` 配置：服务商名称、OpenAI 兼容 Base URL、API Key、模型 ID、启用、默认服务商。留空 API Key 保留原密钥；显式勾选清除才删除。获取模型列表调用已保存配置的 `/models`；测试连接对已保存模型发一条短请求（可能产生供应商费用）。修改后的表单必须先保存，测试才使用新配置。Base URL 通常包含 `/v1`，服务端追加 `/chat/completions`。

API Key 用 AES-GCM 加密存储，GET 不返回明文或密文；加密主密钥通过 Sites secret `AI_CONFIG_ENCRYPTION_KEY` 管理。勿随意更换主密钥，否则已有密钥需要重新填写。独立服务需要设置同名环境变量（32字节随机值的base64）；未配置时仍可规则问答和保存无需密钥的服务商。独立后端同样只应在私有认证环境开放。

Sites 托管版只允许 HTTPS 域名，拒绝直接 IP、localhost 和 `.local`；不会跟随重定向。它不能直接连接内网 vLLM。独立 Node 后端允许内网 HTTP 地址，可部署在与 vLLM 同一网络。模型请求与密钥仅在后端处理。当前接口只提供文本补全，没有 pi-agent 工具执行；以后在 `AssistantService.chat` 的补全段接入 pi-agent 事件适配器，保留前端 delta/done/error 协议和会话存储。

本地验证：`node --import tsx server/check-assistant.ts`（内存存储与可控测试接口，不使用真实 API Key）。生产会话/密钥不包含在源代码或部署包中。Sites D1 迁移在 `drizzle/`。

目录视图、后台空间统计和未知进程的手动 AI 推测已接入独立后端，详见 [存储与推测接口](docs/STORAGE-INFERENCE.md)。
