# Server Watch 开发交接（HANDOFF）

## 2026-10-07 只读监控工具扩展（当前状态）

在 `codex/pi-agent-integration` 分支增加 `get_processes`、`get_users`、`get_storage`、`get_alerts`，与已有 `get_gpu` 共用 Pi SDK、每轮固定的服务端采样、工具事件及会话保存。工具定义集中在 `server/monitor-tools.ts`；用户汇总和告警直接复用已有规则。进程与用户支持分页，跨卡 PID 去重；存储区分普通用户可用空间与总空闲空间；暂停告警仍显示风险，禁止模型修改阈值或宣称通知已发送。

已通过 TypeScript/Vue 检查、前端构建、核心 API 检查、工具数据检查和 Pi SDK 往返/参数拒绝/历史恢复/取消检查。使用 GPU4 的 `qwen3.6-27b` 实测四个新工具自然语言调用成功，包括暂停告警仍有存储风险。测试使用独立采集与 SDK，没有修改正式阈值或会话。新增检查命令 `pnpm check:tools`，详情见 [PI-AGENT.md](docs/PI-AGENT.md)。

正式系统保持停机；本轮已更新部署文件，没有启动 `server-watch.service`。备份位于 `/data/czy/server-watch/backups/monitor-tools-20261007-120604`（含变更前文件和清单）。GPU4 模型继续运行。下一步是未知用途进程的 AI 推测、证据、缓存与重新分析；尚未实现。本轮完成的范围为四个只读监控工具。

## 2026-10-07 停机与分支交接（当前状态）

按用户要求，26-server 的 `server-watch.service` 已停止，确认 `ActiveState=inactive`、`SubState=dead`。当前面板与 `/api/*` 不提供服务；数据、模型配置和会话保留。服务仍为 enabled，重启服务器或用户会话启动时可能再次启动；本次只停止运行，没有取消自启动。

GPU4 的独立 vLLM 服务继续运行，未随监控系统停止，地址 `http://127.0.0.1:18145/v1`，模型 `qwen3.6-27b`。其原启动配置已备份，当前新增 `--enable-auto-tool-choice --tool-call-parser qwen3_xml`，模型绑定 GPU4。

本次代码在 `codex/pi-agent-integration` 分支提交，包含此前尚未提交的真实采集、阈值持久化、GPU4 模型配置、Pi SDK 接入、前端工具记录、验证脚本及构建产物。本地 Pi 官方源码位于被忽略的 `work/pi-source`，标签 `v0.87.1`；运行使用同版本 npm SDK 包，不提交克隆仓库、运行数据、私密环境文件或密钥。

部署目录：`/data/czy/server-watch/app`；持久数据：`/data/czy/server-watch/data`；私密配置：`/data/czy/server-watch/config/server-watch.env`。服务器部署目录保留现有文件；其 Git checkout 不会因本地分支提交自动切换。

恢复监控系统：

```sh
ssh 26-server -i C:/Users/10931/.ssh/id_ed25519_26 -o BatchMode=yes 'systemctl --user start server-watch.service'
```

启动后先检查 `/api/health` 为 `status=ok`、`mode=script`，`/api/assistant` 为 `engine=pi`，再访问面板。后端回滚备份为 `/data/czy/server-watch/backups/pi-20261007-005519`；GPU4 原配置备份为 `/data/czy/server-watch/backups/gpu4-pi-20261007-004826/launch.json`（含环境，权限 0600，不应输出或入库）。

停机前已通过 TypeScript/Vue 检查、前端构建、核心 API 检查、助手检查、采集器检查及 Pi SDK 工具往返/历史恢复/取消测试。真实 GPU4 工具查询和部署 API 验证通过，最近一次约 3.4 秒；前端验证会话“Pi Agent 接入验证 · GPU4”保留供恢复后查看。容量单位来自工具，工具另外提供北京时间字符串，避免模型自行换算时间。

当时的下一步为扩展进程、用户、存储查询，现已完成（见本页最新增量）；未知用途进程的 AI 推测、登录、多人隔离、邮件发送仍未实现。恢复服务需要用户后续指示。

## 2026-10-07 Pi 接入

独立后端已嵌入 Pi Agent SDK `0.87.1`，使用 SDK 原生 OpenAI 兼容适配器接入 GPU4 vLLM。首次接入 `get_gpu` 只读工具，支持真实工具记录、流式回答、历史工具上下文恢复和 HTTP 断开后取消。详细配置、源码位置和测试见 [PI-AGENT.md](docs/PI-AGENT.md)。Sites 仍使用直接文本接口。GPU4 原服务未配置工具解析器；用户授权后保留原参数新增自动工具选择与 `qwen3_xml`。

## 2026-10-07 早期增量交接

GPU4 上已有 Qwen3.6-27B 已通过现有 `/api/assistant` 接入，默认模型为 `qwen3.6-27b`；新增可选“关闭模型思考模式”配置，详见 [GPU4-MODEL.md](docs/GPU4-MODEL.md)。模型列表、连接测试与一次真实采样流式回答已通过；当时 pi-agent 和真实工具调用尚未实现，已由上面的增量实现。

26-server 已部署真实只读采集、15 秒自动刷新与服务端阈值保存；当前停机及分支状态以上方最新交接为准。下文 1–10 节为 `c8f1cf6` 部署前基线记录，其中模拟监控及浏览器阈值限制已由独立服务的新实现扩展。监控实现、运行配置、测试和边界参见 [REAL-MONITORING.md](docs/REAL-MONITORING.md)。Sites 未更新，仍保留模拟模式；登录、多人隔离和邮件未实现；Pi 接入以本页最新增量为准。

更新日期：2026-10-06（北京时间）  
代码基线：GitHub `main`，提交 `c94e128dc61d4e69361c51c13ca785ab217e91a7`。  
本文描述当前已实现行为；“后续开发”中的事项尚未完成。

## 1. 项目目标与已确认约束

构建服务器监测面板，查看 GPU、存储、用户与进程归属，设置告警阈值，并通过 Agent 回答监控问题、输出固定格式分析。当前阶段使用可替换模拟数据，保留真实采集和 pi-agent 接口。

产品约束：

- 使用 Vue 3 + TypeScript + Element Plus；采用若依式固定后台布局，参考宝塔的操作方式。
- 保持紧凑表格、固定工具栏、可收起侧栏；避免宣传式大卡片和过多“AI”装饰。
- 顶部原有“提问”按钮必须保留；独立“AI 助手”菜单提供完整会话和模型配置。
- 两个提问入口共用会话、模型选择和输入草稿。
- 用户点击发送后才回答；GPU、告警和分析快捷入口只预填问题，不自动请求，不主动追问。
- 告警是否触发由确定性规则判断，阈值由用户设置；模型不能自行改变阈值。
- 分析固定采用“结论、证据、建议、告警”四部分。
- 当前不执行终止进程、删除文件、修改服务器配置等操作。
- 当前没有迁移到 mdserver-web；pi-web 用于交互参考，不是已集成的前端依赖。

## 2. 当前功能与完成状态

| 模块 | 已实现 | 当前边界 |
| --- | --- | --- |
| 资源监控 | 8 张模拟 A800 GPU；显存、利用率、温度；存储容量；模拟场景；手动刷新 | 不连接真实服务器，无后台采集 |
| 用户与进程 | 用户汇总、GPU/PID/任务/命令明细；筛选、搜索和显存排序 | 用户、命令和任务标签均为模拟数据 |
| GPU 详情 | 复制 PID/命令；跳转至该 GPU 的进程列表；快速提问；进入 AI 助手分析 | 只展示与预填，不自动执行命令 |
| 阈值设置 | 草稿与生效值分开；未保存提示；保存、恢复默认、撤销；告警启停 | 阈值保存在当前浏览器，尚未服务端同步 |
| 告警预览 | 当前采样告警、级别、提问入口、邮件正文预览及复制 | 没有告警历史、持续时间、冷却、恢复通知或邮件发送 |
| AI 助手 | 会话新建、搜索、重命名、删除；历史采样标识；流式文本；停止生成 | 尚未接入 pi-agent 工具调用 |
| 模型与 API | 多服务商/模型；默认服务商；启停；保存密钥；获取模型列表；连接测试 | 仅 OpenAI 兼容文本接口；真实供应商需用户配置并验证 |

达到阈值不代表任务异常。“低于阈值”也不代表进程运行正常。

## 3. 架构和主要代码入口

| 路径 | 用途 |
| --- | --- |
| `web/src/App.vue` | Vue 管理面板、资源/进程/告警/阈值、导航和快捷提问入口 |
| `web/src/AssistantPanel.vue` | 完整会话页和快速提问抽屉共用的界面 |
| `web/src/ModelSettings.vue` | 服务商、API、模型管理弹窗 |
| `web/src/assistant.ts` | 两个入口共用的响应式会话状态及流式客户端 |
| `web/src/api.ts` | 原监控、规则分析和规则问答请求 |
| `web/src/NavIcon.vue`、`style.css`、`clipboard.ts` | 导航、布局和 HTTP/HTTPS 复制兼容 |
| `contracts/monitoring.ts` | Snapshot 协议、模拟数据、阈值校验、告警和规则分析 |
| `contracts/questions.ts` | 用户统计、规则问答和固定格式模拟分析 |
| `contracts/display-state.ts` | 采样过期、失败和资源状态 |
| `contracts/assistant.ts` | 服务商、会话、消息协议 |
| `lib/adapters.ts` | MonitorAdapter、AnalysisAdapter、QuestionAdapter |
| `lib/assistant-service.ts` | API 配置、密钥加密、模型发现、连接测试、流式问答、会话管理 |
| `lib/assistant-db.ts` | Sites D1 存储适配器 |
| `server/assistant-repository.ts` | 独立 Node 文件存储适配器 |
| `server/app.ts`、`server/index.ts` | 独立 Fastify API 和 Vue 静态资源服务 |
| `app/api/` | Sites Worker API，与 Node 后端复用协议及业务逻辑 |
| `app/page.tsx` | Sites 入口重定向到 `/console/index.html` |
| `db/schema.ts`、`drizzle/` | D1 表结构和迁移 |
| `public/console/` | 已提交的 Vue 构建产物，修改前端后需重新生成 |

仓库仍含 Sites 的 React/Vinext 托管壳和早期组件。当前实际产品界面位于 `web/`，不是 React 页面。不要因看到 React 依赖就把 UI 改回 React，也不要顺手删除托管所需文件。

### 两种运行环境

**Sites 托管版：** Vue 静态页面 + Worker API + D1。独立 Fastify 进程没有运行在 Sites 内。Sites 不能直接执行服务器脚本或连接内网 vLLM。

**独立部署版：** Fastify 同源提供 API 与 Vue 静态页面。会话和服务商保存在文件目录。它允许配置内网 HTTP 模型地址，但尚无应用登录与用户权限，默认只监听本机。

## 4. 开发启动和验证

在仓库根目录运行，使用 Node 22+ 和 `package.json` 指定的 pnpm 版本；保留 lockfile。

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm server:check
pnpm web:build
pnpm server:dev
```

打开 `http://127.0.0.1:3000/`。修改 Vue 后需重新运行 `pnpm web:build` 并刷新；Fastify 开发命令会监听后端变更。仅修改 Vue 源码不会更新当前由 Node 服务提供的静态页面。

其他命令：

```bash
pnpm server:start
pnpm check:core
node --import tsx server/check-assistant.ts
pnpm exec tsc --noEmit
```

`pnpm build` 是 Sites/Vinext 构建入口；独立部署需要的前端构建是 `pnpm web:build`。不要把两者混淆。

| 环境变量 | 用途 |
| --- | --- |
| `PORT` | 独立服务端口，默认 3000 |
| `HOST` | 独立服务监听地址，默认 127.0.0.1 |
| `SERVER_WATCH_DATA_DIR` | 独立服务数据目录，默认 `server-data/` |
| `AI_CONFIG_ENCRYPTION_KEY` | 32 字节随机值的 base64 编码，用于 AES-GCM 加密 API Key |

没有加密主密钥时可以使用规则模拟和无需密钥的服务商；保存非空 API Key 需要主密钥。主密钥应生成一次、持久保存于部署系统的 Secret 并注入进程，不能每次启动重新生成。当前 Node 启动脚本没有自动读取 `.env` 的逻辑。

`server-data/`、`.env*`、`.dev.vars`、依赖及本地运行状态不提交到 GitHub。备份独立部署数据时也要妥善保留加密主密钥，否则已有 API Key 无法解密。

## 5. 协议和业务规则

### 监控数据

`Snapshot.schemaVersion = '1.0'`；以 `contracts/monitoring.ts` 的 Zod 校验为准。

- GPU 显存和存储容量当前按 GB 展示，真实采集必须统一 GiB/GB 转换。
- 进程记录：`{gpuId,pid,user,command,task,memoryUsed}`。
- 同一 PID 跨多张卡可产生多条分配，进程数按 PID 去重，显存按 GPU 分配累加。
- 同一 PID-GPU 组合不可重复，GPU ID 必须存在。
- GPU 利用率是整卡指标，不能推算单进程利用率。
- 真实显存可能包含驱动或其他未归属开销，不应强行全部分摊给进程。
- 真实“任务用途”允许未知，后续要区分人工标签与命令推断，不能把猜测当事实。

### 阈值和采样状态

默认阈值：GPU 利用率 90%、显存 90%、存储 85%、温度 80°C。使用率范围 1–100%，温度范围 30–110°C；当前值 `>=` 阈值即触发。

百分比 `>=95%` 或温度达到阈值以上至少 5°C 标为严重，否则为警告。暂停告警只使告警列表为空，资源页仍独立对照阈值显示风险。

- 草稿未保存时不影响生效规则。
- 采样年龄达到 2 分钟标为过期，每 15 秒检查一次。
- 刷新失败保留旧采样，显示失败状态，不把旧值解释为当前事实。
- 当前只判断单次采样，没有持续超阈值和冷却窗口。

### API 入口

| 地址 | 当前行为 |
| --- | --- |
| `GET /api/monitor` | 返回模拟 Snapshot；接受 scenario、tick |
| `POST /api/analyze` | 规则分析；输入 snapshot、thresholds |
| `POST /api/chat` | 原规则 QuestionAdapter；不是新的 AI 会话接口 |
| `GET /api/assistant` | 返回服务商配置状态及会话；不返回 API Key 明文或密文 |
| `POST /api/assistant` | 新 AI 助手业务接口 |
| `POST /api/users`、`GET /api/health` | 仅独立 Fastify 提供 |

`/api/assistant` 的 action：
`saveProvider`、`deleteProvider`、`models`、`test`、`createSession`、`renameSession`、`deleteSession`、`chat`。

`chat` 输入包括 sessionId、providerId、model，以及 question/snapshot/thresholds/history；`providerId: "mock"` 使用规则模拟。输出为 NDJSON 事件流：

- `delta`：追加文本。
- `error`：生成或保存失败提示。
- `done`：服务端保存后的会话。

后续 pi-agent 接入应继续提供这组前端事件；增加真实工具事件时再扩展协议，不能用模拟日志伪装工具执行。

## 6. 会话、模型与密钥

- 最多 100 个会话，每个会话最多 100 条消息；删除会话不可恢复。
- API 模型使用最近 20 条消息和本次监控上下文；模拟问答使用最近 6 个问题。
- 每条回答保存实际模型标识、采样 ID、采样时间和完成/停止/错误状态。
- 同一会话采用比较更新和 150 秒占用状态，防止并发生成覆盖消息。
- 模型请求超时为 120 秒；输出文本上限为 200,000 字符。
- 服务商模型 ID 必须与接口一致；模型选择改变后续请求，不重写历史回答。
- 默认服务商用于初次加载选择；会话消息分别记录各轮使用的模型。
- Base URL 通常以 `/v1` 结尾；后端追加 `/models` 或 `/chat/completions`。
- 获取模型列表和连接测试使用**已保存配置**，编辑表单后需要先保存。
- 连接测试实际发送短请求，可能产生模型服务费用。
- API Key 留空保留旧值，显式勾选清除才删除；密钥使用 AES-GCM 存储。
- Sites 版仅允许 HTTPS 域名，拒绝直接 IP、localhost、`.local` 和重定向；独立 Node 版允许内网 HTTP 地址。

当前文本 API 调用已经实现，但没有用户真实供应商凭据，因此不能声称所有供应商或特定本地模型均完成联调。工具调用、推理字段、结构化输出和多模态兼容需要后续逐一验证。

## 7. 部署与代码同步关系

- GitHub 仓库：<https://github.com/Milo-Chen-maker/server-watch>，按用户明确授权公开。
- 当前 Sites 面板：<https://server-watch-agent.b4nysj29t6.chatgpt.site>，最后一次部署保持 owner-only 私有访问。
- GitHub 导入代码对应 Sites 第 6 版；Sites 源码提交为 `cd0ba2c35172deeb33d7719583b398dfb27c3704`，与 GitHub 导入提交不同，不应互换。
- `.openai/hosting.json` 绑定既有 Sites 项目，D1 逻辑绑定为 `DB`，R2 未启用。
- D1 表为 `ai_providers` 和 `ai_sessions`；现有迁移在 `drizzle/0000_premium_drax.sql`。
- Sites 生产会话和密钥没有包含在 GitHub 源码中。
- 当前没有设置 GitHub push 自动更新 Sites 的 CI；提交 GitHub 不等于发布网站。
- 本次 handoff 只更新 GitHub 文档，不修改线上功能或访问范围。
- 后续改动应用到 Sites 时，先读取既有项目并同步最新源代码，重新生成 Vue 产物、构建、保存版本并私有部署；不得新建替代项目或改为公开。
- 已应用的 D1 迁移不可改写，新增 schema 变更应追加迁移。

## 8. 已验证事项与尚待验证事项

此前功能开发阶段已通过：

- Vue 类型检查和构建、Node 类型检查、根 TypeScript 检查。
- `check:core`：API 输入拒绝、阈值启停、GPU/进程显存一致、跨卡 PID 去重、用户汇总、规则问答、静态页面、过期/失败采样状态。
- `check-assistant.ts`：API Key 加密及读取遮蔽、留空保留/显式清除、地址校验、模型发现、连接测试、流式回答、停止/错误状态、并发生成保护及会话 CRUD。使用内存存储和可控接口，不是线上供应商测试。
- 浏览器：侧栏收起、GPU 到进程筛选、复制 PID/命令、阈值草稿/生效分离、快速提问继续到 AI 页、服务商保存与模型选择、会话刷新恢复和重命名、只预填不自动发送、固定四部分模拟分析。
- HTTP 预览下临时消息 ID 和复制功能的兼容修复。

本次为文档提交，没有重新执行上述功能测试。独立服务器部署、真实 GPU 采集、内网 vLLM、真实供应商、pi-agent 和邮件仍需联调验证。

## 9. 后续开发顺序与验收条件

### 第一阶段：真实采集和独立私有部署

1. Python 采集器读取 GPU、磁盘和进程信息；补充 GPU UUID、进程开始时间和任务标签来源，清理命令中的凭据。
2. 在固定 Snapshot 协议后实现 MonitorAdapter；采集和接收接口增加认证。
3. 增加服务器、采样和阈值的服务端持久化；当前“用户统计”指 Linux 进程所属用户，不是面板登录用户。
4. 完成应用登录、服务器访问权限和私有反向代理，不能只把 HOST 改为 0.0.0.0 就当完成部署。
5. 对照 nvidia-smi、磁盘工具及进程命令验证数值、单位、跨卡归属和过期状态。

验收：面板可查看真实服务器，刷新与过期状态准确；阈值跨设备保存；未经授权的访问被拒绝。

### 第二阶段：pi-agent 与本地模型

1. 在 Node 后端引入并固定经过验证的 pi-agent SDK 版本。
2. 在 `AssistantService.chat` 的模型补全段接入事件适配器；同步规划原 QuestionAdapter/AnalysisAdapter，避免两个问答入口走不同后端。
3. 提供查询 GPU、进程、用户、存储和告警的只读工具；真实工具从后端采样库取数，不仅信任客户端提交的 Snapshot。
4. 连接用户本地 vLLM 的 OpenAI 兼容接口，分别验证多轮对话、流式停止、工具调用和最终回答。
5. 固定格式结果增加 schema 校验；普通文本回答也保留模型和采样出处。

验收：两个提问入口一致；仅用户发送后运行；真实工具记录可核查；模型不会未经授权执行服务器变更。

### 第三阶段：告警与运维完善

1. 持续时间、恢复和冷却规则；采集离线单独告警。
2. 告警历史、后台调度、邮件发送、去重和投递状态。
3. 持久数据库（原计划 PostgreSQL）、备份、审计、部署配置及 Docker Compose。
4. 真实资源利用趋势与性能测试。

验收：重复采样不会重复轰炸邮件，恢复可追踪，进程高负载与故障判断明确区分。

## 10. 接手开发时的注意事项

- 先读本文件、README 和当前协议，确认 GitHub main 是否已新增提交。
- 先使用既有适配器，保持 Vue/Element Plus 方向与当前固定布局。
- 会话和服务商当前面向单个私有面板所有者，没有多用户数据隔离；扩大共享范围前必须补上鉴权与隔离。
- API Key 永远不能放进浏览器持久存储、源代码、日志或公开仓库。
- 监控命令可能含敏感参数，真实采集进入模型上下文前必须脱敏。
- 不把模拟分析、模拟任务标签或邮件预览表述为真实执行结果。
- 当前没有终端、任意 shell 执行、进程终止和文件删除功能；新增这类能力需要单独设计权限和确认流程。
