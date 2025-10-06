# EdgeOne平台部署指南

本指南专门针对腾讯云EdgeOne边缘计算平台，提供完整的部署方案和客户端数据库存储解决方案。

## 🏗️ 架构概述

在EdgeOne平台上，dog-Engine-front采用以下架构：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   浏览器客户端   │    │  EdgeOne边缘节点 │    │   外部API服务   │
│                │    │                │    │                │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ IndexedDB   │ │    │ │ Edge Function│ │    │ │ AI Provider │ │
│ │ LocalStorage│ │◄──►│ │ Proxy API   │ │◄──►│ │ Book Sources│ │
│ │ 客户端数据库 │ │    │ │ CORS处理    │ │    │ │ 外部服务    │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**核心特点**：
- 所有用户数据存储在浏览器客户端（IndexedDB + localStorage）
- EdgeOne边缘节点仅处理代理和API转发
- 无需传统数据库，完全依赖客户端存储

## 📋 部署前准备

### 1. 环境要求
- 腾讯云账号和EdgeOne服务权限
- Node.js 18+ 和 npm
- 现代浏览器支持（Chrome 60+, Firefox 55+, Safari 12+）

### 2. 必需的环境变量
```bash
# EdgeOne平台标识
EDGE_RUNTIME=edgeone
EDGEONE=1
TENCENT_CLOUD_EDGE=1

# EdgeOne配置
EDGEONE_REGION=ap-guangzhou
EDGEONE_ZONE_ID=your-zone-id
EDGEONE_API_TOKEN=your-api-token

# 应用配置
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### 3. 腾讯云EdgeOne控制台配置
1. 创建EdgeOne站点
2. 配置域名和SSL证书
3. 启用边缘函数功能
4. 设置缓存规则

## 🚀 部署步骤

### 步骤1：项目配置

1. **安装依赖**
```bash
npm install
```

2. **配置环境变量**
创建 `.env.local` 文件：
```bash
EDGE_RUNTIME=edgeone
EDGEONE=1
TENCENT_CLOUD_EDGE=1
EDGEONE_REGION=ap-guangzhou
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

3. **验证EdgeOne兼容性**
```bash
npm run edgeone:check
```

### 步骤2：客户端数据库初始化

项目会自动使用客户端数据库存储，包括：

- **IndexedDB**（主要存储）
  - 书源数据
  - AI配置
  - 用户设置
  - 阅读进度
  - 书籍缓存

- **localStorage**（备用存储）
  - 配置备份
  - 临时数据
  - 用户偏好

### 步骤3：构建和部署

1. **构建项目**
```bash
npm run build
```

2. **本地测试边缘兼容性**
```bash
npm run dev:edge
```

3. **部署到EdgeOne**
```bash
# 使用腾讯云CLI
tencentcloud edgeone deploy --config edgeone.config.js

# 或使用自动化脚本
npm run deploy:edgeone
```

### 步骤4：配置EdgeOne边缘函数

在EdgeOne控制台中配置以下边缘函数：

#### API路由配置
```javascript
// /api/book-sources - 书源管理API
{
  "path": "/api/book-sources",
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "runtime": "edge",
  "timeout": 30,
  "memory": 128
}

// /api/proxy-fetch - 代理请求API
{
  "path": "/api/proxy-fetch", 
  "methods": ["GET", "POST", "OPTIONS"],
  "runtime": "edge",
  "timeout": 60,
  "memory": 256
}
```

#### 缓存规则配置
```javascript
// 静态资源缓存
{
  "path": "/_next/static/**",
  "cache": "public, max-age=31536000, immutable"
}

// API响应缓存
{
  "path": "/api/book-sources",
  "cache": "public, max-age=3600, stale-while-revalidate=86400"
}
```

## 🔧 客户端数据库使用

### 基本用法

```javascript
import { getClientDB } from '@/lib/client-database';

// 获取数据库实例
const db = getClientDB();

// 书源操作
const sources = await db.getBookSources();
await db.saveBookSources(newSources);
await db.addBookSource(source);
await db.updateBookSource(source);
await db.deleteBookSource(id);

// AI配置
const aiConfig = await db.getAIConfig();
await db.saveAIConfig(config);

// 用户设置
const setting = await db.getUserSetting('theme', 'light');
await db.saveUserSetting('theme', 'dark');

// 阅读进度
await db.saveReadingProgress(bookId, progress);
const progress = await db.getReadingProgress(bookId);
```

### 数据迁移和备份

```javascript
// 导出所有数据
const data = await db.exportData();
const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

// 导入数据
const imported = await db.importData(data);

// 获取存储统计
const stats = await db.getStorageStats();
console.log('书源数量:', stats.bookSourcesCount);
console.log('IndexedDB支持:', stats.indexedDBSupported);
console.log('存储大小:', stats.storageSize);
```

### 错误处理

```javascript
try {
  const sources = await db.getBookSources();
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    // 存储空间不足，清理旧数据
    await db.clearOldData();
  } else {
    // 其他错误，使用备用方案
    console.error('数据库操作失败:', error);
  }
}
```

## 🛠️ 故障排除

### 常见问题

#### 1. IndexedDB不可用
**症状**: 数据无法保存，控制台报错"IndexedDB不支持"
**解决方案**:
```javascript
// 检查支持情况
const stats = await getClientDB().getStorageStats();
if (!stats.indexedDBSupported) {
  console.warn('IndexedDB不支持，将使用localStorage备用方案');
}
```

#### 2. 存储空间不足
**症状**: 保存数据时报错"QuotaExceededError"
**解决方案**:
```javascript
// 清理旧数据
await db.clearOldData();

// 或者完全清空
await db.clearAllData();
```

#### 3. 跨域请求失败
**症状**: 外部API请求被阻止
**解决方案**: 使用代理API
```javascript
// 使用代理请求
const response = await fetch('/api/proxy-fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://external-api.com/data',
    method: 'GET'
  })
});
```

#### 4. 边缘函数超时
**症状**: API请求超时
**解决方案**: 优化请求和增加超时时间
```javascript
// 在edgeone.config.js中调整
routes: {
  api: {
    "/api/proxy-fetch": {
      timeout: 60, // 增加到60秒
      memory: 256  // 增加内存
    }
  }
}
```

### 性能优化

#### 1. 数据分页加载
```javascript
// 分页获取书源
async function getBookSourcesPaginated(page = 1, limit = 50) {
  const allSources = await db.getBookSources();
  const start = (page - 1) * limit;
  return allSources.slice(start, start + limit);
}
```

#### 2. 缓存优化
```javascript
// 缓存频繁访问的数据
let cachedSources = null;
let cacheTime = 0;

async function getCachedBookSources() {
  const now = Date.now();
  if (!cachedSources || now - cacheTime > 300000) { // 5分钟缓存
    cachedSources = await db.getBookSources();
    cacheTime = now;
  }
  return cachedSources;
}
```

#### 3. 批量操作
```javascript
// 批量保存书源
async function batchSaveBookSources(sources) {
  // 分批处理，避免内存溢出
  const batchSize = 100;
  for (let i = 0; i < sources.length; i += batchSize) {
    const batch = sources.slice(i, i + batchSize);
    await db.saveBookSources(batch);
    
    // 给浏览器喘息时间
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

## 📊 监控和维护

### 健康检查

```javascript
// 创建健康检查端点
// /api/health/route.ts
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'edgeone',
    checks: {
      storage: false,
      proxy: false,
      ai: false
    }
  };

  try {
    // 检查客户端存储
    const db = getClientDB();
    const stats = await db.getStorageStats();
    health.checks.storage = stats.indexedDBSupported || stats.localStorageSupported;

    // 检查代理功能
    const proxyTest = await testProxyConnection();
    health.checks.proxy = proxyTest.success;

    // 检查AI服务
    const aiTest = await testAIConnection();
    health.checks.ai = aiTest.valid;

    health.status = Object.values(health.checks).every(check => check) ? 'healthy' : 'degraded';
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
  }

  return NextResponse.json(health);
}
```

### 日志监控

```javascript
// 结构化日志
function logEdgeEvent(event, data) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    platform: 'edgeone',
    region: process.env.EDGEONE_REGION,
    event,
    data
  }));
}

// 使用示例
logEdgeEvent('storage.operation', {
  operation: 'save',
  type: 'bookSources',
  count: sources.length,
  success: true
});
```

## 🔄 数据迁移

### 从传统存储迁移到客户端数据库

```javascript
// 迁移脚本
async function migrateToClientDB() {
  const db = getClientDB();
  
  // 1. 检查是否已有数据
  const existingSources = await db.getBookSources();
  if (existingSources.length > 0) {
    console.log('客户端数据库已有数据，跳过迁移');
    return;
  }

  // 2. 从localStorage迁移旧数据
  const oldSources = localStorage.getItem('old-book-sources');
  if (oldSources) {
    try {
      const sources = JSON.parse(oldSources);
      await db.saveBookSources(sources);
      localStorage.removeItem('old-book-sources');
      console.log(`成功迁移 ${sources.length} 个书源`);
    } catch (error) {
      console.error('迁移失败:', error);
    }
  }

  // 3. 从默认配置初始化
  try {
    const response = await fetch('/book_sources.json');
    if (response.ok) {
      const defaultSources = await response.json();
      await db.saveBookSources(defaultSources);
      console.log(`初始化了 ${defaultSources.length} 个默认书源`);
    }
  } catch (error) {
    console.error('初始化默认书源失败:', error);
  }
}

// 在应用启动时调用
migrateToClientDB();
```

## 🔗 相关链接

- [腾讯云EdgeOne官方文档](https://cloud.tencent.com/document/product/1552)
- [EdgeOne边缘函数开发指南](https://cloud.tencent.com/document/product/1552/81882)
- [IndexedDB MDN文档](https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API)
- [项目GitHub仓库](https://github.com/your-org/dog-Engine-front)

## 📞 技术支持

如果在EdgeOne部署过程中遇到问题，请提供以下信息：

1. EdgeOne区域和配置
2. 浏览器类型和版本
3. 错误日志和控制台输出
4. 存储统计信息：
```javascript
const stats = await getClientDB().getStorageStats();
console.log('存储信息:', stats);
```

通过本指南，您可以成功将dog-Engine-front部署到EdgeOne平台，并充分利用客户端数据库的优势。