#!/usr/bin/env node

/**
 * 边缘环境自动检测脚本
 * 自动检测当前运行环境并配置相应的边缘部署设置
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

// 配置
const PROJECT_ROOT = path.resolve(__dirname, "..");
const EDGE_CONFIG_PATH = path.join(PROJECT_ROOT, "edge-config.json");
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, "package.json");
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, ".env.local");

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
	console.log("\n" + "=".repeat(50));
	log(title, "cyan");
	console.log("=".repeat(50));
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

// 检测系统信息
function detectSystemInfo() {
	return {
		platform: os.platform(),
		arch: os.arch(),
		nodeVersion: process.version,
		npmVersion: getNpmVersion(),
		isCI: detectCIEnvironment(),
		hasDocker: checkDockerAvailability(),
		hasGit: checkGitAvailability(),
	};
}

function getNpmVersion() {
	try {
		return execSync("npm --version", { encoding: "utf8" }).trim();
	} catch (error) {
		return "unknown";
	}
}

function detectCIEnvironment() {
	const ciEnvVars = [
		"CI",
		"CONTINUOUS_INTEGRATION",
		"BUILD_NUMBER",
		"GITHUB_ACTIONS",
		"GITLAB_CI",
		"JENKINS_URL",
		"TRAVIS",
		"CIRCLECI",
		"VERCEL",
		"NETLIFY",
	];

	return ciEnvVars.some((envVar) => process.env[envVar]);
}

function checkDockerAvailability() {
	try {
		execSync("docker --version", { stdio: "ignore" });
		return true;
	} catch (error) {
		return false;
	}
}

function checkGitAvailability() {
	try {
		execSync("git --version", { stdio: "ignore" });
		return true;
	} catch (error) {
		return false;
	}
}

// 检测边缘平台
function detectEdgePlatforms() {
	const platforms = {
		vercel: detectVercel(),
		netlify: detectNetlify(),
		cloudflare: detectCloudflare(),
		edgeone: detectEdgeOne(),
		railway: detectRailway(),
		render: detectRender(),
	};

	return platforms;
}

function detectVercel() {
	const indicators = [
		process.env.VERCEL,
		process.env.VERCEL_ENV,
		fs.existsSync(path.join(PROJECT_ROOT, "vercel.json")),
		fs.existsSync(path.join(PROJECT_ROOT, ".vercel")),
		checkPackageJsonScript("vercel"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"VERCEL环境变量",
			"VERCEL_ENV环境变量",
			"vercel.json配置文件",
			".vercel目录",
			"package.json中的vercel脚本",
		]),
	};
}

function detectNetlify() {
	const indicators = [
		process.env.NETLIFY,
		process.env.DEPLOY_URL,
		fs.existsSync(path.join(PROJECT_ROOT, "netlify.toml")),
		fs.existsSync(path.join(PROJECT_ROOT, "_redirects")),
		checkPackageJsonScript("netlify"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"NETLIFY环境变量",
			"DEPLOY_URL环境变量",
			"netlify.toml配置文件",
			"_redirects文件",
			"package.json中的netlify脚本",
		]),
	};
}

function detectCloudflare() {
	const indicators = [
		process.env.CF_PAGES,
		process.env.CLOUDFLARE_WORKERS,
		fs.existsSync(path.join(PROJECT_ROOT, "wrangler.toml")),
		fs.existsSync(path.join(PROJECT_ROOT, "workers-site")),
		checkPackageJsonScript("wrangler"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"CF_PAGES环境变量",
			"CLOUDFLARE_WORKERS环境变量",
			"wrangler.toml配置文件",
			"workers-site目录",
			"package.json中的wrangler脚本",
		]),
	};
}

function detectEdgeOne() {
	const indicators = [
		process.env.EDGEONE,
		process.env.EDGE_RUNTIME === "edgeone",
		fs.existsSync(path.join(PROJECT_ROOT, "edgeone.config.js")),
		fs.existsSync(EDGE_CONFIG_PATH),
		checkPackageJsonScript("edgeone"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"EDGEONE环境变量",
			"EDGE_RUNTIME=edgeone",
			"edgeone.config.js配置文件",
			"edge-config.json配置文件",
			"package.json中的edgeone脚本",
		]),
	};
}

function detectRailway() {
	const indicators = [
		process.env.RAILWAY_ENVIRONMENT,
		process.env.RAILWAY_PROJECT_ID,
		fs.existsSync(path.join(PROJECT_ROOT, "railway.json")),
		checkPackageJsonScript("railway"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"RAILWAY_ENVIRONMENT环境变量",
			"RAILWAY_PROJECT_ID环境变量",
			"railway.json配置文件",
			"package.json中的railway脚本",
		]),
	};
}

function detectRender() {
	const indicators = [
		process.env.RENDER,
		process.env.RENDER_SERVICE_ID,
		fs.existsSync(path.join(PROJECT_ROOT, "render.yaml")),
		checkPackageJsonScript("render"),
	];

	return {
		detected: indicators.some(Boolean),
		confidence: calculateConfidence(indicators),
		evidence: getEvidence(indicators, [
			"RENDER环境变量",
			"RENDER_SERVICE_ID环境变量",
			"render.yaml配置文件",
			"package.json中的render脚本",
		]),
	};
}

function checkPackageJsonScript(scriptName) {
	try {
		const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
		const scripts = packageJson.scripts || {};
		return Object.keys(scripts).some(
			(key) => key.includes(scriptName) || scripts[key].includes(scriptName),
		);
	} catch (error) {
		return false;
	}
}

function calculateConfidence(indicators) {
	const trueCount = indicators.filter(Boolean).length;
	return Math.round((trueCount / indicators.length) * 100);
}

function getEvidence(indicators, descriptions) {
	return indicators
		.map((indicator, index) => ({
			indicator,
			description: descriptions[index],
		}))
		.filter((item) => item.indicator)
		.map((item) => item.description);
}

// 检测项目配置
function detectProjectConfig() {
	const config = {
		hasNextConfig:
			fs.existsSync(path.join(PROJECT_ROOT, "next.config.ts")) ||
			fs.existsSync(path.join(PROJECT_ROOT, "next.config.js")),
		hasEdgeConfig: fs.existsSync(EDGE_CONFIG_PATH),
		hasEnvFile: fs.existsSync(ENV_LOCAL_PATH),
		hasTailwind: fs.existsSync(path.join(PROJECT_ROOT, "tailwind.config.ts")),
		hasTypeScript: fs.existsSync(path.join(PROJECT_ROOT, "tsconfig.json")),
		framework: detectFramework(),
		buildTool: detectBuildTool(),
		dependencies: getProjectDependencies(),
	};

	return config;
}

function detectFramework() {
	try {
		const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		if (deps.next) return "next.js";
		if (deps.react) return "react";
		if (deps.vue) return "vue";
		if (deps.svelte) return "svelte";
		if (deps.nuxt) return "nuxt";

		return "unknown";
	} catch (error) {
		return "unknown";
	}
}

function detectBuildTool() {
	if (fs.existsSync(path.join(PROJECT_ROOT, "vite.config.ts"))) return "vite";
	if (fs.existsSync(path.join(PROJECT_ROOT, "webpack.config.js")))
		return "webpack";
	if (fs.existsSync(path.join(PROJECT_ROOT, "rollup.config.js")))
		return "rollup";
	if (fs.existsSync(path.join(PROJECT_ROOT, "esbuild.config.js")))
		return "esbuild";

	return "default";
}

function getProjectDependencies() {
	try {
		const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		return {
			total: Object.keys(deps).length,
			edgeCompatible: countEdgeCompatibleDependencies(deps),
			problematic: findProblematicDependencies(deps),
		};
	} catch (error) {
		return { total: 0, edgeCompatible: 0, problematic: [] };
	}
}

function countEdgeCompatibleDependencies(deps) {
	const edgeCompatible = [
		"react",
		"next",
		"tailwindcss",
		"typescript",
		"@radix-ui",
		"lucide-react",
		"clsx",
		"zod",
	];

	return Object.keys(deps).filter((dep) =>
		edgeCompatible.some((compatible) => dep.includes(compatible)),
	).length;
}

function findProblematicDependencies(deps) {
	const problematic = [
		"vm2",
		"https-proxy-agent",
		"fs-extra",
		"child_process",
		"cluster",
		"worker_threads",
	];

	return Object.keys(deps).filter((dep) =>
		problematic.some((problem) => dep.includes(problem)),
	);
}

// 生成推荐配置
function generateRecommendations(systemInfo, platforms, projectConfig) {
	const recommendations = [];

	// 基于检测到的平台生成推荐
	const detectedPlatforms = Object.entries(platforms)
		.filter(([_, info]) => info.detected)
		.sort(([_, a], [__, b]) => b.confidence - a.confidence);

	if (detectedPlatforms.length === 0) {
		recommendations.push({
			type: "platform",
			priority: "high",
			title: "未检测到边缘平台",
			description: "建议选择一个边缘计算平台进行部署",
			actions: [
				"添加 Vercel 配置: npm install -g vercel && vercel",
				"添加 Netlify 配置: 创建 netlify.toml 文件",
				"添加 EdgeOne 配置: 运行 npm run edgeone:check",
			],
		});
	} else {
		const primaryPlatform = detectedPlatforms[0];
		recommendations.push({
			type: "platform",
			priority: "info",
			title: `检测到主要平台: ${primaryPlatform[0]}`,
			description: `置信度: ${primaryPlatform[1].confidence}%`,
			actions: [`优化 ${primaryPlatform[0]} 配置以获得最佳性能`],
		});
	}

	// 基于项目配置生成推荐
	if (!projectConfig.hasEdgeConfig) {
		recommendations.push({
			type: "config",
			priority: "medium",
			title: "缺少边缘配置文件",
			description: "建议创建 edge-config.json 以优化边缘部署",
			actions: ["运行 npm run edgeone:check 生成配置文件"],
		});
	}

	if (projectConfig.dependencies.problematic.length > 0) {
		recommendations.push({
			type: "dependencies",
			priority: "high",
			title: "发现有问题的依赖",
			description: `${projectConfig.dependencies.problematic.join(", ")} 可能不兼容边缘环境`,
			actions: [
				"运行 npm run edgeone:fix 修复兼容性问题",
				"考虑使用边缘兼容的替代方案",
			],
		});
	}

	return recommendations;
}

// 自动配置边缘环境
function autoConfigureEdgeEnvironment(detectedPlatforms, projectConfig) {
	logSection("🔧 自动配置边缘环境");

	const configurations = [];

	// 检测主要平台并配置
	const primaryPlatform = Object.entries(detectedPlatforms).find(
		([_, info]) => info.detected && info.confidence > 70,
	);

	if (primaryPlatform) {
		const [platformName, platformInfo] = primaryPlatform;

		switch (platformName) {
			case "vercel":
				configurations.push(configureVercel());
				break;
			case "netlify":
				configurations.push(configureNetlify());
				break;
			case "cloudflare":
				configurations.push(configureCloudflare());
				break;
			case "edgeone":
				configurations.push(configureEdgeOne());
				break;
		}
	} else {
		// 如果没有检测到明确的平台，设置通用边缘配置
		configurations.push(configureGenericEdge());
	}

	return configurations;
}

function configureVercel() {
	const vercelConfig = {
		functions: {
			"src/app/api/**/*.ts": {
				runtime: "edge",
			},
		},
		rewrites: [
			{
				source: "/api/(.*)",
				destination: "/api/$1",
			},
		],
	};

	try {
		fs.writeFileSync(
			path.join(PROJECT_ROOT, "vercel.json"),
			JSON.stringify(vercelConfig, null, 2),
		);
		logSuccess("已配置 Vercel 边缘函数");
		return { platform: "vercel", configured: true };
	} catch (error) {
		logError(`配置 Vercel 失败: ${error.message}`);
		return { platform: "vercel", configured: false, error: error.message };
	}
}

function configureNetlify() {
	const netlifyConfig = `
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[edge_functions]]
  function = "api"
  path = "/api/*"

[functions]
  directory = ".netlify/edge-functions"
`;

	try {
		fs.writeFileSync(
			path.join(PROJECT_ROOT, "netlify.toml"),
			netlifyConfig.trim(),
		);
		logSuccess("已配置 Netlify 边缘函数");
		return { platform: "netlify", configured: true };
	} catch (error) {
		logError(`配置 Netlify 失败: ${error.message}`);
		return { platform: "netlify", configured: false, error: error.message };
	}
}

function configureCloudflare() {
	const wranglerConfig = `
name = "dog-engine-front"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
route = "example.com/*"

[[env.production.kv_namespaces]]
binding = "BOOK_SOURCES_KV"
id = "your-kv-namespace-id"
`;

	try {
		fs.writeFileSync(
			path.join(PROJECT_ROOT, "wrangler.toml"),
			wranglerConfig.trim(),
		);
		logSuccess("已配置 Cloudflare Workers");
		return { platform: "cloudflare", configured: true };
	} catch (error) {
		logError(`配置 Cloudflare 失败: ${error.message}`);
		return { platform: "cloudflare", configured: false, error: error.message };
	}
}

function configureEdgeOne() {
	try {
		// EdgeOne 配置已存在，只需要更新环境变量
		updateEnvFile("EDGE_RUNTIME", "edgeone");
		updateEnvFile("EDGEONE", "1");

		logSuccess("已配置 EdgeOne 环境变量");
		return { platform: "edgeone", configured: true };
	} catch (error) {
		logError(`配置 EdgeOne 失败: ${error.message}`);
		return { platform: "edgeone", configured: false, error: error.message };
	}
}

function configureGenericEdge() {
	try {
		// 创建通用边缘配置
		updateEnvFile("EDGE_RUNTIME", "edge");
		updateEnvFile("NODE_ENV", "production");

		logSuccess("已配置通用边缘环境");
		return { platform: "generic", configured: true };
	} catch (error) {
		logError(`配置通用边缘环境失败: ${error.message}`);
		return { platform: "generic", configured: false, error: error.message };
	}
}

function updateEnvFile(key, value) {
	let envContent = "";

	if (fs.existsSync(ENV_LOCAL_PATH)) {
		envContent = fs.readFileSync(ENV_LOCAL_PATH, "utf8");
	}

	const lines = envContent.split("\n");
	let updated = false;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith(`${key}=`)) {
			lines[i] = `${key}=${value}`;
			updated = true;
			break;
		}
	}

	if (!updated) {
		lines.push(`${key}=${value}`);
	}

	fs.writeFileSync(ENV_LOCAL_PATH, lines.join("\n"));
}

// 生成检测报告
function generateDetectionReport(
	systemInfo,
	platforms,
	projectConfig,
	recommendations,
	configurations,
) {
	const report = {
		timestamp: new Date().toISOString(),
		system: systemInfo,
		platforms: platforms,
		project: projectConfig,
		recommendations: recommendations,
		configurations: configurations,
		summary: {
			detectedPlatforms: Object.entries(platforms)
				.filter(([_, info]) => info.detected)
				.map(([name, info]) => ({ name, confidence: info.confidence })),
			configuredPlatforms: configurations
				.filter((config) => config.configured)
				.map((config) => config.platform),
			criticalIssues: recommendations.filter((rec) => rec.priority === "high")
				.length,
		},
	};

	// 保存报告
	const reportPath = path.join(PROJECT_ROOT, "edge-detection-report.json");
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	return { report, reportPath };
}

// 主函数
function main() {
	log("🔍 边缘环境自动检测工具", "magenta");
	log("==========================", "magenta");

	try {
		// 1. 检测系统信息
		logSection("💻 检测系统信息");
		const systemInfo = detectSystemInfo();
		logInfo(`操作系统: ${systemInfo.platform} (${systemInfo.arch})`);
		logInfo(`Node.js: ${systemInfo.nodeVersion}`);
		logInfo(`npm: ${systemInfo.npmVersion}`);
		logInfo(`CI环境: ${systemInfo.isCI ? "是" : "否"}`);
		logInfo(`Docker: ${systemInfo.hasDocker ? "可用" : "不可用"}`);
		logInfo(`Git: ${systemInfo.hasGit ? "可用" : "不可用"}`);

		// 2. 检测边缘平台
		logSection("🌐 检测边缘平台");
		const platforms = detectEdgePlatforms();

		Object.entries(platforms).forEach(([name, info]) => {
			if (info.detected) {
				logSuccess(
					`${name.toUpperCase()}: 已检测 (置信度: ${info.confidence}%)`,
				);
				info.evidence.forEach((evidence) => {
					logInfo(`  - ${evidence}`);
				});
			} else {
				log(`${name.toUpperCase()}: 未检测`, "reset");
			}
		});

		// 3. 检测项目配置
		logSection("📋 检测项目配置");
		const projectConfig = detectProjectConfig();
		logInfo(`框架: ${projectConfig.framework}`);
		logInfo(`构建工具: ${projectConfig.buildTool}`);
		logInfo(`TypeScript: ${projectConfig.hasTypeScript ? "是" : "否"}`);
		logInfo(`边缘配置: ${projectConfig.hasEdgeConfig ? "是" : "否"}`);
		logInfo(`依赖总数: ${projectConfig.dependencies.total}`);
		logInfo(`边缘兼容依赖: ${projectConfig.dependencies.edgeCompatible}`);

		if (projectConfig.dependencies.problematic.length > 0) {
			logWarning(
				`有问题的依赖: ${projectConfig.dependencies.problematic.join(", ")}`,
			);
		}

		// 4. 生成推荐
		logSection("💡 生成推荐");
		const recommendations = generateRecommendations(
			systemInfo,
			platforms,
			projectConfig,
		);

		recommendations.forEach((rec) => {
			const logFunc =
				rec.priority === "high"
					? logError
					: rec.priority === "medium"
						? logWarning
						: logInfo;
			logFunc(`[${rec.priority.toUpperCase()}] ${rec.title}`);
			log(`  ${rec.description}`, "blue");
			rec.actions.forEach((action) => {
				log(`  • ${action}`, "cyan");
			});
		});

		// 5. 自动配置
		const configurations = autoConfigureEdgeEnvironment(
			platforms,
			projectConfig,
		);

		// 6. 生成报告
		logSection("📊 生成检测报告");
		const { report, reportPath } = generateDetectionReport(
			systemInfo,
			platforms,
			projectConfig,
			recommendations,
			configurations,
		);

		logSuccess(`检测报告已保存到: ${path.relative(PROJECT_ROOT, reportPath)}`);

		// 7. 显示摘要
		console.log("\n📋 检测摘要:");
		log(`  检测到的平台: ${report.summary.detectedPlatforms.length}`, "green");
		report.summary.detectedPlatforms.forEach((platform) => {
			log(`    - ${platform.name} (${platform.confidence}%)`, "cyan");
		});

		log(`  配置的平台: ${report.summary.configuredPlatforms.length}`, "green");
		report.summary.configuredPlatforms.forEach((platform) => {
			log(`    - ${platform.name}`, "cyan");
		});

		log(
			`  需要关注的问题: ${report.summary.criticalIssues}`,
			report.summary.criticalIssues > 0 ? "yellow" : "green",
		);

		// 8. 后续步骤建议
		console.log("\n🚀 后续步骤:");
		if (report.summary.criticalIssues > 0) {
			log("  1. 运行 npm run edgeone:fix 修复兼容性问题", "cyan");
		}
		log("  2. 运行 npm run edge:health-check 验证配置", "cyan");
		log("  3. 运行 npm run deploy:auto 进行自动部署", "cyan");

		process.exit(0);
	} catch (error) {
		logError(`检测过程中发生错误: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

// 如果直接运行此脚本
if (require.main === module) {
	main();
}

module.exports = {
	detectSystemInfo,
	detectEdgePlatforms,
	detectProjectConfig,
	generateRecommendations,
	autoConfigureEdgeEnvironment,
	generateDetectionReport,
};
