# taskCrx - Chrome扩展任务管理器

一个用于管理域名授权和定时任务的Chrome浏览器扩展插件，支持Cookie收集、应用数据收集和任务调度功能。

## 📋 项目概述

- **目标用户**: 需要管理浏览器Cookie和定时任务的开发者或高级用户
- **核心功能**: 提供对特定域名的Cookie收集、任务管理和通知功能
- **技术架构**: 基于Chrome扩展MV3架构，使用Vue 3 + Naive UI构建响应式界面

## 🔄 更新记录

### v2.2.1 (最新)
- **优化**: 简化苹果开发者CSRF Token获取，使用固定默认值 "csrf-itc"
- **移除**: 删除不必要的 `getAppleCSRFToken` 函数，减少API调用开销
- **改进**: 苹果应用数据收集更加高效和稳定

### v2.2.0
- **新增**: 苹果开发者应用数据收集功能，支持从App Store Connect获取应用列表
- **新增**: 混合数据源支持，同时收集极光推送和苹果应用数据
- **新增**: 苹果开发者Cookie认证机制，自动获取CSRF Token
- **新增**: 任务配置界面新增苹果应用数据收集选项
- **扩展**: 支持多平台应用数据的统一管理和收集

### v2.1.0
- **重要**: 极光推送Token获取方式改为从Cookie获取，不再依赖localStorage
- **优化**: 简化Chrome Cookies API使用，直接使用Promise而不再手动封装
- **简化**: 移除测试文件，改为手动测试验证
- **新增**: 完整的应用数据收集功能，支持用户信息、应用列表、应用详情收集
- **新增**: localStorage数据收集功能（通过Content Script实现）
- **改进**: 实时token获取机制，避免token过期问题
- **改进**: 任务列表界面显示应用数据收集状态

### v2.0.0
- **新增**: 极光推送API集成
- **新增**: 应用数据收集器模块
- **新增**: 类型安全的TypeScript实现
- **新增**: 模块化设计架构

### v1.0.0
- **基础**: 域名授权管理
- **基础**: Cookie收集功能
- **基础**: 定时任务调度
- **基础**: Vue 3 + Naive UI界面
## 📏 项目结构

```
taskCrx/
├─ src/
│  ├─ background.ts         # Chrome扩展后台服务工作线程
│  ├─ utils/
│  │  └─ app-collector.ts   # 应用数据收集器（极光推送API）
│  ├─ content/
│  │  └─ localStorage-collector.ts  # 网页localStorage数据收集
│  ├─ options/              # 插件设置页面
│  │  ├─ App.vue            # 主组件
│  │  ├─ store.ts           # 状态管理
│  │  └─ components/
│  │     ├─ DomainList.vue   # 域名授权列表组件
│  │     └─ TaskList.vue     # 任务管理组件
│  └─ types/
│     └─ index.ts           # TypeScript类型定义
├─ manifest.config.ts        # Chrome插件配置
├─ vite.config.ts            # Vite构建配置
├─ tsconfig.json             # TypeScript编译配置
└─ package.json
```
## 🔐 所需权限

- **cookies**: 访问浏览器的Cookie数据（用于获取极光推送Token）
- **storage**: 存储插件的设置和数据
- **alarms**: 设置定时任务
- **notifications**: 显示桌面通知
- **scripting**: 支持content script注入
- **activeTab**: 获取当前活动标签页信息
- **tabs**: 管理浏览器标签页
- **host_permissions**: 访问指定的域名（包括极光推送域名和苹果开发者域名）
## 🛠️ 功能模块

### 1. 📋 顶部栏
- **功能**: 展示插件名称和简短描述
- **组件**: Header.vue
- **UI组件**: Naive UI 的 NLayoutHeader、NText 等组件

### 2. 🌐 域名授权列表
- **功能**: 显示用户已授权的域名列表，支持添加和删除域名
- **组件**: DomainList.vue
- **UI组件**: Naive UI 的 NList、NListItem、NButton 等组件

### 3. 📊 任务区域
- **功能**: 显示每个域名对应的任务，支持添加任务和应用数据收集配置
- **组件**: TaskList.vue、AddTaskDialog.vue
- **UI组件**: Naive UI 的 NCard、NButton、NDialog、NInput 等组件
- **新增**: 应用数据收集配置界面，支持用户信息、应用列表、数量限制设置

### 4. 📱 应用数据收集器
- **功能**: 从极光推送API获取应用相关数据
- **特性**: 实时Token获取，支持用户信息、应用列表、应用详情收集
- **API**: 支持极光推送完整API集成

### 5. 🍎 苹果开发者应用数据收集器
- **功能**: 从Apple App Store Connect API获取应用相关数据
- **认证**: 使用苹果开发者网站Cookie进行认证，使用固定CSRF Token "csrf-itc"
- **数据范围**: 支持获取应用列表、应用基本信息、版本信息等
- **限制**: 需要用户在浏览器中登录苹果开发者账号
- **优化**: 无需动态获取CSRF Token，使用默认值提高效率

### 6. 💾 localStorage数据收集
- **功能**: 通过Content Script收集网页localStorage数据
- **支持**: 全量locStorage获取、指定键值获取、关键词搜索
- **限制**: 仅能访问已打开标签页的localStorage
## 🛠️ 开发与构建

### 💻 技术栈
- **前端**: Vue 3.5.18
- **构建工具**: Vite 7.1.1
- **UI框架**: Naive UI 2.42.0
- **类型检查**: TypeScript 5.9.2
- **扩展构建**: @crxjs/vite-plugin 2.1.0
- **打包工具**: vite-plugin-zip-pack 1.2.4

### 📋 开发环境要求
- **必需**: Node.js >= 18.x
- **包管理**: npm 或 pnpm
- **测试浏览器**: Chrome浏览器（用于调试扩展）
- **推荐编辑器**: VS Code + TypeScript支持插件

### 📜 配置文件
- **manifest.config.ts**: 配置插件的基本信息和权限
- **vite.config.ts**: 配置 Vite 的构建选项，使用 @vitejs/plugin-vue 插件处理 Vue 文件
- **tsconfig.json**: TypeScript编译配置，使用严格模式

### 🚀 构建步骤

1. **安装依赖**:
   ```bash
   npm install
   # 或
   pnpm install
   ```

2. **开发环境**:
   ```bash
   npm run dev
   # 或
   pnpm dev
   ```

3. **构建插件**:
   ```bash
   npm run build
   # 或
   pnpm build
   ```

4. **加载到Chrome**:
   - 访问 `chrome://extensions/` 页面
   - 启用开发者模式
   - 点击“加载已解压的扩展程序”
   - 选择构建后的 `dist` 目录

## 🎨 UI设计

### 🌈 主题与样式
- **主题**: 使用 Naive UI 的默认主题，支持深色和浅色模式
- **样式**: 使用 CSS 自定义样式，确保插件界面简洁、易用

### 📱 响应式设计
- **布局**: 使用 Naive UI 的布局组件，确保插件在不同设备上良好显示
- **适配**: 根据屏幕尺寸调整组件的布局和大小

## 📝 技术文档

- **应用数据收集**: [APP_DATA_COLLECTION.md](./APP_DATA_COLLECTION.md)
- **localStorage数据收集**: [LOCALSTORAGE_COLLECTION.md](./LOCALSTORAGE_COLLECTION.md)
- **Cookie Token更新**: [COOKIE_TOKEN_UPDATE.md](./COOKIE_TOKEN_UPDATE.md)

## 🔒 安全考虑

- **权限管理**: 谨慎处理 host_permissions 和 cookies 权限，防止滥用
- **数据隐私**: 只收集必要的数据，遵循最小权限原则
- **类型安全**: 使用 TypeScript 严格模式，确保代码类型安全
- **性能优化**: 插件保持轻量，避免影响浏览器性能

## 🚀 特性亮点

- ✅ **现代化架构**: 基于Chrome扩展MV3架构
- ✅ **实时Token管理**: 自动从Cookie获取最新token，避免过期问题
- ✅ **类型安全**: 完整的TypeScript类型定义和JSDoc注释
- ✅ **模块化设计**: 清晰的代码组织和分层架构
- ✅ **多数据源**: 支持Cookie、localStorage、极光推送API、苹果开发者API数据收集
- ✅ **响应式界面**: 基于Vue 3 + Naive UI的现代化界面
- ✅ **手动测试**: 采用手动测试验证，确保实际使用场景的可靠性