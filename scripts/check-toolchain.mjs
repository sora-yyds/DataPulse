import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const assertions = [];

function readText(relativePath) {
  return readFileSync(new URL(relativePath, new URL("../", import.meta.url)), "utf8").replaceAll("\r\n", "\n");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function record(name, passed, expected, actual) {
  assertions.push({ name, passed, expected, actual });
}

function equal(name, actual, expected) {
  record(name, Object.is(actual, expected), expected, actual);
}

function jsonEqual(name, actual, expected) {
  record(name, JSON.stringify(actual) === JSON.stringify(expected), expected, actual);
}

function commandOutput(command, args = ["--version"]) {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? (process.env.ComSpec ?? "cmd.exe") : command;
  const commandArguments = isWindows
    ? ["/d", "/s", "/c", `${command}.cmd ${args.join(" ")}`]
    : args;
  const result = spawnSync(executable, commandArguments, {
    cwd: rootDirectory,
    encoding: "utf8",
    env: process.env,
    shell: false,
  });

  if (result.error) {
    return `ERROR: ${result.error.message}`;
  }

  if (result.status !== 0) {
    return `EXIT ${String(result.status)}: ${(result.stderr || result.stdout).trim()}`;
  }

  return result.stdout.trim();
}

const packageJson = readJson("package.json");
const turboConfig = readJson("turbo.json");
const baseTsconfig = readJson("tsconfig.base.json");
const rootTsconfig = readJson("tsconfig.json");
const versions = {
  node: process.versions.node,
  corepack: commandOutput("corepack"),
  pnpm: commandOutput("pnpm"),
  turbo: commandOutput("turbo"),
  typescript: commandOutput("tsc"),
};
const pnpmProjectConfigOutput = commandOutput("pnpm", ["config", "list", "--location", "project", "--json"]);
let pnpmProjectConfig = {};

try {
  pnpmProjectConfig = JSON.parse(pnpmProjectConfigOutput);
} catch {
  record("pnpm 项目配置可回读", false, "有效 JSON", pnpmProjectConfigOutput);
}

equal("Node.js 版本", versions.node, "24.19.0");
equal("Corepack 版本", versions.corepack, "0.35.0");
equal("pnpm 版本", versions.pnpm, "11.20.0");
equal("Turbo 版本", versions.turbo, "2.10.8");
equal("TypeScript 版本", versions.typescript, "Version 6.0.3");

equal("根包名称", packageJson.name, "@datapulse/workspace");
equal("根包保持私有", packageJson.private, true);
equal("项目许可证", packageJson.license, "AGPL-3.0-only");
jsonEqual("精确 engines", packageJson.engines, {
  node: "24.19.0",
  pnpm: "11.20.0",
  corepack: "0.35.0",
});
equal(
  "packageManager 完整哈希",
  packageJson.packageManager,
  "pnpm@11.20.0+sha512.9a6f330a95b66446ea088faf1521405a8a01f07fde7124cc9958dfed52d4bb436737e65b08f85f37b46fcba375092558ac51262b816844b22f63406ed166bfee",
);
equal("Turbo 固定依赖", packageJson.devDependencies.turbo, "2.10.8");
equal("TypeScript 固定依赖", packageJson.devDependencies.typescript, "6.0.3");
equal("公开工具链脚本", packageJson.scripts["check:toolchain"], "turbo run check:toolchain:root");
equal("根工具链断言脚本", packageJson.scripts["check:toolchain:root"], "node ./scripts/check-toolchain.mjs");

equal(".node-version", readText(".node-version").trim(), "24.19.0");
equal(
  ".corepack.env",
  readText(".corepack.env").trim(),
  [
    "COREPACK_DEFAULT_TO_LATEST=0",
    "COREPACK_ENABLE_AUTO_PIN=0",
    "COREPACK_ENABLE_PROJECT_SPEC=1",
    "COREPACK_ENABLE_STRICT=1",
  ].join("\n"),
);
jsonEqual("pnpm workspace 边界", pnpmProjectConfig.packages, ["apps/*", "packages/*", "services/*"]);

record(
  "锁文件版本",
  /^lockfileVersion: '9\.0'\n/.test(readText("pnpm-lock.yaml")),
  true,
  /^lockfileVersion: '9\.0'\n/.test(readText("pnpm-lock.yaml")),
);
record(
  "锁文件关闭自动 peer 安装",
  /settings:\n  autoInstallPeers: false\n/.test(readText("pnpm-lock.yaml")),
  true,
  /settings:\n  autoInstallPeers: false\n/.test(readText("pnpm-lock.yaml")),
);

for (const [setting, expected] of Object.entries({
  engineStrict: true,
  saveExact: true,
  strictPeerDependencies: true,
  autoInstallPeers: false,
  linkWorkspacePackages: false,
  sharedWorkspaceLockfile: true,
})) {
  equal(`pnpm 生效配置 ${setting}`, pnpmProjectConfig[setting], expected);
}

jsonEqual("Turbo 根任务", turboConfig.tasks["//#check:toolchain:root"], {
  cache: false,
  outputs: [],
});

const strictCompilerOptions = {
  target: "ES2022",
  lib: ["ES2022"],
  module: "ESNext",
  moduleResolution: "Bundler",
  types: [],
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noPropertyAccessFromIndexSignature: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: false,
  noEmitOnError: true,
};

for (const [option, expected] of Object.entries(strictCompilerOptions)) {
  jsonEqual(`TypeScript ${option}`, baseTsconfig.compilerOptions[option], expected);
}

for (const option of [
  "alwaysStrict",
  "noImplicitAny",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
]) {
  record(
    `TypeScript ${option} 未被关闭`,
    baseTsconfig.compilerOptions[option] !== false,
    "不是 false",
    baseTsconfig.compilerOptions[option],
  );
}

equal("根 TypeScript 不产出文件", rootTsconfig.compilerOptions.noEmit, true);
jsonEqual("根 TypeScript 输入为空", rootTsconfig.files, []);
jsonEqual("根 TypeScript 引用显式为空", rootTsconfig.references, []);
const tsconfigLoadOutput = commandOutput("tsc", ["--showConfig", "--project", "tsconfig.json"]);
const tsconfigLoaded = !tsconfigLoadOutput.startsWith("ERROR:") && !tsconfigLoadOutput.startsWith("EXIT ");
record("TypeScript 根配置可加载", tsconfigLoaded, true, tsconfigLoaded);

const failedAssertions = assertions.filter(({ passed }) => !passed);
const summary = {
  check: "toolchain",
  result: failedAssertions.length === 0 ? "passed" : "failed",
  platform: process.platform,
  architecture: process.arch,
  versions,
  assertions: {
    executed: assertions.length,
    passed: assertions.length - failedAssertions.length,
    failed: failedAssertions.length,
    skipped: 0,
  },
  failures: failedAssertions.map(({ name, expected, actual }) => ({ name, expected, actual })),
};

console.log(JSON.stringify(summary, null, 2));

if (failedAssertions.length > 0) {
  process.exitCode = 1;
}
