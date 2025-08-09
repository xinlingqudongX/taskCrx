cookie-collector-vite/
├─ public/
│  └─ icons/...
│  └─ manifest.json        <-- manifest (MV3)
├─ src/
│  ├─ background.ts        <-- service worker (TS)
│  ├─ options.html
│  └─ options.ts           <-- options page TS (logic + DOM)
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ README.md


插件权限
cookies：访问浏览器的 Cookie 数据。

storage：存储插件的设置和数据。

alarms：设置定时任务。

notifications：显示桌面通知。

host_permissions：访问指定的域名。
arXiv


功能模块
1. 顶部栏
功能：展示插件名称和简短描述。

组件：Header.vue

UI 组件：Naive UI 的 NLayoutHeader、NText 等组件。

2. 域名授权列表
功能：显示用户已授权的域名列表，支持添加和删除域名。

组件：DomainList.vue

UI 组件：Naive UI 的 NList、NListItem、NButton 等组件。
naiveui.com

3. 任务区域
功能：显示每个域名对应的任务，支持添加任务。

组件：TaskList.vue、AddTaskDialog.vue

UI 组件：Naive UI 的 NCard、NButton、NDialog、NInput 等组件。


开发与构建
1. 开发环境
Vite：用于构建和热重载。

Vue 3：构建用户界面的框架。

Naive UI：Vue 3 的 UI 组件库，提供丰富的组件。

2. 构建配置
manifest.json：配置插件的基本信息和权限。

vite.config.ts：配置 Vite 的构建选项，使用 @vitejs/plugin-vue 插件处理 Vue 文件，使用 @crxjs/vite-plugin 插件支持 Chrome 扩展的构建。
folio3

3. 构建步骤
运行 npm run build 或 pnpm build，构建插件的资源。

在 Chrome 浏览器中，访问 chrome://extensions/ 页面。

启用开发者模式。

点击“加载已解压的扩展程序”，选择构建后的 dist 目录。

您的扩展现在已加载到浏览器中。

UI 设计
1. 主题与样式
主题：使用 Naive UI 的默认主题，支持深色和浅色模式。

样式：使用 CSS 自定义样式，确保插件界面简洁、易用。

2. 响应式设计
布局：使用 Naive UI 的布局组件，确保插件在不同设备上良好显示。

适配：根据屏幕尺寸调整组件的布局和大小。