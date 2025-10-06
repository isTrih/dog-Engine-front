# AI功能升级指南

## 🎉 重要更新

dog写作引擎的AI功能已全面升级！从原来仅支持Google Gemini，现在扩展支持多个AI提供商，包括硅基流动、OpenAI、智谱AI、月之暗面等。

## ✨ 新功能亮点

### 🔧 多提供商支持
- **硅基流动** - 免费额度充足，性价比高，**默认推荐**
- **OpenAI** - 官方GPT模型，质量卓越  
- **智谱AI** - 国产GLM模型，中文理解优秀
- **月之暗面** - Moonshot模型，长文本支持出色
- **自定义** - 支持任何兼容OpenAI API格式的提供商

### 🚀 技术升级
- 统一的OpenAI API格式，更好的兼容性
- 保持原有Gemini功能完全兼容
- 更丰富的模型选择
- 改进的错误处理和重试机制
- 流式输出支持

## 🎯 推荐配置：硅基流动

我们**强烈推荐**使用硅基流动作为默认AI提供商：

```javascript
// 默认配置示例
const url = 'https://api.siliconflow.cn/v1/chat/completions';
const options = {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <your-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "model": "deepseek-ai/DeepSeek-V3.1",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "max_tokens": 8192
  })
};
```

### 硅基流动优势
- ✅ **免费额度充足** - 新用户可获得大量免费tokens
- ✅ **模型丰富** - DeepSeek、Qwen、Llama等主流模型
- ✅ **响应速度快** - 国内访问无需代理
- ✅ **价格便宜** - 付费价格比官方便宜数倍
- ✅ **稳定可靠** - 专业的AI模型服务商

## 🛠️ 快速开始

### 1. 获取硅基流动API Key

1. 访问 [硅基流动官网](https://cloud.siliconflow.cn/)
2. 注册并登录账号
3. 进入控制台 > API管理
4. 创建新的API密钥
5. 复制密钥备用

### 2. 配置AI设置

1. 打开应用，点击右上角的 **"AI设置"** 按钮
2. 选择 **"硅基流动"** 作为AI提供商
3. 选择推荐模型 **"DeepSeek V3.1"**
4. 粘贴您的API密钥
5. 点击 **"测试连接"** 验证配置
6. 保存设置

### 3. 开始使用

配置完成后，所有AI功能将自动使用新的配置：
- 智能续写
- 文本改写  
- 角色卡片生成
- 细纲拆解
- 审稿助手
- 等等...

## 🔄 从Gemini迁移

### 自动迁移

如果您之前配置了Gemini，系统会自动提示您迁移：

1. 系统检测到旧配置时会显示迁移通知
2. 点击 **"自动迁移设置"** 
3. 系统会保留您的API密钥和相关设置
4. 迁移完成后可以选择清理旧配置

### 手动配置

您也可以忽略迁移，直接配置新的AI提供商：

1. 点击迁移通知中的 **"稍后手动配置"**
2. 在AI设置中选择新的提供商
3. 输入新的API密钥
4. 原Gemini配置会继续保留

## 📋 支持的模型

### 硅基流动
- **DeepSeek V3.1** (推荐) - 最新版本，综合能力强
- **DeepSeek V2.5** - 性能稳定，速度快
- **Qwen 2.5 72B** - 中文理解优秀
- **Llama 3.1 70B** - Meta开源模型

### OpenAI
- **GPT-4o** - 最新多模态模型
- **GPT-4o Mini** - 轻量快速版本
- **GPT-4 Turbo** - 高性能版本
- **GPT-3.5 Turbo** - 经典模型

### 智谱AI
- **GLM-4 Plus** - 旗舰版本
- **GLM-4** - 标准版本
- **GLM-4 Air** - 轻量版本

### 月之暗面
- **Moonshot v1 8K** - 8K上下文
- **Moonshot v1 32K** - 32K上下文  
- **Moonshot v1 128K** - 128K长文本

## 💡 使用建议

### 模型选择
- **日常创作**: DeepSeek V3.1 / GPT-4o Mini
- **重要内容**: GPT-4o / GLM-4 Plus
- **长文本**: Moonshot v1 32K/128K
- **中文优化**: GLM系列 / Qwen系列

### 成本控制
- 优先使用硅基流动等第三方服务（成本更低）
- 根据需求选择合适的模型规格
- 控制max_tokens参数避免过度消耗

### 性能优化
- 国内用户推荐硅基流动（无需代理）
- 海外用户可直接使用OpenAI
- 启用流式输出提升用户体验

## 🔍 测试功能

访问 `/ai-test` 页面可以测试新的AI功能：

1. 检查当前配置状态
2. 测试普通生成功能
3. 测试流式生成功能
4. 验证不同模型效果

## 🆘 故障排除

### 常见问题

**Q: 提示"请先配置AI提供商"**
A: 点击右上角AI设置按钮，配置任一提供商即可

**Q: API请求失败**  
A: 检查API密钥是否正确，网络是否正常，余额是否充足

**Q: 某些模型无法使用**
A: 部分模型需要特殊权限或付费账号，建议使用推荐模型

**Q: 迁移后功能异常**
A: 可以清除浏览器缓存重新配置，或手动配置新提供商

### 调试模式

在浏览器控制台中设置调试模式：
```javascript
localStorage.setItem('ai-debug', 'true');
```

这将显示详细的请求和响应信息，帮助排查问题。

## 📚 API文档

### generateContent

```typescript
generateContent(
  modelId: string,
  prompt: string,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
  }
): Promise<string>
```

### generateContentStream

```typescript
generateContentStream(
  modelId: string,
  prompt: string,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
  }
): AsyncGenerator<string>
```

## 🔗 相关链接

- [硅基流动官网](https://cloud.siliconflow.cn/)
- [OpenAI Platform](https://platform.openai.com/)
- [智谱AI开放平台](https://open.bigmodel.cn/)
- [月之暗面](https://platform.moonshot.cn/)

## 📝 更新日志

### v2.0.0 (2024-12)
- ✨ 新增多AI提供商支持
- ✨ 集成硅基流动作为默认推荐
- ✨ 支持OpenAI API格式
- ✨ 添加流式输出功能
- ✨ 改进配置管理界面
- 🔄 保持Gemini完全兼容
- 🐛 修复多项稳定性问题

---

**需要帮助？** 如有任何问题，请查看项目文档或提交Issue。