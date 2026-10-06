# 26-server 部署可行性评估

评估日期：2026-10-06（北京时间）。本次仅阅读代码、文档及 SSH 只读检查，没有安装软件、启动服务、修改服务器配置或发送模型推理请求。

## 结论

- **私有原型部署：有条件可行。** 使用独立 Fastify + Vue 路径，补齐 Node/pnpm、持久目录和服务管理即可运行当前模拟监控及 AI 会话功能。
- **真实单机监控：硬件与读取权限可行，但代码尚未实现。** 必须增加采集器、真实 MonitorAdapter、采样缓存和可靠的失败状态，不能将部署成功视为真实监控上线。
- **多人生产使用：当前不满足。** 缺少登录、权限和数据隔离；阈值仅在浏览器保存，后台告警、邮件及 pi-agent 尚未实现。

## 代码与 handoff 核查

本地 HEAD 与远端 main 均为 `c8f1cf6740fa98f836303ac87abff827cba4f36d`，最近提交为 handoff 文档。HANDOFF.md 中的 `c94e128` 是功能实现基线，不是当前 main HEAD。

已确认：

- `server/index.ts` 默认监听 `127.0.0.1:3000`，没有自动加载 `.env`。
- `server/app.ts` 提供 API 和 `public/console` 静态页面，根路径跳转 `/console/index.html`。
- `lib/adapters.ts` 明确返回模拟采样；`/api/health` 明确为 `mode: mock`。
- Node 会话与服务商数据使用文件存储，不依赖 Sites D1 或 PostgreSQL。
- `SERVER_WATCH_DATA_DIR` 控制存储目录；非空 API Key 需要稳定的 `AI_CONFIG_ENCRYPTION_KEY`。
- 独立版允许内网 HTTP 模型地址；所有会话及服务商为一个共享所有者范围，没有身份校验。
- 文件会话比较更新的队列在进程内；当前部署应限制为单个 Node 实例，不能直接用多进程或多副本共享同一数据目录。
- `server:start` 使用 `node --import tsx`，而 tsx 在 devDependencies。不能简单执行仅安装生产依赖后启动；需保留必要依赖或先设计编译产物。
- 独立前端构建入口为 `pnpm web:build`，`pnpm build` 属于 Sites/Vinext 构建。
- 仓库没有独立部署的 Dockerfile、Compose 或 systemd 配置。

本地没有 node_modules，本次没有重新安装依赖或运行类型检查、构建和测试。handoff 中之前通过的测试不能替代服务器部署验收。

## 服务器实测

连接：SSH 别名 `26-server`，地址 `172.18.132.26`，账户 `wangbin`，主机 `hr-A800-132-26`。

| 检查项 | 实测 | 部署含义 |
| --- | --- | --- |
| 系统 | Ubuntu 22.04.5 LTS，x86_64，systemd 249 | 可采用独立 Node 服务 |
| CPU / 内存 | 128 逻辑 CPU；503 GiB 总内存、约 436 GiB available | 面板与轻量采集资源充足；本次未做负载测试 |
| GPU | 8 张 NVIDIA A800 80GB PCIe | 实际设备类型与原型场景相符，数值仍需真实采集 |
| 读取能力 | nvidia-smi GPU/计算进程查询成功；ps 可读跨用户 PID、用户名与进程名称；/proc 未显示 hidepid | 基础采集可用；完整命令、容器归属与特殊进程仍需逐项验证 |
| 根分区 /home | 1.8T，总使用率 98%，可用约 38G | 依赖缓存、日志和采样库应避开这里 |
| /data1 | 71T，总使用率 20%，可用约 54T；wangbin 可写 | 推荐在其下建立权限收紧的专用应用目录 |
| /ssd_data | 可用约 6.6T；wangbin 不可写 | 未调整权限前不能选作部署目录 |
| /data | 使用率 96%，可用约 1.9T；wangbin 可写 | 不作为首选 |
| 运行时 | 非交互 SSH PATH 中未找到 node、npm、pnpm；Python 3.10.12 可用 | 需配置符合 package.json 的 Node >=22.13.0、pnpm 11.25.0；不代表其他隐藏目录不存在 Node |
| Docker | 客户端 20.10.10；daemon 活跃，但账户无 socket 访问权限 | Docker 路径需管理员协助；本次无法核查容器清单及现有代理 |
| 端口 | 80/443 已监听；3000/3030 检查时未监听 | 可选 127.0.0.1:3030，部署时复查；不能抢占现有 80/443 |
| 服务管理 | user manager 运行；Linger=no | 长期服务需系统级 unit，或用户 unit 配合 linger |
| 下载连通性 | GitHub 仓库及 npm registry HTTP 200；git ls-remote 成功 | 初步可获取源码和依赖；未证明完整 pnpm 安装及所有下载域名可用 |
| 模型 | 8001/8006/8111 的 /v1/models 均返回 404 | 这些端口不能认定为可用模型入口；未完成模型联调 |

Swap 使用约 45/49 GiB；仅此不能判定当前内存压力，available 内存仍很高。真实采集可将其作为后续观测项。

SSH 配置的 IdentityFile 为 `/Users/10931/.ssh/id_ed25519_26`，Windows OpenSSH 无法找到该路径。本次通过显式指定 `C:/Users/10931/.ssh/id_ed25519_26` 成功连接，没有修改 SSH 配置。

## 建议部署路线

第一步：私有原型验收。

1. 使用 `/data1` 下专用目录保存源码、Node/pnpm、依赖缓存和数据；目录权限仅允许服务账户访问。示例路径 `/data1/wangbin/server-watch` 尚未创建，其父目录与最终布局需部署时确认。
2. 固定 Node 与 pnpm 版本，使用 lockfile 安装；执行 web:check、server:check、web:build、check:core 和 check-assistant。
3. 单个 Fastify 实例绑定 `127.0.0.1:3030`，设置绝对 WorkingDirectory 和 SERVER_WATCH_DATA_DIR；通过服务管理器注入主密钥，妥善备份数据与密钥。
4. 初期通过 SSH 隧道访问，无需改动现有 80/443。若长期提供浏览器访问，再核查现有代理归属，增加私有 HTTPS、身份认证及访问控制。
5. 配置自动重启、启动恢复、日志轮转和磁盘上限。用户 unit 需启用 linger；系统级 unit 需管理员配置。
6. 私有 SSH 访问适用于单所有者验证。多人访问必须补身份和隔离；仅增加代理密码不会让现有共享会话变成独立用户数据。

第二步：真实监控验收。

- 增加只读 Python 采集器，以受控频率执行 nvidia-smi、磁盘与进程查询，缓存最近成功采样。
- 统一容量单位，保留 GPU UUID、进程开始时间和未知任务标签，脱敏命令中的凭据；覆盖跨 GPU PID 与未归属显存。
- 替换 MonitorAdapter，明确 source 和真实 capturedAt。采集失败时保留旧时间及失败状态，禁止以新时间包装旧值。
- 同机优先用受权限保护的本地文件或本机认证接口传递采样；若后续采用网络上报，需认证和输入校验。
- 持久化阈值及采样；先做有保留期限的数据存储，再增加后台告警及 PostgreSQL，避免初次部署一次性扩大范围。

第三步：模型与 Agent 联调。

- 确认实际模型 Base URL、模型 ID、鉴权和流式格式。首先验证当前 OpenAI 兼容文本接口，再考虑 pi-agent 与只读工具。
- 不把 GPU 进程名中出现 vLLM 视作模型 API 可用的证明，不为面板启动新的 GPU 模型占用训练资源。
- 验证流式停止是否实际终止上游、并发会话保护、请求上限和错误恢复；当前 Node 路由未传入请求取消 signal，这一行为必须实测。
- 如采用 Nginx，对 NDJSON 流式接口关闭代理响应缓冲，并按应用 120 秒模型超时设置代理读取超时。

## 验收门槛

原型：健康检查明确为 mock、页面及所有 API 正常、重启后数据恢复、密钥不进入浏览器或日志、服务能退出 SSH 后及重启后继续运行、现有服务不受影响。

真实监控：面板与命令行采样一致，磁盘挂载和用户归属正确，失败/过期不伪装为正常，阈值跨设备一致，未经授权不能访问，数据与主密钥可恢复。

未验证：完整依赖安装、目标 Node 执行、反向代理所有者及配置、所有进程完整命令读取、真实供应商与 pi-agent、负载与备份恢复。上述事项是下一步验收任务。

参考：[systemd linger](https://www.freedesktop.org/software/systemd/man/252/loginctl.html)、[Nginx 代理缓冲与超时](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[Node 22 全局 API](https://nodejs.org/download/release/v22.17.0/docs/api/globals.html)。
