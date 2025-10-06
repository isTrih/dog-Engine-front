import * as cheerio from "cheerio";
import { VM } from "vm2";
import type { BookSource } from "./types";

export { parseRuleWithCssJs } from "./book-source-rule-parser";
// 重新导出书源存储函数以保持向后兼容
export { getBookSources, saveBookSources } from "./book-source-storage-edge";

const getHostsFromComment = (
	comment: string = "",
	jsLib: string = "",
	loginUrl: string = "",
): string[] => {
	const combinedScript = `${comment}\n${jsLib}\n${loginUrl}`;

	// 方法1: 查找 const host = [...]
	let match = combinedScript.match(/const\s+host\s*=\s*(\[[\s\S]*?\])/);
	if (match && match[1]) {
		try {
			const vm = new VM();
			return vm.run(`module.exports = ${match[1]};`);
		} catch (e) {
			// console.error('Could not parse hosts from script', e);
		}
	}

	// 方法2: 查找 encodedEndpoints（大灰狼书源格式）
	match = combinedScript.match(
		/const\s+encodedEndpoints\s*=\s*\[([\s\S]*?)\];/,
	);
	if (match && match[1]) {
		try {
			// 提取所有单引号包裹的字符串
			const base64Strings = match[1].match(/'([^']+)'/g) || [];
			// console.log(`[getHostsFromComment] 找到 ${base64Strings.length} 个 encodedEndpoints`);

			const decodedHosts = base64Strings
				.map((s) => s.replace(/'/g, "").trim())
				.filter((s) => s.length > 0)
				.map((b64) => {
					try {
						const decoded = Buffer.from(b64, "base64").toString("utf-8");
						// console.log(`[getHostsFromComment] 解码: ${b64.substring(0, 20)}... → ${decoded}`);
						return decoded;
					} catch (e) {
						// console.error(`[getHostsFromComment] Base64解码失败: ${b64}`, e);
						return null;
					}
				})
				.filter(
					(h) => h && (h.startsWith("http://") || h.startsWith("https://")),
				);

			if (decodedHosts.length > 0) {
				// console.log(`[getHostsFromComment] ✅ 从 encodedEndpoints 解码得到 ${decodedHosts.length} 个有效服务器`);
				return decodedHosts as string[];
			} else {
				// console.log(`[getHostsFromComment] ⚠️ encodedEndpoints 解码后没有有效的HTTP服务器`);
			}
		} catch (e) {
			// console.error('[getHostsFromComment] 解析 encodedEndpoints 失败:', e);
		}
	} else {
		// console.log(`[getHostsFromComment] 未找到 encodedEndpoints 定义`);
	}

	return [];
};

const createSandbox = (
	source: BookSource | undefined,
	key?: string,
	page?: number,
	result?: any,
	overrideBaseUrl?: string,
) => {
	const variableMap: Record<string, any> = {
		_open_argument: source?.loginUi || "{}",
	};

	const hosts = getHostsFromComment(
		source?.comment,
		source?.jsLib,
		source?.loginUrl,
	);
	// console.log(`[createSandbox] 为书源 "${source?.name}" 提取到 ${hosts.length} 个服务器:`, hosts.length > 0 ? hosts[0] : '无');

	const sandbox = {
		java: {
			ajax: (url: string) => {
				// 🔧 同步网络请求的 polyfill 使用 child_process.execSync
				// console.log(`[Mock] java.ajax called: ${url.substring(0, 200)}`);
				try {
					if (typeof window === "undefined") {
						// 服务端：使用 curl 进行同步请求
						const { execSync } = require("child_process");
						// 尝试为请求自动带上 Referer 及常见头
						let referer = "";
						let actualUrl = String(url);

						// 处理 Legado 格式: URL,{options}
						if (actualUrl.includes(",{")) {
							const parts = actualUrl.split(",{");
							actualUrl = parts[0];
							// console.log(`[Mock] java.ajax: 提取URL: ${actualUrl}`);
						}

						try {
							const u = new URL(actualUrl);
							referer = `${u.protocol}//${u.host}/`;
						} catch {}
						const headerParts = [
							'-H "User-Agent: Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36"',
							'-H "Accept: application/json,text/plain,*/*"',
							'-H "versiontype: reading"',
							referer ? `-H "Referer: ${referer}"` : "",
						]
							.filter(Boolean)
							.join(" ");
						const command = `curl -s -L ${headerParts} "${actualUrl}"`;
						const responseData = execSync(command, {
							encoding: "utf-8",
							timeout: 10000,
						});
						// console.log(`[Mock] java.ajax succeeded, response length: ${responseData.length}`);
						return responseData;
					} else {
						// 客户端：无法同步请求
						console.warn(`[Mock] ⚠️ java.ajax 在浏览器中无法同步执行`);
						return JSON.stringify({ data: [] });
					}
				} catch (e) {
					console.error(`[Mock] java.ajax failed:`, e);
					return JSON.stringify({ data: [] });
				}
			},
			get: (arg: string, _opts?: any) => {
				// Overloaded: when arg looks like URL → do HTTP GET and return { body(), header(name) }
				// otherwise → act as key-value getter
				// 判断是 HTTP 请求还是 key-value getter
				if (
					typeof arg === "string" &&
					(/^https?:\/\//i.test(arg) || /^data:/i.test(arg))
				) {
					// console.log(`[Mock] java.get: 请求 URL = ${arg.substring(0, 200)}`);
					try {
						if (typeof window === "undefined") {
							const { execSync } = require("child_process");
							let referer = "";
							try {
								const u = new URL(arg);
								referer = `${u.protocol}//${u.host}/`;
							} catch {}
							const command = `curl -i -s -L \
 -H "User-Agent: Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36" \
 -H "Accept: application/json,text/plain,*/*" \
 -H "versiontype: reading" \
 ${referer ? `-H "Referer: ${referer}"` : ""} \
 "${arg}"`;
							const resp = execSync(command, {
								encoding: "utf-8",
								timeout: 10000,
							});
							const parts = resp.split(/\r?\n\r?\n/);
							let headerText = "";
							let bodyText = "";
							if (parts.length >= 2) {
								headerText = parts.slice(0, -1).join("\n\n");
								bodyText = parts[parts.length - 1];
							} else {
								bodyText = resp;
							}
							const headers: Record<string, string> = {};
							headerText.split(/\r?\n/).forEach((line: string) => {
								const idx = line.indexOf(":");
								if (idx > 0) {
									const k = line.substring(0, idx).trim().toLowerCase();
									const v = line.substring(idx + 1).trim();
									if (k) headers[k] = v;
								}
							});
							// console.log(`[Mock] java.get body length: ${bodyText.length}`);
							return {
								body: () => bodyText,
								header: (name: string) =>
									headers[String(name || "").toLowerCase()] || "",
							};
						}
					} catch (e: any) {
						console.warn("[Mock] java.get http failed:", (e && e.message) || e);
					}
					// HTTP 分支失败，返回空响应对象
					return { body: () => "", header: (_: string) => "" };
				}
				// key-value getter
				return variableMap[arg as any];
			},
			put: (key: string, value: any) => {
				variableMap[key] = value;
			},
			base64Encode: (str: string) => Buffer.from(str).toString("base64"),
			base64Decode: (str: string) =>
				Buffer.from(str, "base64").toString("utf-8"),
			hexDecodeToString: (hex: string) =>
				Buffer.from(hex, "hex").toString("utf-8"),
			createSymmetricCrypto: (algorithm: string, key: string, iv: string) => {
				// Support DES/CBC/PKCS5Padding decrypt used in 晋江
				// console.log(`[Mock] java.createSymmetricCrypto: ${algorithm}`);
				const crypto = require("crypto");
				const algo =
					algorithm && /DES\/CBC/i.test(algorithm) ? "des-cbc" : "des-cbc";
				const keyBuf = Buffer.from(key, "utf8");
				const ivBuf = Buffer.from(iv, "utf8");
				return {
					encryptBase64: (data: string) => {
						try {
							const cipher = crypto.createCipheriv(algo, keyBuf, ivBuf);
							let enc = cipher.update(data, "utf8", "base64");
							enc += cipher.final("base64");
							return enc;
						} catch (e: any) {
							console.warn(
								"[Mock] encryptBase64 failed:",
								(e && e.message) || e,
							);
							return Buffer.from(data).toString("base64");
						}
					},
					decryptStr: (data: string) => {
						try {
							// Try base64 first; fallback to hex/raw
							let buf: Buffer;
							try {
								buf = Buffer.from(data, "base64");
							} catch {
								buf = Buffer.from(data, "hex");
							}
							const decipher = crypto.createDecipheriv(algo, keyBuf, ivBuf);
							let dec = decipher.update(buf, undefined, "utf8");
							dec += decipher.final("utf8");
							return dec;
						} catch (e: any) {
							console.warn("[Mock] decryptStr failed:", (e && e.message) || e);
							return "";
						}
					},
				};
			},
			md5Encode: (str: string) => {
				const crypto = require("crypto");
				return crypto
					.createHash("md5")
					.update(String(str), "utf8")
					.digest("hex");
			},
			// 提供 getString(rule) 以便 @js: 中快速按规则提取字符串
			getString: (rule: string) => {
				try {
					const htmlOrJson = (sandbox as any).result ?? "";
					const base = (sandbox as any).baseUrl || "";
					return parseWithRules(htmlOrJson, String(rule), base, source);
				} catch (e) {
					return "";
				}
			},
			setContent: (content: string) => {
				// console.log(`[Mock] java.setContent called, content length: ${content.length}`);
				variableMap["_jjcontent_"] = content;
				// 关键：更新 sandbox 的 result，让后续的模板 {{$.xxx}} 能正确解析
				try {
					if (
						typeof content === "string" &&
						(content.trim().startsWith("{") || content.trim().startsWith("["))
					) {
						const parsed = JSON.parse(content);
						(sandbox as any).result = parsed;
						// console.log(`[Mock] java.setContent: 已更新 sandbox.result 为解析后的JSON对象`);
					}
				} catch (e) {
					// console.warn(`[Mock] java.setContent: JSON解析失败，保持原样`);
				}
			},
			getElement: (selector: string) => {
				// console.log(`[Mock] java.getElement: ${selector}`);
				return {
					text: () => "",
					html: () => "",
				};
			},
			// Mock Android APP methods
			log: (msg: any) => {
				// console.log(`[Mock] java.log:`, msg);
			},
			toast: (msg: string) => {
				// console.log(`[Mock] java.toast: ${msg}`);
			},
			longToast: (msg: string) => {
				// console.log(`[Mock] java.longToast: ${msg}`);
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
				// console.log(`[Mock] java.getCookie: ${domain}`);
				return "";
			},
			startBrowser: (url: string, title: string) => {
				// console.log(`[Mock] java.startBrowser: ${url}, title: ${title}`);
			},
			startBrowserAwait: (url: string, title: string) => {
				// console.log(`[Mock] java.startBrowserAwait: ${url}, title: ${title}`);
			},
		},
		cookie: {
			getCookie: (url: string) => {
				// console.log(`[Mock] cookie.getCookie: ${url}`);
				return "";
			},
		},
		cache: {
			get: (key: string) => {
				// console.log(`[Mock] cache.get: ${key}`);
				return null;
			},
			put: (key: string, value: any) => {
				// console.log(`[Mock] cache.put: ${key} = ${value}`);
			},
		},
		source: {
			...source,
			getVariable: () => variableMap._open_argument,
			setVariable: (v: string) => {
				variableMap._open_argument = v;
			},
			getLoginInfoMap: () => {
				// console.log(`[Mock] source.getLoginInfoMap`);
				return {};
			},
			getLoginHeaderMap: () => {
				// console.log(`[Mock] source.getLoginHeaderMap`);
				return { get: (key: string) => variableMap[key] || "" };
			},
		},
		key: key || "",
		page: page || 1,
		result,
		baseUrl: overrideBaseUrl || source?.url || "",
		// 🔧 Legado 常用全局辅助函数
		bDe: (str: string) => {
			// 仅解码 data:*base64, 后的有效部分，避免误把整串当作base64
			try {
				if (typeof str !== "string") return str as any;
				const m = str.match(/base64,([^,}]+)$/);
				if (m) {
					return Buffer.from(m[1], "base64").toString("utf-8");
				}
				// 尝试普通base64
				if (/^[A-Za-z0-9+/=]+$/.test(str)) {
					return Buffer.from(str, "base64").toString("utf-8");
				}
				return str;
			} catch (e) {
				return str;
			}
		},
		bEn: (str: string) => {
			// base64 encode
			return Buffer.from(str).toString("base64");
		},
		getNid: (url: string) => {
			// 从 URL 中提取小说ID (novelId)
			// 支持多种格式：novelId=xxx, novelId:xxx, 或 base64 编码的
			// console.log(`[getNid] 输入 URL: ${url}`);
			try {
				// 先尝试直接匹配
				let match = url.match(/novelId[=:](\d+)/i);
				if (match) {
					// console.log(`[getNid] 直接匹配成功: ${match[1]}`);
					return match[1];
				}

				// 尝试 base64 decode
				if (url.includes("base64,")) {
					const base64Part = url.split("base64,")[1].split(",")[0];
					// console.log(`[getNid] Base64 部分: ${base64Part}`);
					const decoded = Buffer.from(base64Part, "base64").toString("utf-8");
					// console.log(`[getNid] 解码后: ${decoded}`);
					match = decoded.match(/novelId[=:](\d+)/i);
					if (match) {
						// console.log(`[getNid] Base64 解码后匹配成功: ${match[1]}`);
						return match[1];
					}
				}

				// console.warn(`[getNid] 未能提取 novelId`);
				return "";
			} catch (e) {
				// console.error(`[getNid] 错误:`, e);
				return "";
			}
		},
		Map: (key: string) => {
			// 获取存储的登录信息
			return variableMap[key] || "";
		},
		encode: (str: string) => {
			// URL 编码或加密（简化实现）
			// 晋江用这个函数生成签名，具体算法不明，先返回 base64
			return Buffer.from(str).toString("base64");
		},
		book: {
			...(result || {}),
			getVariable: (key: string) => {
				// 获取书籍变量
				return variableMap[`book_${key}`] || "";
			},
			setVariable: (key: string, value: any) => {
				// 设置书籍变量
				variableMap[`book_${key}`] = value;
			},
		},
		chapter: result || {}, // 添加chapter对象
		getArguments: (open_argument: string, key: string) => {
			let args: any;
			try {
				args = JSON.parse(open_argument);
			} catch (e) {
				args = {};
			}

			const defaults = {
				media: "小说",
				server: hosts.length > 0 ? hosts[0] : "",
				source: source?.name,
			};
			const finalArgs = { ...defaults, ...args };

			if (key === "server") {
				// console.log(`[getArguments] 返回 server = "${finalArgs[key]}" (来自: ${args.server ? '用户配置' : '默认值'})`);
			}

			return key ? finalArgs[key] : finalArgs;
		},
		// 添加 Date 对象和其他全局变量（明确指定属性名）
		Date: Date,
		String: String,
		Number: Number,
		JSON: JSON,
		Math: Math,
		Object: Object,
		Array: Array,
	};

	if (source?.jsLib) {
		const vm = new VM({ sandbox });
		vm.run(source.jsLib);
	}

	return sandbox;
};

export async function evaluateJs(
	script: string,
	context: {
		key?: string;
		page?: number;
		source?: BookSource;
		result?: any;
		cheerioElements?: any;
		baseUrl?: string;
	},
): Promise<string> {
	let result: string;
	const sandbox = createSandbox(
		context.source,
		context.key,
		context.page,
		context.result,
		context.baseUrl,
	);
	if (context.cheerioElements) {
		(sandbox as any).$ = context.cheerioElements;
	}
	const vm = new VM({ timeout: 5000, sandbox, eval: false, wasm: false });

	if (!script.startsWith("<js>")) {
		result = script;
	} else {
		const jsCode = script.substring(4, script.length - 5);
		try {
			const vmResult = vm.run(jsCode);
			result = String(vmResult);
		} catch (e: any) {
			console.error(
				"Error evaluating JS:",
				e.message,
				"\nScript:",
				jsCode.substring(0, 200) + "...",
			);
			// 不要抛出错误，返回空字符串，让解析继续
			// 这样可以容错处理复杂的多段 JS 规则
			result = "";
		}
	}

	// 占位符替换
	const currentPage = context.page || 1;
	result = result
		.replace(/\{\{key\}\}/g, context.key || "")
		.replace(/\{\{page\}\}/g, String(currentPage))
		.replace(/\{\{source\}\}/g, context.source?.name || "")
		.replace(/\{\{baseUrl\}\}/g, context.baseUrl || "");

	// 支持 {{source.xxx}} 访问书源字段
	result = result.replace(/\{\{\s*source\.(\w+)\s*\}\}/g, (_m, prop) => {
		try {
			return String((context.source as any)?.[prop] ?? "");
		} catch {
			return "";
		}
	});

	// 简单表达式：{{page -1}} / {{page+1}}
	result = result.replace(
		/\{\{\s*page\s*([+-])\s*(\d+)\s*\}\}/g,
		(_m, op, num) => {
			const n = parseInt(num, 10) || 0;
			const value = op === "+" ? currentPage + n : currentPage - n;
			return String(value);
		},
	);

	// 支持调用 jsLib 中的 host(): {{host()}}
	result = result.replace(/\{\{\s*host\(\)\s*\}\}/g, () => {
		try {
			const v = vm.run("host()");
			return String(v);
		} catch {
			return "";
		}
	});

	// 🆕 支持任意JS表达式：{{(page-1)*25}}, {{page*10}}, 等等
	// 必须放在最后，避免覆盖前面的特定模板
	result = result.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
		// 跳过已处理的特定格式
		if (
			expr.trim() === "key" ||
			expr.trim() === "page" ||
			expr.trim() === "source" ||
			expr.trim() === "baseUrl" ||
			expr.match(/^source\./)
		) {
			return match; // 保持原样，让前面的规则处理
		}

		try {
			// 执行表达式
			const value = vm.run(expr);
			return String(value);
		} catch (e) {
			console.warn(`[evaluateJs] 无法计算表达式: ${expr}`, e);
			return match; // 保持原样
		}
	});

	return result;
}

/**
 * 运行一段 JS 片段作为“变换器”。
 * 将入参作为 result 注入，执行 snippet 后返回 result 字符串。
 */
export async function runJsTransformer(
	snippet: string,
	context: {
		key?: string;
		page?: number;
		source?: BookSource;
		result?: any;
		baseUrl?: string;
	},
): Promise<string> {
	const wrapped = `<js>var result = ${JSON.stringify(context.result)};\n${snippet}\n;String(result)</js>`;
	return evaluateJs(wrapped, context);
}

/**
 * 如果书源配置了 coverDecodeJs，则对封面地址做解码/补全
 */
export async function decodeCoverIfNeeded(
	coverUrl: string | undefined,
	source?: BookSource,
): Promise<string | undefined> {
	if (!coverUrl || !source?.coverDecodeJs) return coverUrl;
	try {
		const out = await runJsTransformer(source.coverDecodeJs, {
			source,
			result: coverUrl,
		});
		return out || coverUrl;
	} catch {
		return coverUrl;
	}
}

function parseSingleRule(
	data: string | object,
	rule: string,
	baseUrl: string,
	isList: boolean = false,
): any {
	if (!rule) return isList ? [] : "";

	if (typeof data === "object") {
		// 支持 $.path 以及 简写 path（允许点号）两种对象取值方式
		const normalizePath = (raw: string) =>
			raw.startsWith("$.") ? raw.substring(2) : raw;
		// 允许 '$.'（表示整个对象）以及 '$.path' 或 'path'
		const isPropPath = (raw: string) => /^(?:\$\.)?[A-Za-z0-9_.]*$/.test(raw);

		if (isPropPath(rule)) {
			const path = normalizePath(rule);
			if (path === "") return data;
			let value: any = data;
			for (const key of path.split(".")) {
				if (value && typeof value === "object" && key in value) {
					value = value[key];
				} else {
					return isList ? [] : "";
				}
			}
			return value;
		}
		return isList ? [] : "";
	}

	// From here, data is HTML string
	const $ = cheerio.load(data);

	// Rule transformation:
	// id.xxx -> #xxx
	// class.xxx -> .xxx
	// tag.0 -> tag:eq(0)
	const transformRule = (r: string) => {
		// 兼容 class. 多类写法："class.c_row cf" -> ".c_row.cf"
		if (r.startsWith("class.") && /\s/.test(r)) {
			const rest = r.substring(6).trim();
			const classes = rest.split(/\s+/).filter(Boolean);
			return classes.map((cls) => `.${cls}`).join("");
		}
		return r
			.replace(/id\.(\w+)/g, "#$1") // id.xxx -> #xxx
			.replace(/class\.(\w+)/g, ".$1") // class.xxx -> .xxx
			.replace(/\.(\d+)/g, ":eq($1)") // .0 -> :eq(0)
			.replace(/!([0-9]+)/g, ":not(:eq($1))"); // li!0 -> li:not(:eq(0))
	};

	const parts = rule.split("##");
	const regexPart = parts[1];

	// 处理 @ 分隔符：可能是 parent@child 或 selector@attr
	const selectorOptions = parts[0].split("||");
	// 兼容纯文本（没有任何 CSS 选择器符号且包含中文/英文/空格/符号）的情形，直接返回该文本
	if (!/[#.[@:]/.test(parts[0]) && /[\u4e00-\u9fa5A-Za-z]/.test(parts[0])) {
		return parts[0];
	}

	let finalResult: any = isList ? [] : "";

	for (const selectorOption of selectorOptions) {
		// 处理多层@：parent@child@attr 或 parent@child@grandchild 等
		const atParts = selectorOption.split("@");
		let attribute: string | null = null;
		let selectorParts: string[] = [];

		// 最后一部分可能是属性名
		const lastPart = atParts[atParts.length - 1];
		const isAttribute =
			lastPart && !lastPart.match(/^(id\.|class\.|tag\.|\w+\.|\d+|\s)/);

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
			.map((part) => transformRule(part))
			.join(" "); // 用空格连接，形成后代选择器

		if (isList) {
			if (!currentSelector.trim()) {
				continue; // 跳过空选择器，避免 Empty sub-selector
			}
			$(currentSelector).each((_i: number, el: any) => {
				const itemHtml = $.html(el);
				(finalResult as any[]).push(itemHtml);
			});
			if (finalResult.length > 0) break;
		} else {
			if (!currentSelector.trim()) {
				continue; // 跳过空选择器，避免 Empty sub-selector
			}
			const el = $(currentSelector).first();
			let extractedText: string = "";

			if (attribute) {
				if (attribute === "text") {
					extractedText = el.text() || "";
				} else if (attribute === "html") {
					extractedText = el.html() || "";
				} else {
					extractedText = el.attr(attribute) || "";
				}
			} else {
				extractedText = el.text() || "";
			}

			let result = (extractedText || "").trim();

			if (regexPart) {
				try {
					const regex = new RegExp(regexPart);
					const match = result.match(regex);
					result = match ? (match[1] ?? match[0]) : "";
				} catch (e: any) {
					console.error(`Invalid regex: ${regexPart}`, e.message);
				}
			}

			// 处理相对URL：只对URL属性（href、src）做转换
			// 其他文本属性（text、html）不做URL转换
			const isUrlAttribute =
				attribute && ["href", "src", "url"].includes(attribute);
			const needsUrlConversion =
				isUrlAttribute &&
				result &&
				!result.startsWith("http") &&
				!result.startsWith("data:") &&
				!result.startsWith("//");

			if (needsUrlConversion) {
				try {
					// 使用new URL处理相对路径
					const resolvedUrl = new URL(result, baseUrl);
					result = resolvedUrl.href;
				} catch (e) {
					// Not a valid URL path, return as is
					console.warn(
						`[parseSingleRule] 无法解析URL: base="${baseUrl}", path="${result}"`,
					);
				}
			}

			if (result) {
				finalResult = result.trim();
				break;
			}
		}
	}

	return finalResult;
}

export async function parseWithRules(
	data: string | object,
	rule: string | undefined,
	baseUrl: string,
	source?: BookSource,
): Promise<string> {
	if (!rule) return "";

	// 🔧 检查是否是纯 JS 规则（<js>...</js>）
	if (rule.trim().startsWith("<js>") && rule.trim().endsWith("</js>")) {
		// console.log(`[parseWithRules] 检测到纯 JS 规则，执行...`);
		try {
			const processed = await evaluateJs(rule, {
				source: source,
				result: data,
				baseUrl: baseUrl,
			});
			return String(processed || "");
		} catch (e) {
			console.error(`[parseWithRules] JS执行失败:`, e);
			return "";
		}
	}

	// 🔧 检查是否是 @js: 规则（CSS后跟JS处理）
	if (rule.includes("@js:")) {
		const jsIndex = rule.indexOf("@js:");
		const selectorPart = rule.substring(0, jsIndex).trim();
		const jsPart = rule.substring(jsIndex + 4).trim();

		// console.log(`[parseWithRules] 检测到 @js: 规则`);

		// 如果没有选择器部分（@js: 在开头），直接用整个 data 作为 result
		// 这样 JS 代码可以直接访问对象属性（如 $.chaptername）
		const wrappedJs = `<js>\nvar baseUrl = "${baseUrl}";\n${jsPart}\nresult\n</js>`;

		try {
			const processed = await evaluateJs(wrappedJs, {
				source: source,
				result: data, // 传入完整数据对象
				baseUrl: baseUrl,
			});
			return String(processed || "");
		} catch (e) {
			console.error(`[parseWithRules] @js: 执行失败:`, e);
			return "";
		}
	}

	// 检查是否是 @JSon: 规则（用于单个字段）
	if (rule.match(/^@JSon:|^@Json:/i)) {
		//console.log(`[parseWithRules] 检测到 @JSon: 规则`);
		if (typeof data === "string") {
			try {
				data = JSON.parse(data);
			} catch (e) {
				console.warn(`[parseWithRules] 数据不是有效JSON，无法使用@JSon规则`);
				return "";
			}
		}
		const { parseJsonRule } = require("./jsonpath-parser");
		const parseResult = parseJsonRule(data, rule);

		// 处理JS后处理
		if (
			parseResult &&
			typeof parseResult === "object" &&
			"result" in parseResult &&
			"jsCode" in parseResult
		) {
			try {
				// src = 原始完整数据的JSON字符串
				// result = 提取出的值（封面URL等）
				const srcData = typeof data === "string" ? data : JSON.stringify(data);
				const wrappedJs = `<js>\nvar src = ${JSON.stringify(srcData)};\nvar result = ${JSON.stringify(parseResult.result)};\nvar baseUrl = "${baseUrl}";\n${parseResult.jsCode}\nresult\n</js>`;
				const processed = await evaluateJs(wrappedJs, {
					source: undefined,
					result: data, // 传入完整数据，让 java.setContent 能访问
				});

				//console.log(`[parseWithRules] JS处理完成，结果: ${typeof processed === 'string' ? processed.substring(0, 200) : typeof processed}`);

				// 如果结果包含模板 {{...}}，需要二次解析
				if (typeof processed === "string" && processed.includes("{{")) {
					//console.log(`[parseWithRules] 检测到模板，进行二次解析: ${processed.substring(0, 200)}`);
					// 从原始数据中解析模板
					const finalResult = await parseWithRules(data, processed, baseUrl);
					//console.log(`[parseWithRules] 模板解析完成，最终结果: ${finalResult.substring(0, 200)}`);
					return finalResult;
				}

				return String(processed || "");
			} catch (e) {
				console.error(`[parseWithRules] JS后处理失败:`, e);
				return String(parseResult.result || "");
			}
		}

		return String(parseResult || "");
	}

	// 检查是否包含 @put:{} 语法（Legado用于从JSON提取值并替换到URL中）
	if (rule.includes("@put:") && typeof data === "object") {
		//console.log(`[parseWithRules] 检测到 @put: 语法，原规则: ${rule}`);

		// 先处理所有 {{...}} 模板
		const extractedValues = new Map<string, string>();
		if (rule.includes("{{")) {
			const templateMatches = Array.from(rule.matchAll(/\{\{([^}]+)\}\}/g));
			for (const templateMatch of templateMatches) {
				const [fullMatch, templatePath] = templateMatch;
				try {
					const templateValue = await parseWithRules(
						data,
						templatePath,
						baseUrl,
					);
					extractedValues.set(templatePath, templateValue);
					rule = rule.replace(fullMatch, templateValue);
					//console.log(`[parseWithRules] 模板 ${templatePath} = ${templateValue}`);
				} catch (e) {
					console.warn(`[parseWithRules] 模板解析失败: ${templatePath}`);
					rule = rule.replace(fullMatch, "");
				}
			}
		}

		// 再处理 @put:{}
		const putMatches = Array.from(rule.matchAll(/@put:\{([^}]+)\}/g));
		for (const putMatch of putMatches) {
			const [fullMatch, putRule] = putMatch;
			const colonIndex = putRule.indexOf(":");
			if (colonIndex === -1) continue;

			const putKey = putRule.substring(0, colonIndex).trim();
			const putPath = putRule.substring(colonIndex + 1).trim();

			// 检查是否已经提取过这个路径的值
			let value: string;
			if (extractedValues.has(putPath)) {
				value = extractedValues.get(putPath)!;
				//console.log(`[parseWithRules] @put 使用已提取的值: ${putKey}=${value}`);
				// 如果已经提取过，直接删除 @put:{}，不要重复添加值
				rule = rule.replace(fullMatch, "");
			} else {
				// 解析路径获取值
				value = await parseWithRules(data, putPath, baseUrl);
				//console.log(`[parseWithRules] @put 提取: ${putKey}=${value}`);
				// 替换 @put:{} 为提取的值
				rule = rule.replace(fullMatch, value);
			}
		}

		//console.log(`[parseWithRules] 最终规则: ${rule}`);
		// 🔧 @put 处理完成后，规则已经是完整的URL，直接返回
		return rule;
	}

	// 对象数据：增强支持占位模板、'||' 备选和 '&&' 取首个非空
	if (typeof data === "object") {
		const tryEvaluateTemplate = (tpl: string): string => {
			if (!tpl.includes("{{")) return "";
			//console.log(`[tryEvaluateTemplate] 开始解析模板: ${tpl.substring(0, 200)}`);
			const result = tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
				//console.log(`[tryEvaluateTemplate] 解析表达式: ${expr}`);
				const value = parseSingleRule(
					data,
					String(expr).trim(),
					baseUrl,
					false,
				);
				//console.log(`[tryEvaluateTemplate] 表达式 "${expr}" 的值: ${value}`);
				return String(value ?? "");
			});
			//console.log(`[tryEvaluateTemplate] 模板解析结果: ${result.substring(0, 200)}`);
			return result;
		};

		// 如果是 URL 模板或包含占位，优先做模板替换
		if (rule.includes("{{")) {
			//console.log(`[parseWithRules] 检测到模板规则: ${rule.substring(0, 200)}`);
			const replaced = tryEvaluateTemplate(rule);
			if (replaced) {
				//console.log(`[parseWithRules] 模板替换完成，返回: ${replaced.substring(0, 200)}`);
				return replaced;
			}
		}

		// 支持多备选 'alt1||alt2'，每个备选内部按 '&&' 拆分，取第一个非空值
		const alternatives = rule
			.split("||")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const alt of alternatives) {
			const parts = alt
				.split("&&")
				.map((s) => s.trim())
				.filter(Boolean);
			for (const part of parts) {
				const val = String(
					parseSingleRule(data, part, baseUrl, false) || "",
				).trim();
				if (val) return val;
			}
		}
		// 没有 '||' 的情况：保留原有 '&&' 语义为串联，但若其中某个子结果非空则返回拼接
		const concatenated = rule
			.split("&&")
			.map((subRule) =>
				String(parseSingleRule(data, subRule, baseUrl, false) || ""),
			)
			.join("");
		return concatenated;
	}

	// 字符串(HTML)数据：沿用原先 '&&' 连接，'||' 在 parseSingleRule 内处理
	return rule
		.split("&&")
		.map((subRule) => {
			return parseSingleRule(data, subRule, baseUrl, false) as string;
		})
		.join("");
}

export async function parseListWithRules(
	data: string,
	listRule: string | undefined,
	itemRules: { [key: string]: string | undefined },
	baseUrl: string,
	source?: BookSource,
): Promise<any[]> {
	if (!listRule) return [];

	// 🔧 优先检查规则中是否包含 JS 代码（即使数据是 HTML）
	// 这种情况下，JS 代码会先处理数据，再用后续规则提取列表
	if (listRule.includes("<js>") && listRule.includes("</js>")) {
		//console.log(`[parseListWithRules] 规则包含 JS 代码，先执行 JS 预处理`);
		try {
			// 提取第一段 JS 代码（用于数据预处理）
			const firstJsMatch = listRule.match(/<js>([\s\S]*?)<\/js>/);
			if (firstJsMatch) {
				const jsCode = firstJsMatch[1];
				// 剩余规则需要从匹配块的结尾位置开始截取，不能假定 <js> 在字符串起始
				const start =
					(firstJsMatch as any).index ?? listRule.indexOf(firstJsMatch[0]);
				const remainingRule = listRule
					.slice(start + firstJsMatch[0].length)
					.trim();

				//console.log(`[parseListWithRules] 执行数据预处理 JS，长度: ${jsCode.length}`);
				//console.log(`[parseListWithRules] baseUrl: ${baseUrl}`);

				// 执行 JS 预处理，传递 baseUrl 覆盖默认值
				const processedData = await evaluateJs(`<js>${jsCode}</js>`, {
					result: data,
					source: undefined,
					baseUrl: baseUrl, // 传递实际的 baseUrl
				});
				//console.log(`[parseListWithRules] JS 预处理完成，结果长度: ${processedData.length}`);

				// 如果还有剩余规则，递归处理
				if (remainingRule) {
					//console.log(`[parseListWithRules] 使用剩余规则继续处理: ${remainingRule.substring(0, 100)}...`);
					return await parseListWithRules(
						processedData,
						remainingRule,
						itemRules,
						baseUrl,
						source,
					);
				} else {
					// 没有剩余规则，尝试将结果解析为数组
					try {
						const result = JSON.parse(processedData);
						if (Array.isArray(result)) {
							return result;
						}
					} catch (e) {
						console.warn(`[parseListWithRules] JS 结果不是有效的 JSON 数组`);
					}
				}
			}
		} catch (e) {
			console.warn(`[parseListWithRules] JS 预处理失败，跳过并继续:`, e);
			// 不要阻止后续处理，继续使用原始数据
		}
	}

	let jsonData: any = null;
	let isJson = false;
	try {
		jsonData = JSON.parse(data);
		isJson = true;
		//console.log(`[parseListWithRules] ✅ 数据是JSON格式`);
	} catch (e) {
		//console.log(`[parseListWithRules] 数据是HTML格式`);
	}

	if (isJson) {
		// 检查是否使用 @JSon: 前缀（Legado标准格式）
		if (listRule.match(/^@JSon:|^@Json:/i)) {
			//console.log(`[parseListWithRules] 检测到 @JSon: 规则，使用增强的JSONPath解析`);
			const { parseJsonRule } = require("./jsonpath-parser");

			const parseResult = parseJsonRule(jsonData, listRule);
			let dataList: any[] = [];
			let jsCode = "";

			// 检查是否有JS后处理
			if (
				parseResult &&
				typeof parseResult === "object" &&
				"result" in parseResult &&
				"jsCode" in parseResult
			) {
				dataList = Array.isArray(parseResult.result)
					? parseResult.result
					: [parseResult.result];
				jsCode = parseResult.jsCode;
			} else {
				dataList = Array.isArray(parseResult)
					? parseResult
					: parseResult
						? [parseResult]
						: [];
			}

			//console.log(`[parseListWithRules] @JSon解析得到 ${dataList.length} 条记录`);

			// 如果有JS后处理代码，执行它
			if (jsCode) {
				//console.log(`[parseListWithRules] 执行JS后处理...`);
				try {
					// 使用evaluateJs执行JS代码
					const wrappedJs = `<js>\nvar src = result;\nvar result = src;\nvar baseUrl = "${baseUrl}";\n${jsCode}\nresult\n</js>`;
					const processedData = await evaluateJs(wrappedJs, {
						source: undefined,
						result: JSON.stringify(dataList),
					});
					try {
						dataList = JSON.parse(processedData as string);
						//console.log(`[parseListWithRules] JS后处理完成，得到 ${dataList.length} 条记录`);
					} catch (e) {
						console.warn(`[parseListWithRules] JS后处理结果不是有效JSON:`, e);
					}
				} catch (e) {
					console.error(`[parseListWithRules] JS后处理失败:`, e);
				}
			}

			if (!Array.isArray(dataList)) {
				//console.log(`[parseListWithRules] ⚠️ 解析结果不是数组:`, typeof dataList);
				return [];
			}

			const results = [];
			for (let index = 0; index < dataList.length; index++) {
				const item = dataList[index];
				const resultItem: any = {};
				for (const key in itemRules) {
					const rule = itemRules[key];
					if (rule) {
						resultItem[key] = await parseWithRules(item, rule, baseUrl);
					}
				}
				if (index < 3) {
					//console.log(`[parseListWithRules] 第 ${index + 1} 条记录解析结果:`, JSON.stringify(resultItem, null, 2).substring(0, 200));
				}
				results.push(resultItem);
			}
			return results;
		}

		// 原有的简单JSON路径解析逻辑（兼容旧书源）
		// 支持 'alt1||alt2' 以及 'a&&b&&$.path' 混合写法：优先选中 JSON 路径
		const alternatives = listRule
			.split("||")
			.map((s) => s.trim())
			.filter(Boolean);
		let selectedPath = "";
		for (const alt of alternatives) {
			// 从 a&&b&&$.path 里提取最后一个以 $. 开头的片段
			const parts = alt
				.split("&&")
				.map((p) => p.trim())
				.filter(Boolean);
			const lastJson = [...parts].reverse().find((p) => p.startsWith("$."));
			if (lastJson) {
				selectedPath = lastJson;
				break;
			}
			// 若整个 alt 本身就是 $.path
			if (alt.startsWith("$.")) {
				selectedPath = alt;
				break;
			}
		}
		// 回退：如果没有任何 $. 路径，且 listRule 本身就是 $. 开头则使用它
		if (!selectedPath && listRule.startsWith("$.")) {
			selectedPath = listRule;
		}

		if (!selectedPath) {
			// 兼容 '$.' 作为整个对象（数组）
			if (listRule.trim() === "$." && Array.isArray(jsonData)) {
				selectedPath = "$.";
			} else if (jsonData && Array.isArray((jsonData as any).chapterlist)) {
				// 晋江：JS 预处理后常返回 { chapterlist: [...] }
				//console.log(`[parseListWithRules] 未显式指定路径，自动采用 $.chapterlist[*]`);
				selectedPath = "$.chapterlist[*]";
			} else {
				//console.log(`[parseListWithRules] ⚠️ 未找到可用的 JSON 路径，返回空列表。listRule=${listRule}`);
				return [];
			}
		}

		let dataList: any[] =
			selectedPath === "$."
				? jsonData
				: parseSingleRule(jsonData, selectedPath, baseUrl, true);
		//console.log(`[parseListWithRules] JSON解析: selectedPath="${selectedPath}" 找到 ${Array.isArray(dataList) ? dataList.length : 0} 条记录`);

		// 兜底：如果规则选择为 $.[*] 但结果为空，而 jsonData.chapterlist 存在
		if (
			(!Array.isArray(dataList) || dataList.length === 0) &&
			jsonData &&
			Array.isArray((jsonData as any).chapterlist)
		) {
			//console.log(`[parseListWithRules] 兜底采用 chapterlist 数组`);
			dataList = (jsonData as any).chapterlist;
		}

		if (!Array.isArray(dataList)) {
			//console.log(`[parseListWithRules] ⚠️ 解析结果不是数组:`, typeof dataList);
			return [];
		}

		const results = [];
		for (let index = 0; index < dataList.length; index++) {
			const item = dataList[index];
			const resultItem: any = {};
			for (const key in itemRules) {
				const rule = itemRules[key];
				if (rule) {
					resultItem[key] = await parseWithRules(item, rule, baseUrl, source);
				}
			}
			if (index < 3) {
				//console.log(`[parseListWithRules] 第 ${index + 1} 条记录解析结果:`, JSON.stringify(resultItem, null, 2).substring(0, 200));
			}
			results.push(resultItem);
		}
		return results;
	} else {
		const elementsHtml: string[] = parseSingleRule(
			data,
			listRule,
			baseUrl,
			true,
		);
		//console.log(`[parseListWithRules] HTML解析: listRule="${listRule}" 找到 ${elementsHtml?.length || 0} 个元素`);

		const results = [];
		for (let index = 0; index < elementsHtml.length; index++) {
			const elementHtml = elementsHtml[index];
			const item: any = {};
			for (const key in itemRules) {
				const rule = itemRules[key];
				if (rule) {
					item[key] = await parseWithRules(elementHtml, rule, baseUrl, source);
				}
			}
			if (index < 3) {
				//console.log(`[parseListWithRules] 第 ${index + 1} 个元素解析结果:`, JSON.stringify(item, null, 2).substring(0, 200));
			}
			results.push(item);
		}
		return results;
	}
}
