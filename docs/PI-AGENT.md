# Pi Agent 后端接入

独立 Fastify 后端嵌入 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`，固定为 `0.87.1`；`typebox` 固定为 `1.3.27`。保留仓库七天发布隔离策略。最低 Node 版本为 22.19.0，26-server 使用 22.23.3。

本地官方源码位于 `work/pi-source`，检出标签 `v0.87.1`，提交 `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`。该目录被 Git 忽略，供查阅和调试。项目运行使用 npm SDK 发布包，不依赖这个 checkout，也没有修改 Pi 内核。

## 调用流程

1. 前端向现有 `/api/assistant` 发送 `chat`。
2. 后端读取已保存会话、服务商和密钥；使用监控服务的最新采样及服务端阈值覆盖客户端上下文，每轮固定一次采样。
3. 创建请求独立的 Pi Agent 和 Models 实例，通过 SDK 自带 `openAICompletionsApi` 调用 OpenAI 兼容服务。无密钥的本地服务使用 SDK 所需的非秘密占位值 `server-watch-local`。
4. Pi 决定调用监控工具，服务端校验参数并返回对应数据、来源、采样时间与容量单位。工具只查询本轮固定采样，没有 shell、SSH 或写操作能力。
5. Pi 把工具结果交给模型继续生成；工具事件与文本增量通过 NDJSON 发送到前端。
6. 保存回答、工具记录和完整 SDK 对话块；后续提问按完整轮次恢复上下文。失败和取消的轮次不进入下一轮模型上下文。

每轮 120 秒、8 次工具执行、最多 9 个模型回合，每次输出最多 2048 tokens；会话最多 100 条展示消息。历史最多保留最近六个完整轮次并限制总字符数，工具调用与结果成对保留。点击停止或浏览器断开连接会中止 SDK 请求，记录 `stopped` 并解除会话忙状态。

`SERVER_WATCH_ASSISTANT_ENGINE=pi` 启用 Pi；`direct` 显式使用原有直接文本接口。独立服务默认 Pi，Sites Worker 保留直接接口。规则模拟选项继续走确定性规则。

## GPU4 vLLM

地址 `http://127.0.0.1:18145/v1`，模型 `qwen3.6-27b`。Pi 使用原生 OpenAI 兼容协议与工具事件，不实现替代工具解析器。

真实调用发现原服务未启用工具解析器，返回 HTTP 400，指出缺少 `--enable-auto-tool-choice` 和 `--tool-call-parser`。用户授权重启后，在原启动参数上新增：

```text
--enable-auto-tool-choice --tool-call-parser qwen3_xml
```

模型、CUDA GPU4 绑定、端口和其他启动参数保持原配置。旧启动参数和环境保存在 `/data/czy/server-watch/backups/gpu4-pi-*/launch.json`，权限 0600；其中含环境配置，不能提交或输出。模型日志 `/data/czy/server-watch/gpu4-pi.log`，PID 文件 `/data/czy/server-watch/gpu4-pi.pid`。运行日志显示 vLLM `0.26.0`，环境中旧 dist-info 的 `0.11.0` 不代表实际加载的代码版本。

服务商的“关闭模型思考模式”通过 SDK 的 `onPayload` 设置 `chat_template_kwargs.enable_thinking=false`。

## 验证

```sh
pnpm server:check
pnpm web:check
pnpm web:build
pnpm check:core
pnpm check:pi
pnpm check:tools
node --import tsx server/check-assistant.ts
node --import tsx server/check-monitor.ts
python3 server/check_collector.py
```

`check:pi` 使用真实 Pi SDK 和本地模拟 OpenAI SSE 服务，覆盖：实际工具往返、拒绝伪造客户端采样和阈值、后续对话恢复工具结果、未知工具与不存在的 GPU、循环调用上限、取消、会话恢复、真实 HTTP 断开连接后保存停止状态。

当前提供五个只读工具，定义位于 `server/monitor-tools.ts`：

| 工具 | 参数与用途 |
| --- | --- |
| `get_gpu` | `gpuId`；GPU 指标、阈值和显存最高的前 20 条进程摘要，超过时明确标记截断 |
| `get_processes` | 可选 `gpuId`、`user`、`pid`、`offset`、`limit`；条件组合筛选，按显存降序分页，PID 去重总数与 GPU 占用记录数分别返回 |
| `get_users` | 可选 `user`、`offset`、`limit`；复用面板的用户显存汇总和 PID 去重规则，按已归属显存排名 |
| `get_storage` | 可选 `mount`；挂载点容量、普通用户可用空间、空闲空间和阈值状态，不读取文件或目录 |
| `get_alerts` | 可选 `resource`、`severity`；复用现有告警规则，分别返回实际告警 `alerts` 与忽略暂停开关的资源风险 `risks` |

进程、用户分页默认 20 条、最多 100 条，附带 `total`、`returned`、`hasMore`。未提供进程数据时标记 `dataAvailable=false`，与采样提供空列表区分。跨卡相同 PID 的显存按 GPU 记录相加，进程数对 PID 去重。`get_storage.available` 与 `free=total-used` 可能因保留空间而不同。告警暂停时 `alerts` 为空，`risks` 仍可能有值；不发送通知、不修改阈值。

新增 `check:tools` 覆盖组合筛选、分页、用户排名、跨卡 PID 去重、磁盘保留空间、暂停告警、缺少进程数据、非法资源与取消。`check:pi` 额外覆盖四个新工具的完整 SDK 工具往返、非法参数和额外字段拒绝。

未知任务的 AI 推测、推测结果缓存和重新分析仍待下一阶段实现。进程命令继续过滤参数值，只移除显示中的“已脱敏”标记。

2026-10-07 四个新工具已使用真实 GPU4 模型验证自然语言选择与工具结果：用户排名约 3.4 秒，进程查询约 3.7 秒，存储约 9.4 秒，暂停告警约 8.6 秒。测试独立运行采集器和 Pi SDK，未启动正式 Server Watch 服务，也未修改正式阈值或会话。

四个新工具的部署已同步到 `/data/czy/server-watch/app`，正式服务仍停止。部署前备份 `/data/czy/server-watch/backups/monitor-tools-20261007-120604`，包含 `source.tar` 和文件清单 `manifest.json`。运行依赖未变化，只新增检查脚本和更新前端构建产物。

26-server 实际验证：Pi → vLLM → get_gpu → 回答，工具查询约 3.3 秒，部署后的 API 往返约 4.6 秒；后续提问恢复工具上下文成功，伪造的客户端采样被服务端采样覆盖。后端回滚备份 `/data/czy/server-watch/backups/pi-20261007-005519`，GPU4 原启动配置备份 `/data/czy/server-watch/backups/gpu4-pi-20261007-004826`。

## 进程用途推测

已新增手动进程推测入口，复用 Pi SDK 和 `get_processes`，返回严格 JSON 与服务端证据，带 24 小时身份缓存。目录统计由独立后台扫描服务完成。接口和限制见 [STORAGE-INFERENCE.md](STORAGE-INFERENCE.md)。
