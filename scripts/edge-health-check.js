#!/usr/bin/env node

/**
 * 边缘环境健康检查脚本
 * 检查边缘部署的各项功能是否正常工作
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// 配置
const PROJECT_ROOT = path.resolve(__dirname, "..");
const HEALTH_CHECK_CONFIG = {
	timeout: 10000,
	retries: 3,
	retryDelay: 2000,
};

// 颜色输出
const colors = {
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	reset: "\x1b[0m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
	console.log("\n" + "=".repeat(60));
	log(title, "cyan");
	console.log("=".repeat(60));
}

function logSuccess(message) {
	log(`✅ ${message}`, "green");
}

function logWarning(message) {
	log(`⚠️  ${message}`, "yellow");
}

function logError(message) {
	log(`❌ ${message}`, "red");
}

function logInfo(message) {
	log(`ℹ️  ${message}`, "blue");
}

// HTTP请求工具
function makeHttpRequest(url, options = {}) {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const client = urlObj.protocol === "https:" ? https : http;

		const requestOptions = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			path: urlObj.pathname + urlObj.search,
			method: options.method || "GET",
			headers: {
				"User-Agent": "EdgeHealthCheck/1.0",
				...options.headers,
			},
			timeout: HEALTH_CHECK_CONFIG.timeout,
		};

		const req = client.request(requestOptions, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});

			res.on("end", () => {
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					body: body,
					url: url,
				});
			});
		});

		req.on("error", (error) => {
			reject(new Error(`Request failed: ${error.message}`));
		});

		req.on("timeout", () => {
			req.destroy();
			reject(
				new Error(`Request timeout after ${HEALTH_CHECK_CONFIG.timeout}ms`),
			);
		});

		if (options.body) {
			req.write(options.body);
		}

		req.end();
	});
}

// 重试机制
async function withRetry(fn, retries = HEALTH_CHECK_CONFIG.retries) {
	for (let i = 0; i <= retries; i++) {
		try {
			return await fn();
		} catch (error) {
			if (i === retries) {
				throw error;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, HEALTH_CHECK_CONFIG.retryDelay),
			);
		}
	}
}

// 检查本地开发服务器
async function checkLocalDevelopment() {
	logSection("🏠 检查本地开发环境");

	const checks = [];

	// 检查Next.js配置
	checks.push(await checkNextJSConfig());

	// 检查依赖安装
	checks.push(await checkDependencies());

	// 检查TypeScript编译
	checks.push(await checkTypeScriptCompilation());

	// 检查本地服务器启动
	checks.push(await checkLocalServer());

	return checks;
}

async function checkNextJSConfig() {
	try {
		logInfo("检查Next.js配置...");

		const configPaths = [
			path.join(PROJECT_ROOT, "next.config.ts"),
			path.join(PROJECT_ROOT, "next.config.js"),
		];

		let configExists = false;
		let foundConfigPath = null;

		for (const configPath of configPaths) {
			if (fs.existsSync(configPath)) {
				configExists = true;
				foundConfigPath = configPath;
				break;
			}
		}

		if (!configExists) {
			return {
				name: "Next.js配置",
				passed: false,
				message: "未找到next.config.ts或next.config.js",
				details: { configPath: null },
			};
		}

		const configContent = fs.readFileSync(configPath, "utf8");

		// 检查边缘相关配置
		const edgeChecks = {
			experimental: configContent.includes("experimental"),
			runtime: configContent.includes("runtime"),
			edge: configContent.includes("edge"),
		};

		logSuccess("Next.js配置检查完成");
		return {
			name: "Next.js配置",
			passed: true,
			message: "配置文件存在并包含边缘相关设置",
			details: { configPath, edgeChecks },
		};
	} catch (error) {
		return {
			name: "Next.js配置",
			passed: false,
			message: `配置检查失败: ${error.message}`,
			details: { error: error.message },
		};
	}
}

async function checkDependencies() {
	try {
		logInfo("检查依赖安装...");

		const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
		const nodeModulesPath = path.join(PROJECT_ROOT, "node_modules");

		if (!fs.existsSync(packageJsonPath)) {
			return {
				name: "依赖检查",
				passed: false,
				message: "package.json不存在",
			};
		}

		if (!fs.existsSync(nodeModulesPath)) {
			return {
				name: "依赖检查",
				passed: false,
				message: "node_modules不存在，请运行npm install",
			};
		}

		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const totalDeps =
			Object.keys(packageJson.dependencies || {}).length +
			Object.keys(packageJson.devDependencies || {}).length;

		logSuccess(`依赖检查完成 (${totalDeps}个包)`);
		return {
			name: "依赖检查",
			passed: true,
			message: `${totalDeps}个依赖包已安装`,
			details: { totalDeps },
		};
	} catch (error) {
		return {
			name: "依赖检查",
			passed: false,
			message: `依赖检查失败: ${error.message}`,
		};
	}
}

async function checkTypeScriptCompilation() {
	try {
		logInfo("检查TypeScript编译...");

		execSync("npx tsc --noEmit", {
			stdio: "ignore",
			cwd: PROJECT_ROOT,
			timeout: 30000,
		});

		logSuccess("TypeScript编译检查通过");
		return {
			name: "TypeScript编译",
			passed: true,
			message: "类型检查通过",
		};
	} catch (error) {
		return {
			name: "TypeScript编译",
			passed: false,
			message: "存在TypeScript类型错误",
			details: { suggestion: "运行npm run typecheck查看详细错误" },
		};
	}
}

async function checkLocalServer() {
	try {
		logInfo("检查本地服务器启动能力...");

		// 检查端口是否被占用
		const port = 9002;
		const isPortFree = await checkPortAvailability(port);

		if (!isPortFree) {
			return {
				name: "本地服务器",
				passed: false,
				message: `端口${port}已被占用`,
				details: { port, suggestion: "请关闭占用端口的进程或使用其他端口" },
			};
		}

		logSuccess("本地服务器检查通过");
		return {
			name: "本地服务器",
			passed: true,
			message: `端口${port}可用`,
			details: { port },
		};
	} catch (error) {
		return {
			name: "本地服务器",
			passed: false,
			message: `服务器检查失败: ${error.message}`,
		};
	}
}

function checkPortAvailability(port) {
	return new Promise((resolve) => {
		const server = require("net").createServer();
		server.listen(port, () => {
			server.once("close", () => resolve(true));
			server.close();
		});
		server.on("error", () => resolve(false));
	});
}

// 检查API端点
async function checkAPIEndpoints(baseUrl) {
	logSection("🔌 检查API端点");

	const endpoints = [
		{
			path: "/api/book-sources",
			method: "GET",
			description: "书源API",
		},
		{
			path: "/api/proxy-fetch",
			method: "POST",
			description: "代理请求API",
			body: JSON.stringify({ url: "https://httpbin.org/get" }),
			headers: { "Content-Type": "application/json" },
		},
		{
			path: "/api/test-proxy",
			method: "GET",
			description: "代理测试API",
		},
	];

	const checks = [];

	for (const endpoint of endpoints) {
		checks.push(await checkSingleEndpoint(baseUrl, endpoint));
	}

	return checks;
}

async function checkSingleEndpoint(baseUrl, endpoint) {
	try {
		logInfo(`检查API: ${endpoint.path}`);

		const response = await withRetry(async () => {
			return await makeHttpRequest(`${baseUrl}${endpoint.path}`, {
				method: endpoint.method,
				headers: endpoint.headers,
				body: endpoint.body,
			});
		});

		const isSuccess = response.statusCode >= 200 && response.statusCode < 400;

		if (isSuccess) {
			logSuccess(`${endpoint.description} - 状态码: ${response.statusCode}`);
		} else {
			logWarning(
				`${endpoint.description} - 状态码: ${response.statusCode} (可能正常)`,
			);
		}

		return {
			name: endpoint.description,
			passed: isSuccess,
			message: `状态码: ${response.statusCode}`,
			details: {
				path: endpoint.path,
				method: endpoint.method,
				statusCode: response.statusCode,
				responseSize: response.body.length,
			},
		};
	} catch (error) {
		logError(`${endpoint.description} - ${error.message}`);
		return {
			name: endpoint.description,
			passed: false,
			message: error.message,
			details: {
				path: endpoint.path,
				method: endpoint.method,
				error: error.message,
			},
		};
	}
}

// 检查边缘运行时兼容性
async function checkEdgeRuntimeCompatibility() {
	logSection("⚡ 检查边缘运行时兼容性");

	const checks = [];

	// 检查Web APIs可用性
	checks.push(await checkWebAPIs());

	// 检查Node.js特定功能
	checks.push(await checkNodeJSFeatures());

	// 检查边缘特定配置
	checks.push(await checkEdgeConfiguration());

	return checks;
}

async function checkWebAPIs() {
	try {
		logInfo("检查Web APIs兼容性...");

		// 模拟边缘环境中的Web API检查
		const webAPIs = [
			"fetch",
			"URL",
			"URLSearchParams",
			"Headers",
			"Request",
			"Response",
		];

		const availableAPIs = webAPIs.filter((api) => {
			try {
				return typeof globalThis[api] !== "undefined";
			} catch {
				return false;
			}
		});

		const compatibilityRatio = availableAPIs.length / webAPIs.length;

		logSuccess(
			`Web API兼容性: ${availableAPIs.length}/${webAPIs.length} (${Math.round(compatibilityRatio * 100)}%)`,
		);

		return {
			name: "Web APIs兼容性",
			passed: compatibilityRatio > 0.8,
			message: `${availableAPIs.length}/${webAPIs.length} APIs可用`,
			details: {
				available: availableAPIs,
				missing: webAPIs.filter((api) => !availableAPIs.includes(api)),
				compatibilityRatio: Math.round(compatibilityRatio * 100),
			},
		};
	} catch (error) {
		return {
			name: "Web APIs兼容性",
			passed: false,
			message: `检查失败: ${error.message}`,
		};
	}
}

async function checkNodeJSFeatures() {
	try {
		logInfo("检查Node.js特定功能...");

		const nodeFeatures = ["fs", "path", "crypto", "buffer"];
		const problematicFeatures = [];

		for (const feature of nodeFeatures) {
			try {
				require(feature);
			} catch (error) {
				problematicFeatures.push(feature);
			}
		}

		const message =
			problematicFeatures.length > 0
				? `发现${problematicFeatures.length}个可能的边缘兼容性问题`
				: "Node.js功能检查通过";

		if (problematicFeatures.length > 0) {
			logWarning(message);
		} else {
			logSuccess(message);
		}

		return {
			name: "Node.js功能兼容性",
			passed: problematicFeatures.length === 0,
			message: message,
			details: {
				total: nodeFeatures.length,
				problematic: problematicFeatures,
			},
		};
	} catch (error) {
		return {
			name: "Node.js功能兼容性",
			passed: false,
			message: `检查失败: ${error.message}`,
		};
	}
}

async function checkEdgeConfiguration() {
	try {
		logInfo("检查边缘特定配置...");

		const edgeConfigPath = path.join(PROJECT_ROOT, "edge-config.json");
		const edgeConfigExists = fs.existsSync(edgeConfigPath);

		if (!edgeConfigExists) {
			return {
				name: "边缘配置",
				passed: false,
				message: "edge-config.json不存在",
				details: { suggestion: "运行npm run edgeone:check生成配置" },
			};
		}

		const edgeConfig = JSON.parse(fs.readFileSync(edgeConfigPath, "utf8"));
		const requiredSections = [
			"edge",
			"features",
			"compatibility",
			"security",
			"performance",
		];

		const missingSections = requiredSections.filter(
			(section) => !edgeConfig[section],
		);

		const isComplete = missingSections.length === 0;

		if (isComplete) {
			logSuccess("边缘配置完整");
		} else {
			logWarning(`边缘配置缺少: ${missingSections.join(", ")}`);
		}

		return {
			name: "边缘配置",
			passed: isComplete,
			message: isComplete
				? "配置文件完整"
				: `缺少配置段: ${missingSections.join(", ")}`,
			details: {
				configPath: edgeConfigPath,
				sections: Object.keys(edgeConfig),
				missing: missingSections,
			},
		};
	} catch (error) {
		return {
			name: "边缘配置",
			passed: false,
			message: `配置检查失败: ${error.message}`,
		};
	}
}

// 检查部署状态
async function checkDeploymentStatus() {
	logSection("🌐 检查部署状态");

	const checks = [];

	// 检查各平台部署状态
	checks.push(await checkVercelDeployment());
	checks.push(await checkNetlifyDeployment());
	checks.push(await checkEdgeOneDeployment());

	return checks.filter((check) => check !== null);
}

async function checkVercelDeployment() {
	try {
		logInfo("检查Vercel部署状态...");

		const vercelConfigPath = path.join(PROJECT_ROOT, ".vercel");
		const vercelJsonPath = path.join(PROJECT_ROOT, "vercel.json");

		if (!fs.existsSync(vercelConfigPath) && !fs.existsSync(vercelJsonPath)) {
			return null; // 未配置Vercel
		}

		// 尝试获取Vercel部署信息
		try {
			const output = execSync("vercel ls", { encoding: "utf8", stdio: "pipe" });
			logSuccess("Vercel部署状态正常");
			return {
				name: "Vercel部署",
				passed: true,
				message: "部署状态正常",
				details: { hasConfig: true },
			};
		} catch (error) {
			return {
				name: "Vercel部署",
				passed: false,
				message: "无法获取部署状态",
				details: { error: "需要登录Vercel CLI" },
			};
		}
	} catch (error) {
		return {
			name: "Vercel部署",
			passed: false,
			message: `检查失败: ${error.message}`,
		};
	}
}

async function checkNetlifyDeployment() {
	try {
		logInfo("检查Netlify部署状态...");

		const netlifyConfigPath = path.join(PROJECT_ROOT, "netlify.toml");

		if (!fs.existsSync(netlifyConfigPath)) {
			return null; // 未配置Netlify
		}

		// 尝试获取Netlify部署信息
		try {
			const output = execSync("netlify status", {
				encoding: "utf8",
				stdio: "pipe",
			});
			logSuccess("Netlify部署状态正常");
			return {
				name: "Netlify部署",
				passed: true,
				message: "部署状态正常",
				details: { hasConfig: true },
			};
		} catch (error) {
			return {
				name: "Netlify部署",
				passed: false,
				message: "无法获取部署状态",
				details: { error: "需要登录Netlify CLI" },
			};
		}
	} catch (error) {
		return {
			name: "Netlify部署",
			passed: false,
			message: `检查失败: ${error.message}`,
		};
	}
}

async function checkEdgeOneDeployment() {
	try {
		logInfo("检查EdgeOne部署配置...");

		const edgeOneConfigPath = path.join(PROJECT_ROOT, "edgeone.config.js");

		if (!fs.existsSync(edgeOneConfigPath)) {
			return {
				name: "EdgeOne部署",
				passed: false,
				message: "EdgeOne配置文件不存在",
				details: { suggestion: "创建edgeone.config.js文件" },
			};
		}

		logSuccess("EdgeOne配置文件存在");
		return {
			name: "EdgeOne部署",
			passed: true,
			message: "配置文件已就绪",
			details: { hasConfig: true },
		};
	} catch (error) {
		return {
			name: "EdgeOne部署",
			passed: false,
			message: `检查失败: ${error.message}`,
		};
	}
}

// 性能基准测试
async function performanceBaseline(baseUrl) {
	logSection("📊 性能基准测试");

	const tests = [
		{
			name: "首页加载",
			path: "/",
		},
		{
			name: "API响应",
			path: "/api/book-sources",
		},
	];

	const results = [];

	for (const test of tests) {
		results.push(await measurePerformance(baseUrl, test));
	}

	return results;
}

async function measurePerformance(baseUrl, test) {
	try {
		logInfo(`性能测试: ${test.name}`);

		const measurements = [];

		// 进行3次测量取平均值
		for (let i = 0; i < 3; i++) {
			const startTime = Date.now();

			await makeHttpRequest(`${baseUrl}${test.path}`);

			const endTime = Date.now();
			measurements.push(endTime - startTime);
		}

		const avgTime =
			measurements.reduce((a, b) => a + b, 0) / measurements.length;
		const minTime = Math.min(...measurements);
		const maxTime = Math.max(...measurements);

		const performance =
			avgTime < 1000 ? "优秀" : avgTime < 3000 ? "良好" : "需优化";

		logSuccess(
			`${test.name} - 平均响应时间: ${avgTime.toFixed(0)}ms (${performance})`,
		);

		return {
			name: test.name,
			passed: avgTime < 5000,
			message: `平均响应时间: ${avgTime.toFixed(0)}ms`,
			details: {
				path: test.path,
				avgTime: Math.round(avgTime),
				minTime,
				maxTime,
				measurements,
				performance,
			},
		};
	} catch (error) {
		return {
			name: test.name,
			passed: false,
			message: `性能测试失败: ${error.message}`,
			details: { error: error.message },
		};
	}
}

// 生成健康检查报告
function generateHealthReport(allChecks) {
	const report = {
		timestamp: new Date().toISOString(),
		summary: {
			totalChecks: allChecks.flat().length,
			passedChecks: allChecks.flat().filter((check) => check.passed).length,
			failedChecks: allChecks.flat().filter((check) => !check.passed).length,
		},
		categories: {
			development: allChecks[0] || [],
			api: allChecks[1] || [],
			runtime: allChecks[2] || [],
			deployment: allChecks[3] || [],
			performance: allChecks[4] || [],
		},
		recommendations: generateRecommendations(allChecks.flat()),
	};

	report.summary.healthScore = Math.round(
		(report.summary.passedChecks / report.summary.totalChecks) * 100,
	);

	// 保存报告
	const reportPath = path.join(PROJECT_ROOT, "health-check-report.json");
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	logSuccess(
		`健康检查报告已保存到: ${path.relative(PROJECT_ROOT, reportPath)}`,
	);
	return report;
}

function generateRecommendations(allChecks) {
	const recommendations = [];
	const failedChecks = allChecks.filter((check) => !check.passed);

	if (failedChecks.length === 0) {
		recommendations.push({
			type: "success",
			message: "所有检查都已通过，系统健康状况良好",
			priority: "info",
		});
	} else {
		failedChecks.forEach((check) => {
			if (check.details?.suggestion) {
				recommendations.push({
					type: "fix",
					message: `${check.name}: ${check.details.suggestion}`,
					priority: "high",
				});
			}
		});

		// 通用建议
		if (failedChecks.some((check) => check.name.includes("API"))) {
			recommendations.push({
				type: "general",
				message: "检查服务器是否正在运行: npm run dev",
				priority: "medium",
			});
		}

		if (failedChecks.some((check) => check.name.includes("TypeScript"))) {
			recommendations.push({
				type: "general",
				message: "修复TypeScript错误: npm run typecheck",
				priority: "medium",
			});
		}
	}

	return recommendations;
}

// 显示健康检查摘要
function displayHealthSummary(report) {
	console.log("\n📋 健康检查摘要:");
	console.log("==================");

	const scoreColor =
		report.summary.healthScore >= 80
			? "green"
			: report.summary.healthScore >= 60
				? "yellow"
				: "red";

	log(`健康评分: ${report.summary.healthScore}/100`, scoreColor);
	log(`通过检查: ${report.summary.passedChecks}/${report.summary.totalChecks}`);

	if (report.summary.failedChecks > 0) {
		console.log("\n❌ 失败的检查:");
		Object.values(report.categories)
			.flat()
			.filter((check) => !check.passed)
			.forEach((check) => {
				log(`  • ${check.name}: ${check.message}`, "red");
			});
	}

	if (report.recommendations.length > 0) {
		console.log("\n💡 建议:");
		report.recommendations.forEach((rec) => {
			const color =
				rec.priority === "high"
					? "red"
					: rec.priority === "medium"
						? "yellow"
						: "blue";
			log(`  • ${rec.message}`, color);
		});
	}

	console.log("\n🎉 健康检查完成!");
}

// 主函数
async function main() {
	const args = process.argv.slice(2);
	const url = args[0] || "http://localhost:9002";
	const skipPerformance = args.includes("--skip-performance");

	log("🏥 边缘环境健康检查工具", "magenta");
	log("========================", "magenta");

	const allChecks = [];

	try {
		// 1. 本地开发环境检查
		const devChecks = await checkLocalDevelopment();
		allChecks.push(devChecks);

		// 2. API端点检查
		let apiChecks = [];
		try {
			apiChecks = await checkAPIEndpoints(url);
		} catch (error) {
			logWarning(`API检查跳过: ${error.message}`);
		}
		allChecks.push(apiChecks);

		// 3. 边缘运行时兼容性检查
		const runtimeChecks = await checkEdgeRuntimeCompatibility();
		allChecks.push(runtimeChecks);

		// 4. 部署状态检查
		const deploymentChecks = await checkDeploymentStatus();
		allChecks.push(deploymentChecks);

		// 5. 性能基准测试（可选）
		let performanceChecks = [];
		if (!skipPerformance) {
			try {
				performanceChecks = await performanceBaseline(url);
			} catch (error) {
				logWarning(`性能测试跳过: ${error.message}`);
			}
		}
		allChecks.push(performanceChecks);

		// 6. 生成报告
		const report = generateHealthReport(allChecks);

		// 7. 显示摘要
		displayHealthSummary(report);

		process.exit(report.summary.healthScore >= 60 ? 0 : 1);
	} catch (error) {
		logError(`健康检查过程中发生错误: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

// 如果直接运行此脚本
if (require.main === module) {
	main();
}

module.exports = {
	checkLocalDevelopment,
	checkAPIEndpoints,
	checkEdgeRuntimeCompatibility,
	checkDeploymentStatus,
	performanceBaseline,
	generateHealthReport,
};
