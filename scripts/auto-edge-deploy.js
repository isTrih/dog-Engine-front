#!/usr/bin/env node

/**
 * 自动边缘部署脚本
 * 根据检测到的环境自动选择合适的部署方式
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
	detectSystemInfo,
	detectEdgePlatforms,
	detectProjectConfig,
} = require("./detect-edge-environment");

// 配置
const PROJECT_ROOT = path.resolve(__dirname, "..");

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

// 部署策略配置
const DEPLOYMENT_STRATEGIES = {
	vercel: {
		name: "Vercel",
		priority: 1,
		requirements: ["vercel"],
		buildCommand: "npm run build",
		deployCommand: "vercel --prod",
		envCheck: ["VERCEL_TOKEN"],
	},
	netlify: {
		name: "Netlify",
		priority: 2,
		requirements: ["netlify-cli"],
		buildCommand: "npm run build",
		deployCommand: "netlify deploy --prod",
		envCheck: ["NETLIFY_AUTH_TOKEN"],
	},
	cloudflare: {
		name: "Cloudflare Workers",
		priority: 3,
		requirements: ["@cloudflare/wrangler"],
		buildCommand: "npm run build",
		deployCommand: "wrangler publish",
		envCheck: ["CLOUDFLARE_API_TOKEN"],
	},
	edgeone: {
		name: "EdgeOne",
		priority: 4,
		requirements: [],
		buildCommand: "npm run build:edge",
		deployCommand: "echo '请通过腾讯云控制台完成EdgeOne部署'",
		envCheck: ["EDGEONE_SECRET_ID", "EDGEONE_SECRET_KEY"],
	},
	docker: {
		name: "Docker部署",
		priority: 5,
		requirements: ["docker"],
		buildCommand: "docker build -t dog-engine-front .",
		deployCommand: "echo '请手动推送Docker镜像到容器注册表'",
		envCheck: [],
	},
};

// 检查部署工具是否可用
function checkDeploymentTool(toolName) {
	try {
		execSync(`${toolName} --version`, { stdio: "ignore" });
		return true;
	} catch (error) {
		try {
			execSync(`npx ${toolName} --version`, { stdio: "ignore" });
			return true;
		} catch (npxError) {
			return false;
		}
	}
}

// 检查环境变量
function checkEnvironmentVariables(envVars) {
	const missing = [];
	const available = [];

	for (const envVar of envVars) {
		if (process.env[envVar]) {
			available.push(envVar);
		} else {
			missing.push(envVar);
		}
	}

	return { available, missing };
}

// 选择最佳部署策略
function selectDeploymentStrategy(platforms, systemInfo) {
	logSection("🎯 选择部署策略");

	const detectedPlatforms = Object.entries(platforms)
		.filter(([_, info]) => info.detected)
		.sort(([_, a], [__, b]) => b.confidence - a.confidence);

	const availableStrategies = [];

	// 检查每个部署策略的可用性
	for (const [platformName, strategy] of Object.entries(
		DEPLOYMENT_STRATEGIES,
	)) {
		const isDetected = detectedPlatforms.some(
			([name]) => name === platformName,
		);
		const toolsAvailable = strategy.requirements.every((tool) =>
			checkDeploymentTool(tool),
		);
		const envCheck = checkEnvironmentVariables(strategy.envCheck);

		const score = calculateStrategyScore(
			isDetected,
			toolsAvailable,
			envCheck,
			strategy.priority,
		);

		availableStrategies.push({
			platform: platformName,
			strategy,
			isDetected,
			toolsAvailable,
			envCheck,
			score,
		});

		logInfo(`${strategy.name}:`);
		log(
			`  检测状态: ${isDetected ? "已检测" : "未检测"}`,
			isDetected ? "green" : "yellow",
		);
		log(
			`  工具可用: ${toolsAvailable ? "是" : "否"}`,
			toolsAvailable ? "green" : "red",
		);

		if (strategy.requirements.length > 0) {
			log(`  需要工具: ${strategy.requirements.join(", ")}`, "blue");
		}

		if (envCheck.missing.length > 0) {
			log(`  缺少环境变量: ${envCheck.missing.join(", ")}`, "yellow");
		}

		if (envCheck.available.length > 0) {
			log(`  可用环境变量: ${envCheck.available.join(", ")}`, "green");
		}

		log(
			`  评分: ${score}/100`,
			score > 70 ? "green" : score > 40 ? "yellow" : "red",
		);
	}

	// 选择得分最高的策略
	const bestStrategy = availableStrategies.sort((a, b) => b.score - a.score)[0];

	if (bestStrategy.score < 30) {
		logWarning("没有找到合适的部署策略");
		return null;
	}

	logSuccess(
		`选择部署策略: ${bestStrategy.strategy.name} (评分: ${bestStrategy.score}/100)`,
	);
	return bestStrategy;
}

function calculateStrategyScore(
	isDetected,
	toolsAvailable,
	envCheck,
	priority,
) {
	let score = 0;

	// 基础分数 (根据优先级)
	score += (6 - priority) * 10;

	// 检测加分
	if (isDetected) score += 30;

	// 工具可用性加分
	if (toolsAvailable) score += 25;

	// 环境变量加分
	const envRatio =
		envCheck.available.length /
		(envCheck.available.length + envCheck.missing.length);
	if (!isNaN(envRatio)) {
		score += envRatio * 20;
	} else {
		score += 20; // 如果没有环境变量要求，给满分
	}

	return Math.round(score);
}

// 预部署检查
function preDeploymentChecks(strategy) {
	logSection("🔍 预部署检查");

	const checks = [];

	// 检查项目构建
	checks.push(checkProjectBuild());

	// 检查依赖安装
	checks.push(checkDependencies());

	// 检查边缘兼容性
	checks.push(checkEdgeCompatibility());

	// 检查部署工具
	if (strategy.strategy.requirements.length > 0) {
		checks.push(checkDeploymentTools(strategy.strategy.requirements));
	}

	// 检查环境变量
	if (strategy.strategy.envCheck.length > 0) {
		checks.push(checkDeploymentEnv(strategy.strategy.envCheck));
	}

	const passed = checks.filter((check) => check.passed).length;
	const total = checks.length;

	logInfo(`检查结果: ${passed}/${total} 通过`);

	if (passed < total) {
		logWarning("存在未通过的检查项，建议修复后再部署");
		checks
			.filter((check) => !check.passed)
			.forEach((check) => {
				logError(`❌ ${check.name}: ${check.message}`);
			});
	}

	return { checks, allPassed: passed === total };
}

function checkProjectBuild() {
	try {
		logInfo("检查项目构建...");
		execSync("npm run build", {
			stdio: "ignore",
			timeout: 300000, // 5分钟超时
		});
		logSuccess("项目构建成功");
		return { name: "项目构建", passed: true };
	} catch (error) {
		return {
			name: "项目构建",
			passed: false,
			message: "构建失败，请检查代码错误",
		};
	}
}

function checkDependencies() {
	try {
		logInfo("检查依赖安装...");
		const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
		const packageLockPath = path.join(PROJECT_ROOT, "package-lock.json");

		if (!fs.existsSync(packageJsonPath)) {
			return {
				name: "依赖检查",
				passed: false,
				message: "package.json文件不存在",
			};
		}

		if (!fs.existsSync(packageLockPath)) {
			logWarning("package-lock.json不存在，重新安装依赖...");
			execSync("npm install", { stdio: "ignore" });
		}

		logSuccess("依赖检查通过");
		return { name: "依赖检查", passed: true };
	} catch (error) {
		return {
			name: "依赖检查",
			passed: false,
			message: `依赖安装失败: ${error.message}`,
		};
	}
}

function checkEdgeCompatibility() {
	try {
		logInfo("检查边缘兼容性...");
		execSync("npm run edgeone:check", { stdio: "ignore" });
		logSuccess("边缘兼容性检查通过");
		return { name: "边缘兼容性", passed: true };
	} catch (error) {
		return {
			name: "边缘兼容性",
			passed: false,
			message: "存在边缘兼容性问题，运行 npm run edgeone:fix 修复",
		};
	}
}

function checkDeploymentTools(requirements) {
	const missingTools = requirements.filter(
		(tool) => !checkDeploymentTool(tool),
	);

	if (missingTools.length === 0) {
		logSuccess("部署工具检查通过");
		return { name: "部署工具", passed: true };
	} else {
		return {
			name: "部署工具",
			passed: false,
			message: `缺少部署工具: ${missingTools.join(", ")}`,
		};
	}
}

function checkDeploymentEnv(envVars) {
	const envCheck = checkEnvironmentVariables(envVars);

	if (envCheck.missing.length === 0) {
		logSuccess("环境变量检查通过");
		return { name: "环境变量", passed: true };
	} else {
		return {
			name: "环境变量",
			passed: false,
			message: `缺少环境变量: ${envCheck.missing.join(", ")}`,
		};
	}
}

// 执行部署
function executeDeploy(strategy, force = false) {
	logSection(`🚀 开始部署到 ${strategy.strategy.name}`);

	try {
		// 运行构建命令
		if (strategy.strategy.buildCommand) {
			logInfo("执行构建命令...");
			log(`命令: ${strategy.strategy.buildCommand}`, "blue");
			execSync(strategy.strategy.buildCommand, {
				stdio: "inherit",
				cwd: PROJECT_ROOT,
			});
			logSuccess("构建完成");
		}

		// 运行部署命令
		logInfo("执行部署命令...");
		log(`命令: ${strategy.strategy.deployCommand}`, "blue");

		const result = execSync(strategy.strategy.deployCommand, {
			stdio: "inherit",
			cwd: PROJECT_ROOT,
			encoding: "utf8",
		});

		logSuccess("部署完成");
		return { success: true, output: result };
	} catch (error) {
		logError(`部署失败: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// 部署后验证
function postDeploymentValidation(strategy, deployResult) {
	logSection("✅ 部署后验证");

	const validations = [];

	// 基础验证
	if (deployResult.success) {
		validations.push({
			name: "部署状态",
			passed: true,
			message: "部署成功完成",
		});
	} else {
		validations.push({
			name: "部署状态",
			passed: false,
			message: deployResult.error || "部署失败",
		});
		return validations;
	}

	// URL提取和验证
	const deployUrl = extractDeployUrl(deployResult.output, strategy.platform);
	if (deployUrl) {
		logSuccess(`部署URL: ${deployUrl}`);
		validations.push({
			name: "部署URL",
			passed: true,
			message: deployUrl,
		});

		// 健康检查
		const healthCheck = performHealthCheck(deployUrl);
		validations.push(healthCheck);
	} else {
		validations.push({
			name: "部署URL",
			passed: false,
			message: "无法提取部署URL",
		});
	}

	return validations;
}

function extractDeployUrl(output, platform) {
	if (!output) return null;

	const patterns = {
		vercel: /https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g,
		netlify: /https:\/\/[a-zA-Z0-9-]+\.netlify\.app/g,
		cloudflare: /https:\/\/[a-zA-Z0-9-]+\.workers\.dev/g,
	};

	const pattern = patterns[platform];
	if (pattern) {
		const match = output.match(pattern);
		return match ? match[0] : null;
	}

	return null;
}

function performHealthCheck(url) {
	try {
		logInfo("执行健康检查...");

		// 使用curl进行基础连接检查
		execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}`, {
			stdio: "ignore",
			timeout: 10000,
		});

		logSuccess("健康检查通过");
		return {
			name: "健康检查",
			passed: true,
			message: "服务正常响应",
		};
	} catch (error) {
		logWarning("健康检查失败，可能需要一些时间来启动");
		return {
			name: "健康检查",
			passed: false,
			message: "服务暂时无响应，请稍后手动检查",
		};
	}
}

// 生成部署报告
function generateDeploymentReport(
	strategy,
	preChecks,
	deployResult,
	postValidations,
) {
	const report = {
		timestamp: new Date().toISOString(),
		platform: strategy.platform,
		strategy: strategy.strategy.name,
		preDeploymentChecks: {
			total: preChecks.checks.length,
			passed: preChecks.checks.filter((c) => c.passed).length,
			details: preChecks.checks,
		},
		deployment: {
			success: deployResult.success,
			error: deployResult.error || null,
			output: deployResult.output || null,
		},
		postValidations: {
			total: postValidations.length,
			passed: postValidations.filter((v) => v.passed).length,
			details: postValidations,
		},
		summary: {
			overallSuccess: deployResult.success && preChecks.allPassed,
			deployUrl:
				postValidations.find((v) => v.name === "部署URL" && v.passed)
					?.message || null,
		},
	};

	// 保存报告
	const reportPath = path.join(PROJECT_ROOT, "deployment-report.json");
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	logSuccess(`部署报告已保存到: ${path.relative(PROJECT_ROOT, reportPath)}`);
	return report;
}

// 显示部署摘要
function displayDeploymentSummary(report) {
	console.log("\n📋 部署摘要:");
	console.log("==================");

	log(`平台: ${report.strategy}`, "cyan");
	log(
		`状态: ${report.summary.overallSuccess ? "成功" : "失败"}`,
		report.summary.overallSuccess ? "green" : "red",
	);

	if (report.summary.deployUrl) {
		log(`URL: ${report.summary.deployUrl}`, "blue");
	}

	console.log("\n检查结果:");
	log(
		`预部署检查: ${report.preDeploymentChecks.passed}/${report.preDeploymentChecks.total}`,
		report.preDeploymentChecks.passed === report.preDeploymentChecks.total
			? "green"
			: "yellow",
	);
	log(
		`部署后验证: ${report.postValidations.passed}/${report.postValidations.total}`,
		report.postValidations.passed === report.postValidations.total
			? "green"
			: "yellow",
	);

	if (!report.summary.overallSuccess) {
		console.log("\n❌ 失败的检查:");
		report.preDeploymentChecks.details
			.filter((c) => !c.passed)
			.forEach((c) => {
				log(`  • ${c.name}: ${c.message}`, "red");
			});

		report.postValidations
			.filter((v) => !v.passed)
			.forEach((v) => {
				log(`  • ${v.name}: ${v.message}`, "red");
			});
	}

	console.log("\n🎉 部署完成!");
	if (report.summary.deployUrl) {
		log(`请访问: ${report.summary.deployUrl}`, "cyan");
	}
}

// 主函数
async function main() {
	const args = process.argv.slice(2);
	const force = args.includes("--force");
	const skipChecks = args.includes("--skip-checks");

	log("🚀 自动边缘部署工具", "magenta");
	log("==================", "magenta");

	try {
		// 1. 环境检测
		logSection("🔍 环境检测");
		const systemInfo = detectSystemInfo();
		const platforms = detectEdgePlatforms();
		const projectConfig = detectProjectConfig();

		logInfo("环境检测完成");

		// 2. 选择部署策略
		const strategy = selectDeploymentStrategy(platforms, systemInfo);
		if (!strategy) {
			logError("无法找到合适的部署策略");
			process.exit(1);
		}

		// 3. 预部署检查
		let preChecks = { checks: [], allPassed: true };
		if (!skipChecks) {
			preChecks = preDeploymentChecks(strategy);

			if (!preChecks.allPassed && !force) {
				logError("预部署检查未通过，使用 --force 强制部署或修复问题后重试");
				process.exit(1);
			}
		} else {
			logWarning("跳过预部署检查 (--skip-checks)");
		}

		// 4. 确认部署
		if (!force) {
			log(`\n即将部署到: ${strategy.strategy.name}`, "yellow");
			log("按 Ctrl+C 取消，或按任意键继续...", "blue");

			// 简单的确认机制
			process.stdin.setRawMode(true);
			process.stdin.resume();
			await new Promise((resolve) => {
				process.stdin.once("data", () => {
					process.stdin.setRawMode(false);
					resolve();
				});
			});
		}

		// 5. 执行部署
		const deployResult = executeDeploy(strategy, force);

		// 6. 部署后验证
		const postValidations = postDeploymentValidation(strategy, deployResult);

		// 7. 生成报告
		const report = generateDeploymentReport(
			strategy,
			preChecks,
			deployResult,
			postValidations,
		);

		// 8. 显示摘要
		displayDeploymentSummary(report);

		process.exit(deployResult.success ? 0 : 1);
	} catch (error) {
		logError(`部署过程中发生错误: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

// 如果直接运行此脚本
if (require.main === module) {
	main();
}

module.exports = {
	selectDeploymentStrategy,
	preDeploymentChecks,
	executeDeploy,
	postDeploymentValidation,
	generateDeploymentReport,
};
