# 26-server 已部署实例

部署日期：2026-10-06（北京时间）。按用户指定使用 `/data/czy`。

## 当前状态

- 根目录：`/data/czy/server-watch`，权限 0700；总占用约 1.7G。
- 源码：`app/`，GitHub main 提交 `c8f1cf6740fa98f836303ac87abff827cba4f36d`。
- 运行时：Node `v22.23.3`、pnpm `11.25.0`，位于 `runtime/`；Node 官方下载校验和已验证。
- 单个 Fastify 服务监听 `127.0.0.1:3030`；没有改动现有 80/443 服务。
- 数据：`/data/czy/server-watch/data`。
- 环境配置及加密主密钥：`/data/czy/server-watch/config/server-watch.env`，权限 0600。主密钥生成一次并持久保存，本文不包含其值。
- 服务：wangbin 的 `server-watch.service`，enabled/active；Linger 已从 no 改为 yes。
- unit：`/home/wangbin/.config/systemd/user/server-watch.service`。
- 限额：MemoryMax=512M、CPUQuota=100%、TasksMax=128；异常退出后等待 5 秒重启；journal 日志限制写入频率。
- 验证后的进程内存约 39 MiB，NRestarts=0。

当前为模拟监控原型，健康接口返回 `{"status":"ok","mode":"mock"}`。未接真实采集、真实模型、pi-agent 或邮件，未增加多人登录或隔离。`/data` 使用率 96%，后续需关注容量。

## 访问

Windows 本机运行以下命令保持 SSH 隧道，然后浏览器打开 `http://127.0.0.1:3030/`：

```powershell
ssh 26-server -i C:/Users/10931/.ssh/id_ed25519_26 -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -N -L 127.0.0.1:3030:127.0.0.1:3030
```

自动启动本机隐藏窗口隧道的操作被执行策略拒绝，返回理由为 blocked by policy，因此本次未建立本机隧道；上述命令需手动运行。服务器服务已独立运行，不依赖该隧道存活。

## 运维

在服务器上以 wangbin 执行：

```bash
systemctl --user status server-watch.service
systemctl --user restart server-watch.service
systemctl --user stop server-watch.service
journalctl --user -u server-watch.service -n 100 --no-pager
```

备份需同时保留 `data/` 与 `config/server-watch.env` 并限制访问权限。密钥丢失后原 API Key 无法解密；如需一致的文件备份，可短暂停止服务后复制，再恢复服务。

更新时在 `app/` 获取指定版本，使用既有 Node/pnpm 与 cache，执行 frozen-lockfile 安装、类型检查、前端构建及测试后再重启。不要覆盖已有环境文件或重新生成密钥。tsx 位于 devDependencies，当前部署保留全部锁定依赖。

## 验证

- frozen-lockfile 安装通过，未修改 lockfile；服务器源码工作区干净。
- web:check、server:check、web:build、check:core、server/check-assistant.ts 全部通过。
- 实际服务的健康接口、根页面、JS/CSS 资源、8 GPU 模拟采样、NDJSON 模拟问答通过。
- 临时会话问答后重启服务，会话与两条消息恢复；测试完成后已删除临时会话。
- 会话文件与配置文件权限均为 0600；Linger=yes、enabled/active。

未重启整台共享服务器验证开机恢复，已检查启动配置并验证服务重启恢复。本次未做浏览器交互回归或真实模型联调。前端构建提示 bundle 超过 500 kB，构建成功。
