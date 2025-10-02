# dog写作引擎 （Next.js + TypeScript + Gemini）
是一款面向网文作者与编辑团队的开源创作与阅读一体化引擎。它基于 Next.js + TypeScript 构建，前端直调 Gemini，内置在线书城解析、创作管理、AI 率检测等模块。项目强调“高可插拔、强兼容、前后端皆可跑”，即装即用，亦可按需扩展服务端能力（代理、Genkit 流程、图片解码等）。
<img width="1905" height="908" alt="19fdfbf5d4fafb3b6e682d48bc97dabd" src="https://github.com/user-attachments/assets/35473470-d051-46cf-86b8-a46e1db148a4" />


### 主要特性
- **前端直调 AI（无后端依赖）**：在浏览器使用你的 Gemini API Key 完成智能续写、改写、风格迁移和专业分析
- **书城系统**：搜索/分类/热门/详情/目录/章节阅读，支持多书源解析与分页拼接
- **创作工具集**：章节管理、角色卡片、世界设定管理与细纲拆解（DeconstructOutline）
- **AI 率检测**：集成检测能力，返回原始概率值，辅助质量把控
- **可扩展能力**：服务端代理、Genkit flows、图片解码/反代等按需启用
<img width="1757" height="916" alt="ae42e08afd6babfda72cfa99e1c7ac56" src="https://github.com/user-attachments/assets/2ca78ad2-9c9a-4ea2-bb8e-d37030ff6bd7" />

---
<img width="1718" height="875" alt="d11524844bdc40d98ac8c55b67e3849e" src="https://github.com/user-attachments/assets/3964597b-0a21-4b65-9c62-a48b748c7ba5" />


## 快速开始

### 1) 安装依赖
```bash
npm install
```

### 2) 启动开发服务器
```bash
npm run dev
```
访问 `http://localhost:9002`

### 3) 配置 Gemini（首次使用）
1. 打开应用右下角的「AI设置」
2. 在弹窗中粘贴从 Google AI Studio 获取的 API Key
3. 保存后即可使用 AI 写作与分析功能

- 获取密钥：[`Google AI Studio`](https://aistudio.google.com/app/apikey)
- 默认配额（免费）：约每分钟15次、每天1500次
- 安全性：密钥仅保存在浏览器 `localStorage`，不会上传服务器

### 4) （可选）服务端配置
如需使用服务端 AI/代理或 Genkit 流程，创建 `.env.local`：
```bash
# Gemini API（服务端）
GEMINI_API_KEY=your_gemini_api_key_here

# 代理（仅国内服务器需要）
HTTP_PROXY=http://127.0.0.1:7890
```
> 仅前端直调时无需配置服务端环境。

---

## 功能一览

### 💡 AI 写作助手
- 智能续写、改写与风格迁移
- 角色扮演回复、世界观信息注入
- 支持「继续」等连续对话，完整保留上下文
- 输出长度/温度可调，支持多模型（如 `gemini-2.5-flash` / `gemini-2.5-pro` 等）

### 📚 在线书城
- 书源解析：搜索、分类、热门、详情、目录与章节解析
- 目录 preUpdateJs/formatJs、正文 replaceRegex/sourceRegex、下一页导航均已接入
- 支持 <js> 代码、@css + @js 混合、JSON 路径与占位符/表达式（`{{page}}`、`{{host()}}`、`{{source.xxx}}`）
- 每源代理基址 `proxyBase`：对“只能本地/内网可达”的源可优先通过你的代理出口
- 图片代理 `/api/proxy-image`，自动 UA/Referer，解决封面防盗链/CORS
- 一键导入到创作，保持段落结构

### ✍️ 创作管理
- `ChapterManager`：章节草稿与成稿管理
- `CharacterCardManager`：人物卡片
- `WorldBookManager`：世界设定与素材
- `DeconstructOutline`：从正文提取细纲、转剧情骨架

### 🔎 AI 率检测
- 集成检测工具，辅助评估文本 AI 生成概率

---

## 技术栈
- 前端：Next.js 15、React 18、TypeScript
- UI：Tailwind CSS、shadcn/ui
- AI：Gemini（前端直调）、可选 Genkit flows（服务端）
- 存储：Firebase（可选）、LocalStorage

---

## 重要文件
- 前端 AI 客户端：`src/lib/gemini-client.ts`
- AI 设置组件：`src/components/GeminiSettings.tsx`
- 书城 API 路由：`src/pages/api/bookstore/*`
- 书源解析工具：`src/lib/book-source-utils.ts`
- 代理工具（服务端可选）：`src/lib/proxy-fetch.ts`
- Genkit 配置与 flows（可选）：`src/ai/*`

---

## 项目结构（节选）
```
src/
├── ai/                    # Genkit flows（可选）
├── app/                   # Next.js 页面与 App Router API
├── components/            # 组件（AI设置、编辑器、细纲拆解等）
├── lib/                   # 工具与类型（Gemini 客户端、书源解析、代理工具等）
├── data/                  # 静态数据（社区提示词等）
└── pages/api/             # 传统 API 路由（书城接口）

docs/
├── proxy-setup.md         # 代理配置指南
├── blueprint.md           # 项目蓝图
└── frontend-ai-guide.md   # 前端 AI 指南
```

---

## 常见问题 FAQ
**Q：国内能用吗？**  
A：可以。前端直调模式取决于你的本地网络环境；若本机可访问 Google，就能使用 AI 功能。

**Q：我的 API Key 会泄露吗？**  
A：不会。密钥仅保存在浏览器 `localStorage`，不会发送到服务器。

**Q：出现请求受限怎么办？**  
A：遵守免费配额；必要时切换到性价比更高的 `gemini-2.5-flash`。

**Q：书城打不开/超时？**  
A：部分书源依赖目标站点可达性或需要 Cookie。可在“认证设置”里录入 Cookie/Token，并为该源配置 `proxyBase`（见 `docs/proxy-setup.md`）。

---

## 部署与发布
- 本地运行：`npm run dev`
- 生产构建：`npm run build && npm run start`
- 可部署到任意支持 Node.js 的平台（Vercel、Netlify、Cloud Run 等）

---

## 许可证
MIT

---

