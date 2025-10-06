# 边缘部署指南 - EdgeOne等平台兼容性解决方案

本指南详细说明了如何将dog-Engine-front项目成功部署到EdgeOne、Vercel Edge Runtime、Cloudflare Workers等边缘计算平台，并解决常见的兼容性问题。

## 🚨 已知问题分析

### 1. 文件系统依赖问题
**问题**: `src/lib/book-source-storage.ts` 使用Node.js `fs`模块
```typescript
const dataFilePath = isVercel
    ? path.join('/tmp', 'book_sources.json')
    : path.join(process.cwd(), 'book_sources.json');
```
**影响**: EdgeOne等边缘运行时不支持文件系统操作

### 2. 代理配置问题
**问题**: `src/lib/proxy-fetch.ts` 依赖`HttpsProxyAgent`
```typescript
const agent = new HttpsProxyAgent(proxyUrl);
```
**影响**: 边缘运行时不支持Node.js代理模块

### 3. LocalStorage服务端访问
**问题**: AI配置和其他功能在服务端访问`localStorage`
**影响**: 服务端渲染时`window`对象不存在

### 4. 外部API访问限制
**问题**: 某些外部API可能被边缘平台网络策略阻止
**影响**: AI检测等功能可能失效

## 🛠️ 解决方案

### 1. 使用边缘兼容的存储适配器

替换原有的文件存储，使用新的`book-source-storage-edge.ts`:

```javascript
// 自动检测环境并选择合适的存储方式
import { getBookSources, saveBookSources } from '@/lib/book-source-storage-edge';

// 使用方法保持不变
const sources = await getBookSources();
await saveBookSources(updatedSources);
```

**支持的存储方式**:
- 浏览器: localStorage
- EdgeOne: API存储
- Cloudflare: KV存储
- Vercel: KV存储
- 备用: 内存存储

### 2. 使用边缘兼容的代理适配器

使用新的`proxy-fetch-edge.ts`替代原有代理:

```javascript
import { getProxyFetch, configureProxy } from '@/lib/proxy-fetch-edge';

// 配置代理
configureProxy({
    timeout: 30000,
    retries: 2
});

// 使用代理fetch
const proxyFetch = getProxyFetch();
const response = await proxyFetch('https://example.com/api');
```

### 3. 部署新的API端点

确保以下API端点正常工作:
- `/api/book-sources` - 书源管理
- `/api/proxy-fetch` - 代理请求
- `/api/test-proxy` - 代理测试

### 4. 更新Next.js配置

使用更新后的`next.config.ts`，包含:
- 边缘运行时支持
- 安全头部配置
- CORS配置
- Webpack优化

## 📋 部署检查清单

### 环境检测
```javascript
import { getEnvironmentInfo, checkEdgeCompatibility } from '@/lib/edge-deployment-utils';

// 检查当前环境
const envInfo = getEnvironmentInfo();
console.log('平台:', envInfo.capabilities.platform);
console.log('运行时:', envInfo.capabilities.runtime);

// 检查兼容性
const compatibility = await checkEdgeCompatibility();
if (!compatibility.compatible) {
    console.error('兼容性问题:', compatibility.issues);
}
```

### 自动迁移
```javascript
import { autoMigrateForEdge } from '@/lib/edge-deployment-utils';

// 执行自动迁移
const result = await autoMigrateForEdge({
    autoDetect: true,
    forceEdgeCompatible: true,
    preserveData: true
});

if (result.success) {
    console.log('迁移成功:', result.changes);
} else {
    console.error('迁移失败:', result.errors);
}
```

## 🚀 具体平台部署指南

### EdgeOne部署

1. **环境变量配置**:
```bash
EDGE_RUNTIME=edgeone
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

2. **构建配置**:
```json
{
  "build": {
    "command": "npm run build",
    "environment": {
      "EDGE_RUNTIME": "edgeone"
    }
  }
}
```

3. **路由配置**:
确保API路由配置为边缘函数:
```javascript
export const runtime = 'edge';
```

### Vercel Edge Runtime部署

1. **环境变量**:
```bash
VERCEL_ENV=production
KV_REST_API_URL=your-kv-url
KV_REST_API_TOKEN=your-kv-token
```

2. **vercel.json配置**:
```json
{
  "functions": {
    "src/app/api/*/route.ts": {
      "runtime": "edge"
    }
  }
}
```

### Cloudflare Workers部署

1. **wrangler.toml配置**:
```toml
name = "dog-engine-front"
main = "dist/server.js"
compatibility_date = "2024-01-01"

[env.production]
route = "your-domain.com/*"

[[env.production.kv_namespaces]]
binding = "BOOK_SOURCES_KV"
id = "your-kv-namespace-id"
```

2. **环境变量**:
```bash
CLOUDFLARE_WORKERS=1
```

## 🔧 故障排除

### 常见错误及解决方案

1. **"fetch is not defined"**
   - 确保使用Web标准的fetch API
   - 更新到支持fetch的运行时版本

2. **"localStorage is not defined"**
   - 使用条件检查: `typeof window !== 'undefined'`
   - 服务端使用API存储替代

3. **"Module not found: fs"**
   - 使用边缘兼容的存储适配器
   - 配置webpack fallback

4. **CORS错误**
   - 配置正确的CORS头部
   - 使用代理API绕过CORS限制

5. **超时错误**
   - 调整边缘函数超时设置
   - 优化请求并发数量

### 性能优化建议

1. **内存优化**:
```javascript
// 使用流式处理大数据
const stream = new ReadableStream({
    start(controller) {
        // 分块处理数据
    }
});
```

2. **并发控制**:
```javascript
// 限制并发请求数量
const concurrency = isEdgeRuntime ? 2 : 5;
```

3. **缓存策略**:
```javascript
// 配置适当的缓存
const cacheHeaders = {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
};
```

## 📊 监控和调试

### 部署验证

创建健康检查端点:
```javascript
// src/app/api/health/route.ts
export async function GET() {
    const envInfo = getEnvironmentInfo();
    const compatibility = await checkEdgeCompatibility();
    
    return NextResponse.json({
        status: 'healthy',
        platform: envInfo.capabilities.platform,
        compatible: compatibility.compatible,
        timestamp: new Date().toISOString()
    });
}
```

### 日志配置

```javascript
// 结构化日志
const log = {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    platform: envInfo.capabilities.platform,
    runtime: envInfo.capabilities.runtime
};
```

### 错误追踪

```javascript
// 全局错误处理
globalThis.addEventListener('unhandledrejection', (event) => {
    console.error('[Edge] Unhandled rejection:', event.reason);
});
```

## 🔄 迁移步骤

### 1. 代码迁移
```bash
# 1. 更新依赖
npm install

# 2. 运行迁移检查
npm run edge:check

# 3. 执行自动迁移
npm run edge:migrate

# 4. 验证迁移结果
npm run edge:validate
```

### 2. 配置更新
- 更新`next.config.ts`
- 配置环境变量
- 设置API端点

### 3. 测试验证
```bash
# 本地测试边缘兼容性
npm run dev:edge

# 运行集成测试
npm run test:edge

# 构建生产版本
npm run build:edge
```

## 📚 相关文档

- [EdgeOne文档](https://cloud.tencent.com/document/product/1552)
- [Vercel Edge Runtime文档](https://vercel.com/docs/functions/edge-functions)
- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Next.js边缘运行时文档](https://nextjs.org/docs/api-reference/edge-runtime)

## 🆘 获取帮助

如果遇到部署问题，请提供以下信息:

1. 平台类型和版本
2. 错误日志和堆栈跟踪
3. 环境变量配置
4. `getEnvironmentInfo()`的输出结果

通过这个指南，你应该能够成功将项目部署到各种边缘计算平台，并解决常见的兼容性问题。