import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 生成 UUID，兼容所有环境（包括非 HTTPS 环境）
 * 优先使用 crypto.randomUUID()，不可用时使用 fallback 方案
 */
export function generateUUID(): string {
  // 检查是否在浏览器环境且 crypto.randomUUID 可用
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    try {
      return window.crypto.randomUUID();
    } catch (e) {
      // 在某些环境下（如非 HTTPS）可能会抛出异常，fallback 到下面的方案
    }
  }
  
  // Fallback: 使用时间戳 + 随机数生成类似 UUID 的格式
  // 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
