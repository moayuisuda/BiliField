# 🌸 Bili Field
健康冲浪过滤器 —— Bilibili Feed & Reply Filter

通过复写 `fetch` 实现，过滤哔哩哔哩首页推荐和评论区中包含指定关键词的内容。规则可在扩展弹窗中配置，多条关键词使用逗号（`,` / `，`）分隔。

## 功能特性

- 首页 Feed 屏蔽：拦截 `x/web-interface` 等推荐流接口，对包含指定词的推荐项进行过滤。
- 评论区屏蔽：拦截 `x/v1/x/v2 reply` 等评论接口响应，根据关键词删除匹配评论及其子楼。
- 动态更新规则：使用 `chrome.storage.sync` 持久化配置，弹窗保存后会实时同步到已打开的页面。
- 插件级 fetch 重写：在页面上下文内注入脚本，仅替换必要的响应，尽可能保持与站点原生逻辑的兼容。
- 提供了屏蔽词模板的订阅，一键从接口导入。

## Install

1. 执行 `npm install`（如尚未安装依赖）并运行 `npm run build`。
2. 打开 Chrome → `chrome://extensions`。
3. 开启「开发者模式」，点击「加载已解压的扩展程序」。
4. 选择仓库根目录下的 `dist/` 目录。
5. 在扩展设置中打开本插件，访问 `www.bilibili.com` 验证效果。

## 开发与构建

1. 执行 `npm install` 安装依赖。
2. `npm run dev` 启动 React + Vite 的热更新开发环境（在浏览器中直接访问 Vite 提供的页面可查看弹窗 UI）。
3. `npm run build` 会把弹窗打包到 `dist/` 并自动复制 `extension/manifest.json`、`content/` 等静态资源；在 Chrome 中加载 `dist/` 即可完成部署。

## 配置

1. 点击浏览器工具栏中的扩展图标，打开弹窗。
2. 为「首页推荐」与「评论区」分别填写关键词，使用中英文逗号分隔。
3. 点击「保存」后自动生效。无需刷新页面即可应用到新请求。

## 结构

```
extension/
├── manifest.json          # MV3 manifest
├── content/content.js     # 读取配置并注入页面脚本
├── content/inject.js      # 页面内执行的 fetch 拦截与过滤逻辑
└── icons/                 # 扩展图标

popup.html                 # React + Vite 的弹窗模板
src/popup/
├── App.tsx                # React 组件与业务逻辑
├── main.tsx               # 挂载入口
└── styles.css             # 弹窗样式

scripts/copy-static.js     # 拷贝 manifest、content、icons 到 dist
```

# 贡献

## 贡献本身插件代码

## 贡献更多的屏蔽词预设
https://github.com/ahhcr68-ux/thin-json-db

## TODO

- 增加导入/导出规则的能力。
- 支持更多端点（例如直播、动态、垃圾信息账号等）可选过滤。
- 细化命中日志，方便调试规则。
