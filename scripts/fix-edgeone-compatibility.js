#!/usr/bin/env node

/**
 * EdgeOne兼容性自动修复脚本
 * 检测并修复项目中的EdgeOne部署兼容性问题
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 配置
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");

// 问题检测和修复规则
const COMPATIBILITY_FIXES = [
	{
		name: "Node.js文件系统API",
		pattern: /import.*fs.*from.*['"]fs['"];?/g,
		replacement: "// EdgeOne兼容: 使用客户端数据库替代文件系统",
		files: ["**/*.ts", "**/*.tsx"],
		description: "将Node.js文件系统API替换为客户端数据库",
	},
	{
		name: "HttpsProxyAgent依赖",
		pattern: /import.*HttpsProxyAgent.*from.*['"]https-proxy-agent['"];?/g,
		replacement: "// EdgeOne兼容: 使用边缘代理适配器",
		files: ["**/*.ts"],
		description: "移除Node.js代理依赖，使用边缘兼容的代理",
	},
	{
		name: "localStorage服务端访问",
		pattern: /localStorage\.(getItem|setItem|removeItem)/g,
		replacement: (match, method) => {
			if (method === "getItem") {
				return `(typeof window !== 'undefined' ? localStorage.getItem : (() => null))`;
			} else if (method === "setItem") {
				return `(typeof window !== 'undefined' ? localStorage.setItem : (() => {}))`;
			} else {
				return `(typeof window !== 'undefined' ? localStorage.removeItem : (() => {}))`;
			}
		},
		files: ["**/*.ts", "**/*.tsx"],
		description: "添加localStorage的服务端兼容检查",
	},
	{
		name: "process.env直接访问",
		pattern: /process\.env\.(\w+)/g,
		replacement: (match, envVar) => {
			return `(process.env?.${envVar} || '')`;
		},
		files: ["**/*.ts", "**/*.tsx"],
		description: "添加环境变量的安全访问",
	},
	{
		name: "EdgeRuntime全局变量",
		pattern: /typeof EdgeRuntime !== ['"]undefined['"];?/g,
		replacement: `(typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis)`,
		files: ["**/*.ts"],
		description: "修复EdgeRuntime检测方式",
	},
];

// 文件修复映射
const FILE_REPLACEMENTS = {
	"src/lib/book-source-storage.ts": "src/lib/book-source-storage-edge.ts",
	"src/lib/proxy-fetch.ts": "src/lib/proxy-fetch-edge.ts",
};

// 需要添加的EdgeOne特定文件
const EDGEONE_FILES = [
	{
		path: "src/lib/client-database.ts",
		description: "EdgeOne客户端数据库存储",
	},
	{
		path: "src/lib/edge-deployment-utils.ts",
		description: "EdgeOne部署工具",
	},
	{
		path: "src/app/api/book-sources/route.ts",
		description: "EdgeOne兼容的书源API",
	},
	{
		path: "src/app/api/proxy-fetch/route.ts",
		description: "EdgeOne代理请求API",
	},
];

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

// 获取所有匹配的文件
function getMatchingFiles(patterns, baseDir = SRC_DIR) {
	const files = [];

	function walkDir(dir) {
		const items = fs.readdirSync(dir);

		for (const item of items) {
			const fullPath = path.join(dir, item);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory()) {
				if (!item.startsWith(".") && item !== "node_modules") {
					walkDir(fullPath);
				}
			} else {
				const relativePath = path.relative(PROJECT_ROOT, fullPath);

				// 检查是否匹配任何模式
				for (const pattern of patterns) {
					const regex = new RegExp(
						pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
					);
					if (regex.test(relativePath)) {
						files.push(fullPath);
						break;
					}
				}
			}
		}
	}

	walkDir(baseDir);
	return files;
}

// 检测项目中的兼容性问题
function detectCompatibilityIssues() {
	logSection("🔍 检测EdgeOne兼容性问题");

	const issues = [];

	for (const fix of COMPATIBILITY_FIXES) {
		const matchingFiles = getMatchingFiles(fix.files);

		for (const filePath of matchingFiles) {
			try {
				const content = fs.readFileSync(filePath, "utf8");
				const matches = content.match(fix.pattern);

				if (matches) {
					issues.push({
						file: path.relative(PROJECT_ROOT, filePath),
						fix: fix.name,
						matches: matches.length,
						description: fix.description,
					});
				}
			} catch (error) {
				logWarning(`无法读取文件: ${filePath}`);
			}
		}
	}

	if (issues.length === 0) {
		logSuccess("未发现兼容性问题");
	} else {
		logWarning(`发现 ${issues.length} 个兼容性问题:`);
		issues.forEach((issue) => {
			log(`  ${issue.file}: ${issue.fix} (${issue.matches} 处)`);
			log(`    ${issue.description}`, "blue");
		});
	}

	return issues;
}

// 应用兼容性修复
function applyCompatibilityFixes(dryRun = false) {
	logSection("🔧 应用EdgeOne兼容性修复");

	let fixedCount = 0;

	for (const fix of COMPATIBILITY_FIXES) {
		const matchingFiles = getMatchingFiles(fix.files);

		for (const filePath of matchingFiles) {
			try {
				let content = fs.readFileSync(filePath, "utf8");
				let modified = false;

				if (typeof fix.replacement === "function") {
					content = content.replace(fix.pattern, (...args) => {
						modified = true;
						return fix.replacement(...args);
					});
				} else {
					if (fix.pattern.test(content)) {
						content = content.replace(fix.pattern, fix.replacement);
						modified = true;
					}
				}

				if (modified) {
					if (!dryRun) {
						fs.writeFileSync(filePath, content, "utf8");
					}

					const relativePath = path.relative(PROJECT_ROOT, filePath);
					logSuccess(
						`${dryRun ? "[模拟] " : ""}修复: ${relativePath} - ${fix.name}`,
					);
					fixedCount++;
				}
			} catch (error) {
				logError(`修复失败 ${filePath}: ${error.message}`);
			}
		}
	}

	if (fixedCount === 0) {
		logInfo("没有需要修复的文件");
	} else {
		logSuccess(`${dryRun ? "[模拟] " : ""}总共修复了 ${fixedCount} 个文件`);
	}

	return fixedCount;
}

// 更新文件引用
function updateFileReferences(dryRun = false) {
	logSection("📁 更新文件引用");

	let updatedCount = 0;

	for (const [oldPath, newPath] of Object.entries(FILE_REPLACEMENTS)) {
		const oldFullPath = path.join(PROJECT_ROOT, oldPath);
		const newFullPath = path.join(PROJECT_ROOT, newPath);

		// 检查新文件是否存在
		if (!fs.existsSync(newFullPath)) {
			logWarning(`EdgeOne兼容文件不存在: ${newPath}`);
			continue;
		}

		// 查找所有引用了旧文件的文件
		const allFiles = getMatchingFiles(["**/*.ts", "**/*.tsx"]);

		for (const filePath of allFiles) {
			try {
				let content = fs.readFileSync(filePath, "utf8");
				let modified = false;

				// 替换import语句
				const importPattern = new RegExp(
					`from\\s+['"]${oldPath.replace(/\./g, "\\.")}['"]`,
					"g",
				);
				if (importPattern.test(content)) {
					content = content.replace(importPattern, `from '${newPath}'`);
					modified = true;
				}

				// 替换相对路径导入
				const relativePattern = new RegExp(
					`from\\s+['"]\\.\\.?/.*${path.basename(oldPath, ".ts")}['"]`,
					"g",
				);
				if (relativePattern.test(content)) {
					const relativePath = path
						.relative(path.dirname(filePath), newFullPath)
						.replace(/\\/g, "/");
					content = content.replace(
						relativePattern,
						`from '${relativePath.replace(".ts", "")}'`,
					);
					modified = true;
				}

				if (modified) {
					if (!dryRun) {
						fs.writeFileSync(filePath, content, "utf8");
					}

					const relativeFilePath = path.relative(PROJECT_ROOT, filePath);
					logSuccess(`${dryRun ? "[模拟] " : ""}更新引用: ${relativeFilePath}`);
					updatedCount++;
				}
			} catch (error) {
				logError(`更新引用失败 ${filePath}: ${error.message}`);
			}
		}
	}

	if (updatedCount === 0) {
		logInfo("没有需要更新的文件引用");
	} else {
		logSuccess(
			`${dryRun ? "[模拟] " : ""}总共更新了 ${updatedCount} 个文件的引用`,
		);
	}

	return updatedCount;
}

// 检查EdgeOne特定文件
function checkEdgeOneFiles() {
	logSection("📋 检查EdgeOne特定文件");

	const missingFiles = [];
	const existingFiles = [];

	for (const fileInfo of EDGEONE_FILES) {
		const fullPath = path.join(PROJECT_ROOT, fileInfo.path);

		if (fs.existsSync(fullPath)) {
			existingFiles.push(fileInfo);
			logSuccess(`✓ ${fileInfo.path} - ${fileInfo.description}`);
		} else {
			missingFiles.push(fileInfo);
			logWarning(`✗ ${fileInfo.path} - ${fileInfo.description}`);
		}
	}

	if (missingFiles.length > 0) {
		logWarning(`缺少 ${missingFiles.length} 个EdgeOne特定文件`);
		log("请确保这些文件已正确创建并配置", "blue");
	} else {
		logSuccess("所有EdgeOne特定文件都已存在");
	}

	return { existingFiles, missingFiles };
}

// 验证Next.js配置
function validateNextConfig() {
	logSection("⚙️  验证Next.js配置");

	const configPath = path.join(PROJECT_ROOT, "next.config.ts");

	if (!fs.existsSync(configPath)) {
		logError("next.config.ts 文件不存在");
		return false;
	}

	try {
		const content = fs.readFileSync(configPath, "utf8");

		const checks = [
			{
				name: "边缘运行时配置",
				pattern: /experimental.*runtime.*edge/s,
				required: true,
			},
			{
				name: "输出配置",
				pattern: /output.*['"]standalone['"]/,
				required: true,
			},
			{
				name: "CORS头部配置",
				pattern: /Access-Control-Allow-Origin/,
				required: true,
			},
			{
				name: "Webpack边缘优化",
				pattern: /nextRuntime.*===.*['"]edge['"]/,
				required: false,
			},
		];

		let allPassed = true;

		for (const check of checks) {
			if (check.pattern.test(content)) {
				logSuccess(`✓ ${check.name}`);
			} else {
				if (check.required) {
					logError(`✗ ${check.name} (必需)`);
					allPassed = false;
				} else {
					logWarning(`⚠ ${check.name} (建议)`);
				}
			}
		}

		return allPassed;
	} catch (error) {
		logError(`读取Next.js配置失败: ${error.message}`);
		return false;
	}
}

// 检查package.json依赖
function checkDependencies() {
	logSection("📦 检查依赖兼容性");

	const packagePath = path.join(PROJECT_ROOT, "package.json");

	if (!fs.existsSync(packagePath)) {
		logError("package.json 文件不存在");
		return false;
	}

	try {
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		const problematicDeps = [
			{
				name: "vm2",
				reason: "EdgeOne不支持Node.js vm模块",
				solution: "移除或替换为Web API",
			},
			{
				name: "https-proxy-agent",
				reason: "EdgeOne不支持Node.js代理模块",
				solution: "使用边缘代理适配器",
			},
			{
				name: "cheerio",
				reason: "如果在边缘函数中使用可能有问题",
				solution: "考虑使用DOMParser或服务端处理",
			},
		];

		let hasIssues = false;

		for (const dep of problematicDeps) {
			if (dependencies[dep.name]) {
				logWarning(`⚠ 发现可能有问题的依赖: ${dep.name}`);
				log(`  原因: ${dep.reason}`, "yellow");
				log(`  建议: ${dep.solution}`, "blue");
				hasIssues = true;
			}
		}

		if (!hasIssues) {
			logSuccess("所有依赖都兼容EdgeOne");
		}

		return !hasIssues;
	} catch (error) {
		logError(`检查依赖失败: ${error.message}`);
		return false;
	}
}

// 生成EdgeOne部署报告
function generateDeploymentReport() {
	logSection("📊 生成EdgeOne部署报告");

	const report = {
		timestamp: new Date().toISOString(),
		platform: "EdgeOne",
		compatibility: {
			issues: detectCompatibilityIssues(),
			nextConfig: validateNextConfig(),
			dependencies: checkDependencies(),
			files: checkEdgeOneFiles(),
		},
		recommendations: [],
	};

	// 生成建议
	if (report.compatibility.issues.length > 0) {
		report.recommendations.push("运行自动修复以解决兼容性问题");
	}

	if (!report.compatibility.nextConfig) {
		report.recommendations.push("更新Next.js配置以支持EdgeOne");
	}

	if (!report.compatibility.dependencies) {
		report.recommendations.push("检查并更新有问题的依赖");
	}

	if (report.compatibility.files.missingFiles.length > 0) {
		report.recommendations.push("创建缺失的EdgeOne特定文件");
	}

	// 保存报告
	const reportPath = path.join(
		PROJECT_ROOT,
		"edgeone-compatibility-report.json",
	);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	logSuccess(
		`EdgeOne兼容性报告已保存到: ${path.relative(PROJECT_ROOT, reportPath)}`,
	);

	// 显示摘要
	console.log("\n📋 兼容性摘要:");
	log(
		`  兼容性问题: ${report.compatibility.issues.length}`,
		report.compatibility.issues.length > 0 ? "yellow" : "green",
	);
	log(
		`  Next.js配置: ${report.compatibility.nextConfig ? "✓" : "✗"}`,
		report.compatibility.nextConfig ? "green" : "red",
	);
	log(
		`  依赖检查: ${report.compatibility.dependencies ? "✓" : "✗"}`,
		report.compatibility.dependencies ? "green" : "red",
	);
	log(
		`  EdgeOne文件: ${report.compatibility.files.existingFiles.length}/${EDGEONE_FILES.length}`,
		report.compatibility.files.missingFiles.length === 0 ? "green" : "yellow",
	);

	if (report.recommendations.length > 0) {
		console.log("\n💡 建议:");
		report.recommendations.forEach((rec) => {
			log(`  • ${rec}`, "blue");
		});
	}

	return report;
}

// 主函数
function main() {
	const args = process.argv.slice(2);
	const command = args[0] || "check";
	const dryRun = args.includes("--dry-run");

	log("EdgeOne兼容性修复工具", "magenta");
	log("====================", "magenta");

	switch (command) {
		case "check":
			detectCompatibilityIssues();
			checkEdgeOneFiles();
			validateNextConfig();
			checkDependencies();
			break;

		case "fix":
			if (dryRun) {
				logInfo("运行模拟修复 (--dry-run)");
			}
			applyCompatibilityFixes(dryRun);
			updateFileReferences(dryRun);
			break;

		case "report":
			generateDeploymentReport();
			break;

		case "all":
			if (dryRun) {
				logInfo("运行完整检查和模拟修复 (--dry-run)");
			}
			applyCompatibilityFixes(dryRun);
			updateFileReferences(dryRun);
			generateDeploymentReport();
			break;

		default:
			console.log("使用方法:");
			console.log(
				"  node scripts/fix-edgeone-compatibility.js [command] [options]",
			);
			console.log("");
			console.log("命令:");
			console.log("  check   - 检查兼容性问题");
			console.log("  fix     - 应用兼容性修复");
			console.log("  report  - 生成部署报告");
			console.log("  all     - 执行修复并生成报告");
			console.log("");
			console.log("选项:");
			console.log("  --dry-run  - 模拟运行，不实际修改文件");
			break;
	}

	console.log("");
	logSuccess("EdgeOne兼容性检查完成");
}

// 运行主函数
if (require.main === module) {
	main();
}

module.exports = {
	detectCompatibilityIssues,
	applyCompatibilityFixes,
	updateFileReferences,
	checkEdgeOneFiles,
	validateNextConfig,
	checkDependencies,
	generateDeploymentReport,
};
