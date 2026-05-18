#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const changedFilePath = process.argv[2] ?? "changed-files.txt";
const envOutPath = process.argv[3] ?? "deploy-plan.env";
const mdOutPath = process.argv[4] ?? "deploy-plan.md";

const readLines = (filePath) => {
	if (!fs.existsSync(filePath)) return [];
	return fs
		.readFileSync(filePath, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.replaceAll("\\", "/"));
};

const changedFiles = readLines(changedFilePath);
const buildServices = new Set();
const restartServices = new Set();
const reasons = new Map();
const notes = [];

const addReason = (service, reason) => {
	if (!reasons.has(service)) reasons.set(service, new Set());
	reasons.get(service).add(reason);
};

const build = (service, reason) => {
	buildServices.add(service);
	addReason(service, reason);
};

const restart = (service, reason) => {
	restartServices.add(service);
	addReason(service, reason);
};

const userverServices = [
	"userver-health",
	"userver-instance",
	"userver-invites",
	"userver-presence",
	"userver-tenor",
];

const rootFrontendFiles = new Set([
	"App.tsx",
	"index.html",
	"index.tsx",
	"package.json",
	"pnpm-lock.yaml",
	"postcss.config.js",
	"rspack.config.mjs",
	"translations.ts",
	"tsconfig.json",
	"types.ts",
	"vite.config.ts",
	"vitest.config.ts",
]);

for (const file of changedFiles) {
	if (file.startsWith(".github/workflows/")) {
		notes.push(`${file}: workflow-only change, no production service restart`);
		continue;
	}

	if (file.startsWith("deploy/") || file.startsWith("scripts/deploy/")) {
		notes.push(`${file}: deploy tooling/docs synced only`);
		continue;
	}

	if (file === "dev/compose.yaml") {
		notes.push(`${file}: compose file changed; workflow syncs it but does not run a full stack converge automatically`);
		continue;
	}

	if (file === "dev/Caddyfile.dev" || file.startsWith("astral_devops/caddy")) {
		restart("caddy", "Caddy routing/config changed");
		continue;
	}

	if (
		file.startsWith("src/") ||
		file.startsWith("crates/") ||
		file.startsWith("assets/") ||
		file.startsWith("scripts/build-") ||
		file.startsWith("scripts/generate-") ||
		rootFrontendFiles.has(file)
	) {
		restart("app", "root frontend changed");
		restart("caddy", "frontend assets/routes may have changed");
		continue;
	}

	if (file.startsWith("astral_api/")) {
		restart("api", "API source changed");
		restart("worker", "API worker source may have changed");
		restart("caddy", "API route health should be refreshed");
		continue;
	}

	if (file.startsWith("astral_gateway/")) {
		restart("gateway", "gateway source changed");
		restart("caddy", "gateway upstream should be refreshed");
		continue;
	}

	if (file.startsWith("astral_admin/")) {
		build("admin", "admin image/source changed");
		restart("caddy", "admin upstream should be refreshed");
		continue;
	}

	if (file.startsWith("astral_marketing/")) {
		build("marketing", "marketing image/source changed");
		restart("caddy", "marketing upstream should be refreshed");
		continue;
	}

	if (file.startsWith("astral_media_proxy/")) {
		build("media", "media proxy image/source changed");
		restart("caddy", "media upstream should be refreshed");
		continue;
	}

	if (file.startsWith("astral_docs/")) {
		restart("docs", "docs source changed");
		restart("caddy", "docs upstream should be refreshed");
		continue;
	}

	if (file.startsWith("astral_metrics/")) {
		build("metrics", "metrics source changed");
		build("metrics-clickhouse", "metrics source changed");
		continue;
	}

	if (file.startsWith("services/common/")) {
		for (const service of userverServices) build(service, "shared userver code changed");
		continue;
	}

	for (const service of userverServices) {
		const dir = service.replace("userver-", "userver_");
		if (file.startsWith(`services/${dir}/`)) {
			build(service, `${service} source changed`);
		}
	}
}

// Avoid building and then separately restarting the same service.
for (const service of buildServices) restartServices.delete(service);

const sort = (items) => [...items].sort();
const buildList = sort(buildServices);
const restartList = sort(restartServices);
const profileList = [];

if (buildList.some((service) => service.startsWith("userver-"))) profileList.push("userver");
if (buildList.includes("metrics-clickhouse") || buildList.includes("metrics")) profileList.push("clickhouse");

const shellValue = (items) => items.join(" ");
const envLines = [
	`BUILD_SERVICES=${shellValue(buildList)}`,
	`RESTART_SERVICES=${shellValue(restartList)}`,
	`COMPOSE_PROFILES=${profileList.join(" ")}`,
	`HAS_DEPLOY_WORK=${buildList.length || restartList.length ? "true" : "false"}`,
];

fs.writeFileSync(envOutPath, `${envLines.join("\n")}\n`);

const md = [];
md.push("# Production Sync Plan");
md.push("");
md.push(`Changed files: ${changedFiles.length}`);
md.push("");
md.push(`Build services: ${buildList.length ? buildList.map((s) => `\`${s}\``).join(", ") : "_none_"}`);
md.push(`Restart services: ${restartList.length ? restartList.map((s) => `\`${s}\``).join(", ") : "_none_"}`);
md.push(`Compose profiles: ${profileList.length ? profileList.map((s) => `\`${s}\``).join(", ") : "_none_"}`);
md.push("");
if (reasons.size) {
	md.push("## Reasons");
	md.push("");
	for (const service of sort(reasons.keys())) {
		md.push(`- \`${service}\`: ${[...reasons.get(service)].sort().join("; ")}`);
	}
	md.push("");
}
if (notes.length) {
	md.push("## Notes");
	md.push("");
	for (const note of notes) md.push(`- ${note}`);
	md.push("");
}
md.push("## Changed Files");
md.push("");
for (const file of changedFiles) md.push(`- \`${file}\``);
md.push("");

fs.writeFileSync(mdOutPath, `${md.join("\n")}\n`);

console.log(fs.readFileSync(mdOutPath, "utf8"));
