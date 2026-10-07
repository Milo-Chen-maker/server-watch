# AI 助手前端

2026-10-07：使用固定版本 markstream-vue 2.0.14 和 vue-element-plus-x 2.0.3，满足 pnpm 的七天发布隔离规则。

## 布局与交互

桌面会话侧栏支持折叠、搜索、按今天/昨天/更早分组，以及原有的新建、重命名和删除。窄屏改为会话抽屉。用户消息靠右，助手回答保留阅读宽度，正文支持流式 Markdown 的标题、列表、引用、表格和代码块。工具调用呈现状态卡片，点击打开参数、采样来源、常用字段表格与原始结果；回答可查看模型和采样依据。

固定底部输入区复用 Element Plus textarea，自动增高，Enter 发送、Shift+Enter 换行，输入法组合输入不触发提交。支持停止生成和复制回答/代码，复制复用已有 HTTP IP 访问的兼容回退。阅读历史时停止跟随滚动，可点击回到最新。

## 渲染边界

HTML 按文本显示；链接仅允许 HTTP、HTTPS、mailto 和页面锚点。图片显示占位文字，避免模型回复自动请求外部资源。代码块使用自定义纯文本渲染与复制；暂未启用语法高亮、数学公式、Mermaid、D2 或信息图插件。组件自身的动态可选模块虽出现在构建资产中，但上述功能保持禁用。助手组件异步加载，监控页初始加载不包含聊天组件主体。Vite 仍提示已有主包和 Markdown 共用包体积较大，可后续优化。

## 验证与部署

web:check、web:build、server:check、check:pi、check:core 通过。独立 3031 环境使用独立会话数据验证 GPU4 真实工具查询与 Markdown 表格、Enter 发送、停止生成、输入清空、Shift+Enter、多会话搜索/切换/重命名、历史回答和 390px 会话抽屉；恶意 HTML 与 javascript 链接未执行。

正式部署只更新源码、依赖清单和已构建 public/console 静态资产，不修改助手后端协议、正式会话、密钥或阈值。资产先上传，再原子替换 index.html，并保留服务器旧散列资产以兼容尚未刷新的页面。生产 node_modules 保留；新增依赖仅用于前端构建，已在 staging-chat-ui 独立安装验证。未来重建请先在构建目录 pnpm install --frozen-lockfile，再执行 web:check/web:build。
