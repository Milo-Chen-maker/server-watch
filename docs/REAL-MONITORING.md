# 26-server 真实监控接入

部署日期：2026-10-07（北京时间）。部署路径仍为 `/data/czy/server-watch`。

## 已运行能力

- 使用现有 NVIDIA `nvidia-smi` CSV 查询，Python 标准库读取进程身份，`df` 查询磁盘；无需新装 GPU 驱动、模型或 exporter。
- 单个 Fastify 服务每 15 秒采集一次，`GET /api/monitor` 读取缓存；多个页面不会触发重复硬件查询。
- 返回 `source: script`、真实主机名及采样时间，GPU UUID、温度、功耗、整卡利用率、显存、GPU 计算进程 PID、Linux 用户及进程启动时间。
- 显存与磁盘统一为 GiB；磁盘 `available` 为普通用户可用空间，保留文件系统预留空间，不使用 total-used 伪装成可用空间。使用率仍按 used/total 计算，因此可能与 df 基于可用空间的 Use% 不同。
- 一个 PID 在多张 GPU 上的分配分别保留，汇总进程数去重；未归属显存不强行分摊。
- 任务用途为“未知”，taskSource=unknown；命令仅保留可执行文件名和选项名称，所有参数值及位置参数均脱敏，避免未知凭据参数进入页面、采样文件和模型上下文。
- 真实采集失败时 API 返回 503，健康状态为 degraded。保留旧文件及旧时间，不回退模拟数据；浏览器保留旧采样并显示失败/过期。
- 最新采样与最多 240 个真实采样历史点写入 `data/snapshot.json`，文件原子替换，权限 0600。
- `GET/POST /api/thresholds` 提供服务器级阈值，保存在 `data/thresholds.json`，权限 0600；各设备刷新后同步，未保存草稿保持独立。
- 面板每 15 秒自动刷新真实数据；隐藏模拟场景选择器，保留手动刷新和两个提问入口。
- 分析和规则问答现在标记为 rules；模型接入与 pi-agent 状态不变。

## 环境配置

服务器 `config/server-watch.env` 已增加：

```text
SERVER_WATCH_MONITOR_MODE=script
SERVER_WATCH_PYTHON=/usr/bin/python3
```

默认不设置上述 mode 时继续使用模拟数据，适用于现有开发测试及 Sites 版本。Sites 没有新的阈值端点，前端在明确的 404 响应后仍使用浏览器阈值。读取服务器阈值失败时不允许假装保存成功。

仍通过 SSH 隧道私有访问，监听 `127.0.0.1:3030`。没有新增公开采集端点或任意命令执行入口。

## 验证结果

- Linux 采集器测试：参数脱敏、MiB/bytes 转 GiB、跨卡 PID、未知任务来源、不可用指标拒绝，共 3 个测试通过。
- Node 采集服务测试：缓存采样时间不刷新、失败不伪造数据、阈值跨实例保存及非法输入拒绝通过。
- Vue/Node 类型检查、前端构建、check:core、check-assistant 均通过。
- 实际服务核验：8 张 A800、8 条 GPU 进程分配、3 位 Linux 用户、6 个磁盘挂载点；GPU UUID/容量与 nvidia-smi 一致，核验时显存差值均为 0 MiB。
- 阈值临时修改后重启服务仍保存，测试后恢复原值；非法阈值返回 400；定时采集产生了新的采样 ID 和时间。
- 浏览器已检查资源、用户/进程和设置页面：真实主机、GiB、脱敏命令、未知用途及服务端阈值说明正确。
- 已保留旧源码和环境配置备份：`/data/czy/server-watch/backups/20261007-000744`。备份包含加密主密钥，不应公开或提交源码仓库。

## 边界

此阶段查询 NVIDIA 计算进程；并非服务器全部进程清单，未覆盖图形进程及特殊 MIG 场景。GPU 指标和进程查询依次读取，快速变化负载可能有采样差异。无法读取/已退出的进程显示未知身份或不可读取；无法获取必要 GPU 数值时整体采集失败，不把 N/A 当作零。

当前只有单服务器阈值及有限历史点，尚无告警历史、后台邮件、持续时间/冷却、应用登录、多用户隔离、PostgreSQL 或 pi-agent 工具。后台采集不依赖浏览器打开，告警判断仍在用户请求/页面规则中。

现成接口参考：[NVIDIA nvidia-smi](https://docs.nvidia.com/deploy/nvidia-smi/index.html)、[NVIDIA DCGM Exporter](https://github.com/NVIDIA/dcgm-exporter)。本次未发现常用 9400/9100 端口监听及同名 systemd exporter 服务，不能据此排除其他端口或容器内服务。
