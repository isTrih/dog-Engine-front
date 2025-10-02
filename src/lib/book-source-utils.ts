import type { BookSource } from './types';
import { VM } from 'vm2';
import * as cheerio from 'cheerio';

// 重新导出书源存储函数以保持向后兼容
export { getBookSources, saveBookSources } from './book-source-storage';
export { parseRuleWithCssJs } from './book-source-rule-parser';

const getHostsFromComment = (comment: string = '', jsLib: string = '', loginUrl: string = ''): string[] => {
    const combinedScript = `${comment}\n${jsLib}\n${loginUrl}`;
    
    // 方法1: 查找 const host = [...]
    let match = combinedScript.match(/const\s+host\s*=\s*(\[[\s\S]*?\])/);
    if (match && match[1]) {
        try {
            const vm = new VM();
            return vm.run(`module.exports = ${match[1]};`);
        } catch (e) {
            console.error('Could not parse hosts from script', e);
        }
    }
    
    // 方法2: 查找 encodedEndpoints（大灰狼书源格式）
    match = combinedScript.match(/const\s+encodedEndpoints\s*=\s*\[([\s\S]*?)\];/);
    if (match && match[1]) {
        try {
            // 提取所有单引号包裹的字符串
            const base64Strings = match[1].match(/'([^']+)'/g) || [];
            console.log(`[getHostsFromComment] 找到 ${base64Strings.length} 个 encodedEndpoints`);
            
            const decodedHosts = base64Strings
                .map(s => s.replace(/'/g, '').trim())
                .filter(s => s.length > 0)
                .map(b64 => {
                    try {
                        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
                        console.log(`[getHostsFromComment] 解码: ${b64.substring(0, 20)}... → ${decoded}`);
                        return decoded;
                    } catch (e) {
                        console.error(`[getHostsFromComment] Base64解码失败: ${b64}`, e);
                        return null;
                    }
                })
                .filter(h => h && (h.startsWith('http://') || h.startsWith('https://')));
            
            if (decodedHosts.length > 0) {
                console.log(`[getHostsFromComment] ✅ 从 encodedEndpoints 解码得到 ${decodedHosts.length} 个有效服务器`);
                return decodedHosts as string[];
            } else {
                console.log(`[getHostsFromComment] ⚠️ encodedEndpoints 解码后没有有效的HTTP服务器`);
            }
        } catch (e) {
            console.error('[getHostsFromComment] 解析 encodedEndpoints 失败:', e);
        }
    } else {
        console.log(`[getHostsFromComment] 未找到 encodedEndpoints 定义`);
    }
    
    return [];
};


const createSandbox = (source: BookSource | undefined, key?: string, page?: number, result?: any) => {
    const variableMap: Record<string, any> = {
        _open_argument: source?.loginUi || '{}'
    };

    const hosts = getHostsFromComment(source?.comment, source?.jsLib, source?.loginUrl);
    console.log(`[createSandbox] 为书源 "${source?.name}" 提取到 ${hosts.length} 个服务器:`, hosts.length > 0 ? hosts[0] : '无');
    
    const sandbox = {
        java: {
            ajax: (url: string) => {
                // 注意：VM2中的同步调用限制，我们只能返回空数据
                // 真实的java.ajax需要异步fetch，但VM2不支持async
                console.warn(`[Mock] java.ajax called: ${url}`);
                console.warn(`[Mock] ⚠️ java.ajax 在Web环境中无法同步执行网络请求，返回空数据`);
                return JSON.stringify({ data: [] });
            },
            get: (key: string) => variableMap[key],
            put: (key: string, value: any) => { variableMap[key] = value; },
            base64Encode: (str: string) => Buffer.from(str).toString('base64'),
            hexDecodeToString: (hex: string) => Buffer.from(hex, 'hex').toString('utf-8'),
            // Mock Android APP methods
            toast: (msg: string) => {
                console.log(`[Mock] java.toast: ${msg}`);
            },
            longToast: (msg: string) => {
                console.log(`[Mock] java.longToast: ${msg}`);
            },
            androidId: () => {
                // Mock返回null，表示不是Android环境
                return null;
            },
            deviceID: () => {
                // Mock返回null，表示没有设备ID
                return null;
            },
            getCookie: (domain: string) => {
                console.log(`[Mock] java.getCookie: ${domain}`);
                return '';
            },
            startBrowser: (url: string, title: string) => {
                console.log(`[Mock] java.startBrowser: ${url}, title: ${title}`);
            },
            startBrowserAwait: (url: string, title: string) => {
                console.log(`[Mock] java.startBrowserAwait: ${url}, title: ${title}`);
            },
        },
        cookie: {
            getCookie: (url: string) => {
                console.log(`[Mock] cookie.getCookie: ${url}`);
                return '';
            }
        },
        cache: {
            get: (key: string) => {
                console.log(`[Mock] cache.get: ${key}`);
                return null;
            },
            put: (key: string, value: any) => {
                console.log(`[Mock] cache.put: ${key} = ${value}`);
            }
        },
        source: {
            ...source,
            getVariable: () => variableMap._open_argument,
            setVariable: (v: string) => { variableMap._open_argument = v; },
            getLoginInfoMap: () => {
                console.log(`[Mock] source.getLoginInfoMap`);
                return {};
            }
        },
        key: key || '',
        page: page || 1,
        result,
        baseUrl: source?.url || '',  // 添加baseUrl变量
        book: result || {},           // 添加book对象
        chapter: result || {},        // 添加chapter对象
        getArguments: (open_argument: string, key: string) => {
            let args;
            try {
                args = JSON.parse(open_argument);
            } catch (e) {
                args = {};
            }
            
            const defaults = {
                "media": "小说",
                "server": hosts.length > 0 ? hosts[0] : "",
                "source": source?.name,
            };
            const finalArgs = { ...defaults, ...args };
            
            if (key === 'server') {
                console.log(`[getArguments] 返回 server = "${finalArgs[key]}" (来自: ${args.server ? '用户配置' : '默认值'})`);
            }
            
            return key ? finalArgs[key] : finalArgs;
        },
    };
    
    if(source?.jsLib) {
        const vm = new VM({ sandbox });
        vm.run(source.jsLib);
    }
    
    return sandbox;
};

export async function evaluateJs(script: string, context: { key?: string, page?: number, source?: BookSource, result?: any, cheerioElements?: any }): Promise<string> {
    let result: string;
    const sandbox = createSandbox(context.source, context.key, context.page, context.result);
    if (context.cheerioElements) {
        (sandbox as any).$ = context.cheerioElements;
    }
    const vm = new VM({ timeout: 2000, sandbox, eval: false, wasm: false });

    if (!script.startsWith('<js>')) {
        result = script;
    } else {
        const jsCode = script.substring(4, script.length - 5);
        try {
            const vmResult = vm.run(jsCode);
            result = String(vmResult);
        } catch (e: any) {
            console.error("Error evaluating JS:", e.message, "\nScript:", jsCode);
            throw new Error(`Error evaluating script: ${e.message}`);
        }
    }

    // 占位符替换
    const currentPage = context.page || 1;
    result = result
        .replace(/\{\{key\}\}/g, context.key || '')
        .replace(/\{\{page\}\}/g, String(currentPage))
        .replace(/\{\{source\}\}/g, context.source?.name || '')
        .replace(/\{\{baseUrl\}\}/g, context.source?.url || '');

    // 支持 {{source.xxx}} 访问书源字段
    result = result.replace(/\{\{\s*source\.(\w+)\s*\}\}/g, (_m, prop) => {
        try { return String((context.source as any)?.[prop] ?? ''); } catch { return ''; }
    });

    // 简单表达式：{{page -1}} / {{page+1}}
    result = result.replace(/\{\{\s*page\s*([+-])\s*(\d+)\s*\}\}/g, (_m, op, num) => {
        const n = parseInt(num, 10) || 0;
        const value = op === '+' ? currentPage + n : currentPage - n;
        return String(value);
    });

    // 支持调用 jsLib 中的 host(): {{host()}}
    result = result.replace(/\{\{\s*host\(\)\s*\}\}/g, () => {
        try {
            const v = vm.run('host()');
            return String(v);
        } catch {
            return '';
        }
    });

    return result;
}


/**
 * 运行一段 JS 片段作为“变换器”。
 * 将入参作为 result 注入，执行 snippet 后返回 result 字符串。
 */
export async function runJsTransformer(snippet: string, context: { key?: string, page?: number, source?: BookSource, result?: any }): Promise<string> {
    const wrapped = `<js>var result = ${JSON.stringify(context.result)};\n${snippet}\n;String(result)</js>`;
    return evaluateJs(wrapped, context);
}

/**
 * 如果书源配置了 coverDecodeJs，则对封面地址做解码/补全
 */
export async function decodeCoverIfNeeded(coverUrl: string | undefined, source?: BookSource): Promise<string | undefined> {
    if (!coverUrl || !source?.coverDecodeJs) return coverUrl;
    try {
        const out = await runJsTransformer(source.coverDecodeJs, { source, result: coverUrl });
        return out || coverUrl;
    } catch {
        return coverUrl;
    }
}


function parseSingleRule(data: string | object, rule: string, baseUrl: string, isList: boolean = false): any {
    if (!rule) return isList ? [] : '';

    if (typeof data === 'object') {
        if (rule.startsWith('$.')) {
            const path = rule.substring(2);
            if (path === '') return data;
            let value: any = data;
            for (const key of path.split('.')) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    return isList ? [] : '';
                }
            }
            return value;
        }
        return isList ? [] : '';
    }

    // From here, data is HTML string
    const $ = cheerio.load(data);

    // Rule transformation: 
    // id.xxx -> #xxx
    // class.xxx -> .xxx  
    // tag.0 -> tag:eq(0)
    const transformRule = (r: string) => {
        // 兼容 class. 多类写法："class.c_row cf" -> ".c_row.cf"
        if (r.startsWith('class.') && /\s/.test(r)) {
            const rest = r.substring(6).trim();
            const classes = rest.split(/\s+/).filter(Boolean);
            return classes.map(cls => `.${cls}`).join('');
        }
        return r
            .replace(/id\.(\w+)/g, '#$1')     // id.xxx -> #xxx
            .replace(/class\.(\w+)/g, '.$1')  // class.xxx -> .xxx
            .replace(/\.(\d+)/g, ':eq($1)')   // .0 -> :eq(0)
            .replace(/!([0-9]+)/g, ':not(:eq($1))'); // li!0 -> li:not(:eq(0))
    };

    const parts = rule.split('##');
    const regexPart = parts[1];
    
    // 处理 @ 分隔符：可能是 parent@child 或 selector@attr
    const selectorOptions = parts[0].split('||');

    let finalResult: any = isList ? [] : '';
    
    for (const selectorOption of selectorOptions) {
        // 处理多层@：parent@child@attr 或 parent@child@grandchild 等
        const atParts = selectorOption.split('@');
        let attribute: string | null = null;
        let selectorParts: string[] = [];
        
        // 最后一部分可能是属性名
        const lastPart = atParts[atParts.length - 1];
        const isAttribute = lastPart && !lastPart.match(/^(id\.|class\.|tag\.|\w+\.|\d+|\s)/);
        
        if (isAttribute && atParts.length > 1) {
            // 最后一部分是属性
            attribute = lastPart;
            selectorParts = atParts.slice(0, -1);
        } else {
            // 全部都是选择器
            selectorParts = atParts;
        }
        
        // 转换并组合选择器
        const currentSelector = selectorParts
            .map(part => transformRule(part))
            .join(' ');  // 用空格连接，形成后代选择器

        if (isList) {
             $(currentSelector).each((_i: number, el: any) => {
                const itemHtml = $.html(el);
                 (finalResult as any[]).push(itemHtml);
            });
            if(finalResult.length > 0) break;

        } else {
            const el = $(currentSelector).first();
            let extractedText: string = '';

            if (attribute) {
                 if (attribute === 'text') {
                    extractedText = el.text() || '';
                } else if (attribute === 'html') {
                    extractedText = el.html() || '';
                } else {
                    extractedText = el.attr(attribute) || '';
                }
            } else {
                extractedText = el.text() || '';
            }

            let result = (extractedText || '').trim();

            if (regexPart) {
                try {
                    const regex = new RegExp(regexPart);
                    const match = result.match(regex);
                    result = match ? (match[1] ?? match[0]) : '';
                } catch (e: any) {
                    console.error(`Invalid regex: ${regexPart}`, e.message);
                }
            }
            
            // 处理相对URL：只对URL属性（href、src）做转换
            // 其他文本属性（text、html）不做URL转换
            const isUrlAttribute = attribute && ['href', 'src', 'url'].includes(attribute);
            const needsUrlConversion = isUrlAttribute && 
                                       result && 
                                       !result.startsWith('http') && 
                                       !result.startsWith('data:') && 
                                       !result.startsWith('//');
            
            if (needsUrlConversion) {
                try {
                    // 使用new URL处理相对路径
                    const resolvedUrl = new URL(result, baseUrl);
                    result = resolvedUrl.href;
                } catch(e) {
                    // Not a valid URL path, return as is
                    console.warn(`[parseSingleRule] 无法解析URL: base="${baseUrl}", path="${result}"`);
                }
            }
            
            if(result) {
                finalResult = result.trim();
                break;
            }
        }
    }

    return finalResult;
}

export function parseWithRules(data: string | object, rule: string | undefined, baseUrl: string): string {
    if (!rule) return '';

    return rule.split('&&').map(subRule => {
        return parseSingleRule(data, subRule, baseUrl, false) as string;
    }).join('');
}


export function parseListWithRules(data: string, listRule: string | undefined, itemRules: { [key: string]: string | undefined }, baseUrl: string): any[] {
    if (!listRule) return [];
    
    let jsonData: any = null;
    let isJson = false;
    try {
        jsonData = JSON.parse(data);
        isJson = true;
        console.log(`[parseListWithRules] ✅ 数据是JSON格式`);
    } catch (e) {
        console.log(`[parseListWithRules] 数据是HTML格式`);
    }

    if (isJson && listRule.startsWith('$.')) {
        const dataList: any[] = parseSingleRule(jsonData, listRule, baseUrl, true);
        console.log(`[parseListWithRules] JSON解析: listRule="${listRule}" 找到 ${dataList?.length || 0} 条记录`);
        
        if(!Array.isArray(dataList)) {
            console.log(`[parseListWithRules] ⚠️ 解析结果不是数组:`, typeof dataList);
            return [];
        }

        return dataList.map((item, index) => {
            const resultItem: any = {};
            for (const key in itemRules) {
                const rule = itemRules[key];
                if (rule) {
                   resultItem[key] = parseWithRules(item, rule, baseUrl);
                }
            }
            if (index < 3) {
                console.log(`[parseListWithRules] 第 ${index + 1} 条记录解析结果:`, JSON.stringify(resultItem, null, 2).substring(0, 200));
            }
            return resultItem;
        });

    } else {
        const elementsHtml: string[] = parseSingleRule(data, listRule, baseUrl, true);
        console.log(`[parseListWithRules] HTML解析: listRule="${listRule}" 找到 ${elementsHtml?.length || 0} 个元素`);
        
        return elementsHtml.map((elementHtml, index) => {
            const item: any = {};
            for (const key in itemRules) {
                const rule = itemRules[key];
                if (rule) {
                    item[key] = parseWithRules(elementHtml, rule, baseUrl);
                }
            }
            if (index < 3) {
                console.log(`[parseListWithRules] 第 ${index + 1} 个元素解析结果:`, JSON.stringify(item, null, 2).substring(0, 200));
            }
            return item;
        });
    }
}
