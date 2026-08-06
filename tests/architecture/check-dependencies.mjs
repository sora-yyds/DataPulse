import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeDependencyBoundaries } from "./dependency-boundaries.mjs";

const defaultRepositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const checkScriptPath = fileURLToPath(import.meta.url);
const pinnedNodeVersion = "v24.19.0";
const pinnedTypeScriptVersion = "6.0.3";
const domainTypeScriptCliPath = resolve(
  defaultRepositoryRoot,
  "node_modules/typescript/bin/tsc",
);
const domainTypeScriptManifestPath = resolve(
  defaultRepositoryRoot,
  "node_modules/typescript/package.json",
);
const domainTypeScriptProjectPath = resolve(
  defaultRepositoryRoot,
  "packages/domain/tsconfig.json",
);
const domainContractPath = resolve(
  defaultRepositoryRoot,
  "packages/domain/tests/domain-contract.mjs",
);
const canonicalPnpmWorkspaceConfiguration = [
  "packages:",
  '  - "apps/*"',
  '  - "packages/*"',
  '  - "services/*"',
  "",
  "allowBuilds:",
  "  esbuild: true",
  "",
  "engineStrict: true",
  "saveExact: true",
  "strictPeerDependencies: true",
  "autoInstallPeers: false",
  "linkWorkspacePackages: false",
  "sharedWorkspaceLockfile: true",
  "",
].join("\n");

function domainContractFailure(code, message, expected, actual) {
  return {
    result: "failed",
    assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
    failures: [
      {
        code,
        subject: "packages/domain",
        message,
        expected,
        actual,
      },
    ],
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function normalizeDomainContractReport(rawReport) {
  try {
    if (!isPlainObject(rawReport)) {
      throw new TypeError("invalid report object");
    }

    const assertions = rawReport.assertions;
    const failures = rawReport.failures;
    const assertionKeys = ["executed", "failed", "passed", "skipped"];
    const counts = isPlainObject(assertions)
      ? [assertions.executed, assertions.passed, assertions.failed, assertions.skipped]
      : [];
    const countsAreValid =
      counts.length === 4 && counts.every((value) => Number.isInteger(value) && value >= 0);
    const shapeIsValid =
      (rawReport.result === "passed" || rawReport.result === "failed") &&
      isPlainObject(assertions) &&
      hasExactKeys(assertions, assertionKeys) &&
      countsAreValid &&
      assertions.executed >= 1 &&
      assertions.executed === assertions.passed + assertions.failed + assertions.skipped &&
      assertions.skipped === 0 &&
      Array.isArray(failures) &&
      failures.every((failure) => typeof failure === "string") &&
      failures.length === assertions.failed &&
      (rawReport.result === "passed") === (assertions.failed === 0);

    if (!shapeIsValid) {
      throw new TypeError("invalid report shape");
    }

    return {
      result: rawReport.result,
      assertions: {
        executed: assertions.executed,
        passed: assertions.passed,
        failed: assertions.failed,
        skipped: assertions.skipped,
      },
      failures: failures.map((_, index) => ({
        code: "DOMAIN_CONTRACT_ASSERTION_FAILED",
        subject: `packages/domain contract assertion ${index + 1}`,
        message: "领域合同断言未满足",
        expected: "passed",
        actual: "failed",
      })),
    };
  } catch {
    return domainContractFailure(
      "DOMAIN_CONTRACT_REPORT_INVALID",
      "领域合同返回了无效或不一致的结构化摘要",
      "精确且一致的 passed/failed 断言计数、executed>=1 且 skipped=0",
      "invalid-report",
    );
  }
}

async function runRepositoryDomainContract() {
  if (process.version !== pinnedNodeVersion) {
    return domainContractFailure(
      "DOMAIN_CONTRACT_NODE_VERSION_MISMATCH",
      "领域合同必须使用仓库固定的 Node 版本运行",
      pinnedNodeVersion,
      process.version,
    );
  }

  if (!existsSync(domainTypeScriptCliPath) || !existsSync(domainTypeScriptManifestPath)) {
    return domainContractFailure(
      "DOMAIN_CONTRACT_TYPESCRIPT_CLI_MISSING",
      "领域合同构建所需的仓库本地 TypeScript CLI 不可用",
      `typescript@${pinnedTypeScriptVersion}`,
      "unavailable",
    );
  }

  let installedTypeScriptVersion;
  try {
    installedTypeScriptVersion = JSON.parse(
      readFileSync(domainTypeScriptManifestPath, "utf8"),
    ).version;
  } catch {
    return domainContractFailure(
      "DOMAIN_CONTRACT_TYPESCRIPT_CLI_INVALID",
      "无法验证领域合同构建所使用的本地 TypeScript CLI",
      `typescript@${pinnedTypeScriptVersion}`,
      "invalid-manifest",
    );
  }

  if (installedTypeScriptVersion !== pinnedTypeScriptVersion) {
    return domainContractFailure(
      "DOMAIN_CONTRACT_TYPESCRIPT_VERSION_MISMATCH",
      "领域合同必须使用仓库固定的 TypeScript 版本构建",
      pinnedTypeScriptVersion,
      "version-mismatch",
    );
  }

  const buildResult = spawnSync(
    process.execPath,
    [domainTypeScriptCliPath, "--build", domainTypeScriptProjectPath],
    {
      cwd: defaultRepositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (buildResult.error) {
    return domainContractFailure(
      "DOMAIN_CONTRACT_BUILD_START_FAILED",
      "领域合同的 TypeScript 构建进程无法启动",
      "build-started",
      "build-not-started",
    );
  }
  if (buildResult.status !== 0) {
    return domainContractFailure(
      "DOMAIN_CONTRACT_BUILD_FAILED",
      "领域合同的 TypeScript 构建失败",
      { exitCode: 0, signal: null },
      {
        exitCode: buildResult.status,
        signal: typeof buildResult.signal === "string" ? buildResult.signal : null,
      },
    );
  }

  let contractModule;
  try {
    contractModule = await import(pathToFileURL(domainContractPath).href);
  } catch {
    return domainContractFailure(
      "DOMAIN_CONTRACT_IMPORT_FAILED",
      "已构建的领域合同无法加载",
      "module-loaded",
      "module-load-failed",
    );
  }

  if (typeof contractModule.runDomainContract !== "function") {
    return domainContractFailure(
      "DOMAIN_CONTRACT_EXPORT_INVALID",
      "领域合同未公开预期的运行入口",
      "runDomainContract function",
      "missing-or-invalid-export",
    );
  }

  let rawReport;
  try {
    rawReport = await contractModule.runDomainContract();
  } catch {
    return domainContractFailure(
      "DOMAIN_CONTRACT_EXECUTION_FAILED",
      "领域合同执行失败",
      "structured-report",
      "execution-failed",
    );
  }

  return normalizeDomainContractReport(rawReport);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeSource(path, source) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source.endsWith("\n") ? source : `${source}\n`, "utf8");
}

function workspacePathByName(root, packageName) {
  for (const scope of ["apps", "packages", "services"]) {
    const scopePath = resolve(root, scope);
    if (!existsSync(scopePath)) {
      continue;
    }
    for (const entry of readdirSync(scopePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const workspacePath = `${scope}/${entry.name}`;
      const manifestPath = resolve(root, workspacePath, "package.json");
      if (!existsSync(manifestPath)) {
        continue;
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.name === packageName) {
        return workspacePath;
      }
    }
  }
  return null;
}

function referencesForDependencies(root, workspacePath, dependencies) {
  return Object.keys(dependencies).map((dependencyName) => {
    const targetWorkspacePath = workspacePathByName(root, dependencyName);
    if (!targetWorkspacePath) {
      throw new Error(`Self-test fixture is missing ${dependencyName}`);
    }
    const referencePath = normalizePath(
      relative(resolve(root, workspacePath), resolve(root, targetWorkspacePath)),
    );
    return { path: referencePath };
  });
}

function writeWorkspace(root, definition) {
  const workspaceRoot = resolve(root, definition.path);
  const manifest = {
    name: definition.name,
    version: "0.0.0",
    private: true,
    type: "module",
    license: "AGPL-3.0-only",
    ...(definition.exports ? { exports: definition.exports } : {}),
    dependencies: definition.dependencies ?? {},
    ...(definition.devDependencies
      ? { devDependencies: definition.devDependencies }
      : {}),
  };
  writeJson(resolve(workspaceRoot, "package.json"), manifest);
  writeJson(resolve(workspaceRoot, "tsconfig.json"), {
    compilerOptions: { composite: true },
    include: ["src/**/*.ts"],
    references: definition.references ?? [],
  });
  for (const [sourcePath, source] of Object.entries(definition.sources ?? { "index.ts": "export {};" })) {
    writeSource(resolve(workspaceRoot, "src", sourcePath), source);
  }
}

function updateWorkspaceDependencies(root, workspacePath, dependencies) {
  const manifestPath = resolve(root, workspacePath, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies = dependencies;
  writeJson(manifestPath, manifest);

  const tsconfigPath = resolve(root, workspacePath, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  tsconfig.references = referencesForDependencies(root, workspacePath, dependencies);
  writeJson(tsconfigPath, tsconfig);
}

function mutateWorkspaceManifest(root, workspacePath, mutate) {
  const manifestPath = resolve(root, workspacePath, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  writeJson(manifestPath, manifest);
}

function mutateRootManifest(root, mutate) {
  const manifestPath = resolve(root, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  writeJson(manifestPath, manifest);
}

function createBaseFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "datapulse-dependency-boundaries-"));

  writeSource(resolve(root, "pnpm-workspace.yaml"), canonicalPnpmWorkspaceConfiguration);
  writeJson(resolve(root, "package.json"), {
    name: "@datapulse/self-test-workspace",
    private: true,
    type: "module",
    scripts: {},
  });

  writeWorkspace(root, {
    path: "packages/domain",
    name: "@datapulse/domain",
    exports: { ".": "./src/index.ts" },
  });
  writeWorkspace(root, {
    path: "packages/api-contracts",
    name: "@datapulse/api-contracts",
    exports: {
      "./connector-message": "./src/connector-message.ts",
      "./http": "./src/http.ts",
      "./origin-policy": "./src/origin-policy.ts",
    },
    dependencies: { "@datapulse/domain": "workspace:*" },
    references: [{ path: "../domain" }],
    sources: {
      "connector-message.ts": "export {};",
      "http.ts": 'import "@datapulse/domain";\nexport {};',
      "origin-policy.ts": "export {};",
    },
  });
  writeWorkspace(root, {
    path: "apps/creator",
    name: "@datapulse/creator",
    dependencies: { "@datapulse/domain": "workspace:*", react: "19.0.0" },
    references: [{ path: "../../packages/domain" }],
    sources: {
      "main.ts": 'import "@datapulse/domain";\nimport "react/jsx-runtime";\nexport {};',
    },
  });
  writeWorkspace(root, {
    path: "apps/viewer",
    name: "@datapulse/viewer",
    sources: { "main.ts": "export {};" },
  });
  writeWorkspace(root, {
    path: "apps/custom-connector",
    name: "@datapulse/custom-connector",
    dependencies: { "@datapulse/api-contracts": "workspace:*" },
    references: [{ path: "../../packages/api-contracts" }],
    sources: {
      "main.ts": 'import "@datapulse/api-contracts/connector-message";\nexport {};',
    },
  });
  writeWorkspace(root, {
    path: "services/share-api",
    name: "@datapulse/share-api",
    dependencies: { "@datapulse/api-contracts": "workspace:*" },
    references: [{ path: "../../packages/api-contracts" }],
    sources: { "main.ts": 'import "@datapulse/api-contracts/http";\nexport {};' },
  });

  return root;
}

function addAnalysisEngine(root) {
  writeWorkspace(root, {
    path: "packages/analysis-engine",
    name: "@datapulse/analysis-engine",
    exports: { ".": "./src/index.ts" },
    dependencies: { "@datapulse/domain": "workspace:*" },
    references: [{ path: "../domain" }],
    sources: { "index.ts": 'import "@datapulse/domain";\nexport {};' },
  });
}

function addMetricRuntime(root, source = 'import "@datapulse/domain";\nexport const value = 1;') {
  writeWorkspace(root, {
    path: "packages/metric-runtime",
    name: "@datapulse/metric-runtime",
    exports: { ".": "./src/index.ts" },
    dependencies: { "@datapulse/domain": "workspace:*" },
    devDependencies: {
      ajv: "8.17.1",
      "json-schema-to-typescript": "15.0.4",
    },
    references: [{ path: "../domain" }],
    sources: { "index.ts": source },
  });
  writeSource(
    resolve(root, "packages/metric-runtime/scripts/generate-artifacts.mjs"),
    'import { readFileSync } from "node:fs";\nimport Ajv from "ajv";\nimport { compile } from "json-schema-to-typescript";\nvoid readFileSync;\nvoid Ajv;\nvoid compile;\nexport {};',
  );
}

function addWorkspaceDependency(root, workspacePath, dependencyName, referencePath) {
  mutateWorkspaceManifest(root, workspacePath, (manifest) => {
    manifest.dependencies[dependencyName] = "workspace:*";
  });
  const tsconfigPath = resolve(root, workspacePath, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  tsconfig.references.push({ path: referencePath });
  writeJson(tsconfigPath, tsconfig);
}

function addLocalStorage(root) {
  writeWorkspace(root, {
    path: "packages/local-storage",
    name: "@datapulse/local-storage",
    exports: { ".": "./src/index.ts" },
  });
}

function cleanFixture(root) {
  const temporaryRoot = resolve(tmpdir());
  const fixtureRoot = resolve(root);
  const relativePath = relative(temporaryRoot, fixtureRoot);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(`Refusing to remove non-fixture path: ${fixtureRoot}`);
  }
  rmSync(fixtureRoot, { recursive: true, force: true });
}

function runSelfTests() {
  const assertions = [];

  const record = (name, passed, expected, actual) => {
    assertions.push({ name, passed, expected, actual });
  };

  const withFixture = (callback) => {
    const root = createBaseFixture();
    try {
      return callback(root);
    } finally {
      cleanFixture(root);
    }
  };

  const expectFailureCodes = (name, mutate, expectedCodes) => {
    withFixture((root) => {
      mutate(root);
      const report = analyzeDependencyBoundaries({ repositoryRoot: root });
      const actualCodes = new Set(report.failures.map(({ code }) => code));
      record(`${name} 返回 failed`, report.result === "failed", "failed", report.result);
      for (const expectedCode of expectedCodes) {
        record(
          `${name} 命中 ${expectedCode}`,
          actualCodes.has(expectedCode),
          expectedCode,
          [...actualCodes].sort(),
        );
      }
    });
  };

  const malformedDomainContractReports = [
    {
      result: "passed",
      assertions: { executed: 0, passed: 0, failed: 0, skipped: 0 },
      failures: [],
    },
    {
      result: "passed",
      assertions: {
        executed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        debugPayload: "must-not-propagate",
      },
      failures: [],
    },
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("must-not-escape");
        },
      },
    ),
  ].map((report) => normalizeDomainContractReport(report));
  record(
    "空或畸形 domain 合同摘要 fail-closed",
    malformedDomainContractReports.every(
      (report) =>
        report.result === "failed" &&
        report.failures[0]?.code === "DOMAIN_CONTRACT_REPORT_INVALID",
    ),
    "DOMAIN_CONTRACT_REPORT_INVALID",
    malformedDomainContractReports.map(
      (report) => report.failures[0]?.code ?? report.result,
    ),
  );

  withFixture((root) => {
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record("合法六 workspace 通过", report.result === "passed", "passed", report.result);
    record(
      "合法六 workspace 不含跳过断言",
      report.assertions.skipped === 0,
      0,
      report.assertions.skipped,
    );
    record(
      "合法 Connector 消息子路径与 Share HTTP 子路径通过",
      report.failures.length === 0,
      [],
      report.failures,
    );
  });

  withFixture((root) => {
    addMetricRuntime(
      root,
      [
        'import "@datapulse/domain";',
        "const fetch = () => 1;",
        "const localStorage = { value: 1 };",
        "class Date {}",
        "const Math = { random: () => 0.5 };",
        "const Intl = { NumberFormat: () => ({ format: String }) };",
        "const sample = { toLocaleString: () => \"local\" };",
        "const globalThis = { fetch };",
        "void fetch();",
        "void localStorage.value;",
        "void new Date();",
        "void Math.random();",
        "void Intl.NumberFormat();",
        "void sample.toLocaleString();",
        "void globalThis.fetch();",
        "export {};",
      ].join("\n"),
    );
    addWorkspaceDependency(
      root,
      "apps/creator",
      "@datapulse/metric-runtime",
      "../../packages/metric-runtime",
    );
    writeSource(
      resolve(root, "apps/creator/src/main.ts"),
      'import "@datapulse/domain";\nimport "@datapulse/metric-runtime";\nimport "react/jsx-runtime";\nexport {};',
    );
    addWorkspaceDependency(
      root,
      "apps/viewer",
      "@datapulse/metric-runtime",
      "../../packages/metric-runtime",
    );
    writeSource(
      resolve(root, "apps/viewer/src/main.ts"),
      'import "@datapulse/metric-runtime";\nexport {};',
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record(
      "合法 Metric Runtime、Creator／Viewer 消费与局部同名绑定通过",
      report.result === "passed",
      "passed",
      report,
    );
  });

  withFixture((root) => {
    addMetricRuntime(
      root,
      [
        'import "@datapulse/domain";',
        'void (1).toLocaleString("zh-CN");',
        'void "a".localeCompare("b", "zh-CN");',
        "export {};",
      ].join("\n"),
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record(
      "Metric Runtime 显式字面量 locale 与构建脚本工具依赖通过",
      report.result === "passed",
      "passed",
      report,
    );
  });

  withFixture((root) => {
    writeSource(
      resolve(root, "services/share-api/src/main.ts"),
      'import "@datapulse/api-contracts/http";\nprocess.exitCode = 0;\nexport {};',
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record(
      "非浏览器 workspace 可直接设置 CLI exitCode",
      report.result === "passed",
      "passed",
      report,
    );
  });

  withFixture((root) => {
    writeSource(
      resolve(root, "apps/creator/src/local-bindings.ts"),
      'function require(value: string) { return value; }\nconst module = { value: 1 };\nrequire("not-a-package");\nconsole.log(module.value);\nexport {};',
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record("局部 require/module 绑定不冒充运行时解析器", report.result === "passed", "passed", report);
  });

  withFixture((root) => {
    writeSource(resolve(root, "apps/creator/..hidden/inside.ts"), "export {};\n");
    writeSource(
      resolve(root, "apps/creator/src/main.ts"),
      'import "../..hidden/inside.js";\nimport "@datapulse/domain";\nexport {};',
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record("workspace 内 ..hidden 目录不被误判为父级逃逸", report.result === "passed", "passed", report);
  });

  withFixture((root) => {
    writeSource(
      resolve(root, "apps/creator/vite.config.ts"),
      'export default { server: { port: 4173 }, build: { sourcemap: true } };',
    );
    const report = analyzeDependencyBoundaries({ repositoryRoot: root });
    record("单一静态 Vite 默认配置可通过", report.result === "passed", "passed", report);
  });

  expectFailureCodes(
    "Metric Runtime 运行时外部依赖旁路",
    (root) => {
      addMetricRuntime(
        root,
        'import "@datapulse/domain";\nimport "react";\nexport {};',
      );
      mutateWorkspaceManifest(root, "packages/metric-runtime", (manifest) => {
        manifest.dependencies.react = "19.0.0";
      });
    },
    [
      "ARCH_PURE_RUNTIME_MANIFEST_DEPENDENCY_BOUNDARY",
      "ARCH_PURE_RUNTIME_EXTERNAL_IMPORT_BOUNDARY",
    ],
  );

  expectFailureCodes(
    "Metric Runtime 产品源码导入构建期工具旁路",
    (root) => {
      addMetricRuntime(
        root,
        'import "@datapulse/domain";\nimport Ajv from "ajv";\nvoid Ajv;\nexport {};',
      );
    },
    ["ARCH_PURE_RUNTIME_EXTERNAL_IMPORT_BOUNDARY"],
  );

  expectFailureCodes(
    "Metric Runtime 未批准构建期依赖旁路",
    (root) => {
      addMetricRuntime(root);
      mutateWorkspaceManifest(root, "packages/metric-runtime", (manifest) => {
        manifest.devDependencies.vite = "8.2.0";
      });
    },
    ["ARCH_PURE_RUNTIME_MANIFEST_DEPENDENCY_BOUNDARY"],
  );

  expectFailureCodes(
    "Metric Runtime Node builtin 旁路",
    (root) => {
      addMetricRuntime(
        root,
        'import "@datapulse/domain";\nimport "node:fs";\nexport {};',
      );
    },
    ["ARCH_PURE_RUNTIME_BUILTIN_BOUNDARY"],
  );

  expectFailureCodes(
    "Metric Runtime 网络与存储全局旁路",
    (root) => {
      addMetricRuntime(
        root,
        [
          'import "@datapulse/domain";',
          'void fetch("https://invalid.example");',
          "void globalThis.localStorage;",
          "void indexedDB;",
          "void navigator.sendBeacon;",
          "void process.env;",
          "void Buffer;",
          "export {};",
        ].join("\n"),
      );
    },
    ["ARCH_PURE_RUNTIME_CAPABILITY_BOUNDARY"],
  );

  expectFailureCodes(
    "Metric Runtime 设备时间与随机数旁路",
    (root) => {
      addMetricRuntime(
        root,
        [
          'import "@datapulse/domain";',
          "void Date.now();",
          "void new Date();",
          "void Math.random();",
          "const random = Math.random;",
          "void random;",
          "void crypto.getRandomValues;",
          "void performance.now();",
          "export {};",
        ].join("\n"),
      );
    },
    ["ARCH_PURE_RUNTIME_NONDETERMINISTIC_BOUNDARY"],
  );

  expectFailureCodes(
    "Metric Runtime 隐式 locale 旁路",
    (root) => {
      addMetricRuntime(
        root,
        [
          'import "@datapulse/domain";',
          "void (1).toLocaleString();",
          'void "a".localeCompare("b");',
          "void new Intl.NumberFormat();",
          "export {};",
        ].join("\n"),
      );
    },
    ["ARCH_PURE_RUNTIME_IMPLICIT_LOCALE"],
  );

  expectFailureCodes(
    "Metric Runtime ambient 声明伪装全局能力",
    (root) => {
      addMetricRuntime(
        root,
        [
          'import "@datapulse/domain";',
          'void fetch("https://invalid.example");',
          "void Date.now();",
          "void (1).toLocaleString();",
          "export {};",
        ].join("\n"),
      );
      writeSource(
        resolve(root, "packages/metric-runtime/src/ambient.d.ts"),
        [
          "declare function fetch(input: string): unknown;",
          "declare const Date: { now(): number };",
          "interface Number { toLocaleString(): string; }",
        ].join("\n"),
      );
    },
    [
      "ARCH_PURE_RUNTIME_CAPABILITY_BOUNDARY",
      "ARCH_PURE_RUNTIME_NONDETERMINISTIC_BOUNDARY",
      "ARCH_PURE_RUNTIME_IMPLICIT_LOCALE",
    ],
  );

  expectFailureCodes(
    "Metric Runtime 越界依赖",
    (root) => {
      addMetricRuntime(root);
      mutateWorkspaceManifest(root, "packages/metric-runtime", (manifest) => {
        manifest.dependencies["@datapulse/api-contracts"] = "workspace:*";
      });
      const tsconfigPath = resolve(root, "packages/metric-runtime/tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      tsconfig.references.push({ path: "../api-contracts" });
      writeJson(tsconfigPath, tsconfig);
      writeSource(
        resolve(root, "packages/metric-runtime/src/index.ts"),
        'import "@datapulse/domain";\nimport "@datapulse/api-contracts/http";\nexport {};',
      );
    },
    [
      "ARCH_DEPENDENCY_DIRECTION",
      "ARCH_PURE_RUNTIME_MANIFEST_DEPENDENCY_BOUNDARY",
    ],
  );

  expectFailureCodes(
    "两节点循环",
    (root) => {
      updateWorkspaceDependencies(root, "packages/domain", {
        "@datapulse/api-contracts": "workspace:*",
      });
      writeSource(
        resolve(root, "packages/domain/src/index.ts"),
        'import "@datapulse/api-contracts/http";\nexport {};',
      );
    },
    ["ARCH_DEPENDENCY_CYCLE", "ARCH_DEPENDENCY_DIRECTION"],
  );

  expectFailureCodes(
    "三节点循环",
    (root) => {
      writeWorkspace(root, {
        path: "packages/story-schema",
        name: "@datapulse/story-schema",
        exports: { ".": "./src/index.ts" },
      });
      updateWorkspaceDependencies(root, "packages/domain", {
        "@datapulse/story-schema": "workspace:*",
      });
      updateWorkspaceDependencies(root, "packages/story-schema", {
        "@datapulse/api-contracts": "workspace:*",
      });
      writeSource(
        resolve(root, "packages/domain/src/index.ts"),
        'import "@datapulse/story-schema";\nexport {};',
      );
      writeSource(
        resolve(root, "packages/story-schema/src/index.ts"),
        'import "@datapulse/api-contracts/http";\nexport {};',
      );
    },
    ["ARCH_DEPENDENCY_CYCLE"],
  );

  expectFailureCodes(
    "package 反向依赖 app",
    (root) => {
      updateWorkspaceDependencies(root, "packages/domain", {
        "@datapulse/viewer": "workspace:*",
      });
      writeSource(
        resolve(root, "packages/domain/src/index.ts"),
        'import "@datapulse/viewer";\nexport {};',
      );
    },
    ["ARCH_DEPENDENCY_DIRECTION"],
  );

  expectFailureCodes(
    "Viewer 越界",
    (root) => {
      addAnalysisEngine(root);
      updateWorkspaceDependencies(root, "apps/viewer", {
        "@datapulse/domain": "workspace:*",
        "@datapulse/analysis-engine": "workspace:*",
      });
      writeSource(
        resolve(root, "apps/viewer/src/main.ts"),
        'import "@datapulse/domain";\nimport "@datapulse/analysis-engine";\nexport {};',
      );
    },
    ["ARCH_VIEWER_BOUNDARY"],
  );

  for (const restrictedSubpath of [
    "development-migration-support",
    "formal-migration-support",
  ]) {
    expectFailureCodes(
      `Viewer 绕过 Reader 导入 Story Schema 受限子路径 ${restrictedSubpath}`,
      (root) => {
        writeWorkspace(root, {
          path: "packages/story-schema",
          name: "@datapulse/story-schema",
          exports: {
            ".": "./src/index.ts",
            "./development-migration-support":
              "./src/development-migration-support.ts",
            "./formal-migration-support": "./src/formal-migration-support.ts",
          },
          sources: {
            "index.ts": "export {};",
            "development-migration-support.ts": "export {};",
            "formal-migration-support.ts": "export {};",
          },
        });
        updateWorkspaceDependencies(root, "apps/viewer", {
          "@datapulse/story-schema": "workspace:*",
        });
        writeSource(
          resolve(root, "apps/viewer/src/main.ts"),
          `import "@datapulse/story-schema/${restrictedSubpath}";\nexport {};`,
        );
      },
      ["ARCH_CONSUMER_SUBPATH_BOUNDARY"],
    );
  }

  expectFailureCodes(
    "Connector 越界依赖",
    (root) => {
      updateWorkspaceDependencies(root, "apps/custom-connector", {
        "@datapulse/api-contracts": "workspace:*",
        "@datapulse/domain": "workspace:*",
      });
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "@datapulse/api-contracts/connector-message";\nimport "@datapulse/domain";\nexport {};',
      );
    },
    ["ARCH_CONNECTOR_BOUNDARY"],
  );

  expectFailureCodes(
    "Connector 未批准子路径",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "@datapulse/api-contracts/http";\nexport {};',
      );
    },
    ["ARCH_CONSUMER_SUBPATH_BOUNDARY"],
  );

  expectFailureCodes(
    "Connector 外部 package 旁路",
    (root) => {
      mutateWorkspaceManifest(root, "apps/custom-connector", (manifest) => {
        manifest.dependencies.axios = "1.0.0";
      });
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "axios";\nexport {};',
      );
    },
    [
      "ARCH_BROWSER_CONSUMER_MANIFEST_DEPENDENCY_BOUNDARY",
      "ARCH_BROWSER_CONSUMER_EXTERNAL_IMPORT_BOUNDARY",
    ],
  );

  expectFailureCodes(
    "Connector Node 内建模块旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "node:fs";\nexport {};',
      );
    },
    ["ARCH_BROWSER_CONSUMER_BUILTIN_BOUNDARY"],
  );

  expectFailureCodes(
    "Viewer 导入能力 package 旁路",
    (root) => {
      mutateWorkspaceManifest(root, "apps/viewer", (manifest) => {
        manifest.dependencies.exceljs = "1.0.0";
      });
      writeSource(resolve(root, "apps/viewer/src/main.ts"), 'import "exceljs";\nexport {};');
    },
    [
      "ARCH_BROWSER_CONSUMER_MANIFEST_DEPENDENCY_BOUNDARY",
      "ARCH_BROWSER_CONSUMER_EXTERNAL_IMPORT_BOUNDARY",
    ],
  );

  expectFailureCodes(
    "JSDoc import type 越界",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/jsdoc-types.js"),
        "/** @type {import('@datapulse/api-contracts/http').HttpRequest} */\nconst request = {};\nexport { request };",
      );
    },
    ["ARCH_CONSUMER_SUBPATH_BOUNDARY"],
  );

  expectFailureCodes(
    "triple-slash path 跨 workspace",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        '/// <reference path="../../../packages/domain/src/index.ts" />\nexport {};',
      );
    },
    ["ARCH_RELATIVE_IMPORT_ESCAPE"],
  );

  expectFailureCodes(
    "triple-slash types 未批准依赖",
    (root) => {
      writeSource(
        resolve(root, "apps/viewer/src/main.ts"),
        '/// <reference types="exceljs" />\nexport {};',
      );
    },
    ["ARCH_UNDECLARED_BARE_IMPORT", "ARCH_BROWSER_CONSUMER_EXTERNAL_IMPORT_BOUNDARY"],
  );

  expectFailureCodes(
    "package imports 别名旁路",
    (root) => {
      const manifestPath = resolve(root, "apps/custom-connector/package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.imports = { "#http": "@datapulse/api-contracts/http" };
      writeJson(manifestPath, manifest);
      writeSource(resolve(root, "apps/custom-connector/src/main.ts"), 'import "#http";\nexport {};');
    },
    ["ARCH_PACKAGE_IMPORTS_ALIAS_FORBIDDEN", "ARCH_UNDECLARED_BARE_IMPORT"],
  );

  expectFailureCodes(
    "browser 映射旁路",
    (root) => {
      const manifestPath = resolve(root, "apps/custom-connector/package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.browser = {
        "@datapulse/api-contracts/connector-message": "@datapulse/api-contracts/http",
      };
      writeJson(manifestPath, manifest);
    },
    ["ARCH_BROWSER_ALIAS_FORBIDDEN"],
  );

  expectFailureCodes(
    "pnpm workspace 范围漂移",
    (root) => {
      writeSource(
        resolve(root, "pnpm-workspace.yaml"),
        canonicalPnpmWorkspaceConfiguration.replace(
          '  - "services/*"',
          '  - "services/*"\n  - "tools/*"',
        ),
      );
    },
    ["ARCH_PNPM_WORKSPACE_CONFIG_INVALID"],
  );

  expectFailureCodes(
    "pnpm workspace 图改写旁路",
    (root) => {
      writeSource(
        resolve(root, "pnpm-workspace.yaml"),
        `${canonicalPnpmWorkspaceConfiguration}overrides:\n  "@datapulse/domain": "link:packages/api-contracts"\n`,
      );
    },
    ["ARCH_PNPM_WORKSPACE_CONFIG_INVALID"],
  );

  expectFailureCodes(
    "root pnpm overrides 所有者改写旁路",
    (root) => {
      mutateRootManifest(root, (manifest) => {
        manifest.pnpm = {
          overrides: {
            "@datapulse/domain": "link:packages/api-contracts",
          },
        };
      });
    },
    ["ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN"],
  );

  expectFailureCodes(
    "root resolutions 所有者改写旁路",
    (root) => {
      mutateRootManifest(root, (manifest) => {
        manifest.resolutions = {
          "@datapulse/domain": "link:packages/api-contracts",
        };
      });
    },
    ["ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN"],
  );

  expectFailureCodes(
    "root workspaces 范围改写旁路",
    (root) => {
      mutateRootManifest(root, (manifest) => {
        manifest.workspaces = ["apps/*", "tools/*"];
      });
    },
    ["ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN"],
  );

  expectFailureCodes(
    ".pnpmfile readPackage 改写旁路",
    (root) => {
      writeSource(
        resolve(root, ".pnpmfile.cjs"),
        "module.exports = { hooks: { readPackage(pkg) { pkg.dependencies = {}; return pkg; } } };",
      );
    },
    ["ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN"],
  );

  for (const [name, dependencyName, version] of [
    ["workspace 包别名旁路", "hidden-storage", "workspace:@datapulse/local-storage@*"],
    ["link 本地依赖旁路", "hidden-contracts", "link:../../packages/api-contracts"],
    ["file 本地依赖旁路", "hidden-contracts", "file:../../packages/api-contracts"],
    ["portal 本地依赖旁路", "hidden-contracts", "portal:../../packages/api-contracts"],
    ["npm 包别名旁路", "hidden-contracts", "npm:@datapulse/api-contracts@*"],
  ]) {
    expectFailureCodes(
      name,
      (root) => {
        mutateWorkspaceManifest(root, "apps/custom-connector", (manifest) => {
          manifest.dependencies[dependencyName] = version;
        });
        writeSource(
          resolve(root, "apps/custom-connector/src/main.ts"),
          `import "${dependencyName}";\nexport {};`,
        );
      },
      ["ARCH_DEPENDENCY_ALIAS_FORBIDDEN"],
    );
  }

  expectFailureCodes(
    "scope 根 junction/symlink 旁路",
    (root) => {
      const scopePath = resolve(root, "apps");
      const ownerPath = resolve(root, "real-apps");
      renameSync(scopePath, ownerPath);
      symlinkSync(ownerPath, scopePath, process.platform === "win32" ? "junction" : "dir");
    },
    ["ARCH_SYMLINK_FORBIDDEN"],
  );

  expectFailureCodes(
    "workspace 根 junction/symlink 所有者旁路",
    (root) => {
      const workspacePath = resolve(root, "apps/viewer");
      const ownerPath = resolve(root, "escaped-viewer");
      renameSync(workspacePath, ownerPath);
      symlinkSync(ownerPath, workspacePath, process.platform === "win32" ? "junction" : "dir");
    },
    ["ARCH_SYMLINK_FORBIDDEN", "ARCH_WORKSPACE_REALPATH_ESCAPE"],
  );

  expectFailureCodes(
    "junction/symlink 真实路径旁路",
    (root) => {
      const linkPath = resolve(root, "apps/custom-connector/src/linked-contracts");
      const targetPath = resolve(root, "packages/api-contracts/src");
      symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "./linked-contracts/http.js";\nexport {};',
      );
    },
    ["ARCH_SYMLINK_FORBIDDEN", "ARCH_RELATIVE_IMPORT_REALPATH_ESCAPE"],
  );

  expectFailureCodes(
    "Windows 绝对模块标识",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "C:/repo/packages/api-contracts/src/http.ts";\nexport {};',
      );
    },
    ["ARCH_ABSOLUTE_MODULE_SPECIFIER"],
  );

  expectFailureCodes(
    "file URL 模块标识",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'await import("file:///repo/packages/api-contracts/src/http.ts");\nexport {};',
      );
    },
    ["ARCH_URL_MODULE_SPECIFIER"],
  );

  for (const [name, specifier] of [
    [
      "ESM 百分号编码父级旁路",
      "./%2e%2e/%2e%2e/%2e%2e/packages/domain/src/index.js",
    ],
    [
      "ESM 混合大小写百分号编码旁路",
      "./%2E%2e/%2e%2E/%2E%2e/packages/domain/src/index.js",
    ],
    [
      "跨平台反斜杠模块路径旁路",
      "..\\..\\..\\packages\\domain\\src\\index.js",
    ],
  ]) {
    expectFailureCodes(
      name,
      (root) => {
        writeSource(
          resolve(root, "apps/custom-connector/src/main.ts"),
          `import "${specifier.replaceAll("\\", "\\\\")}";\nexport {};`,
        );
      },
      ["ARCH_RELATIVE_IMPORT_CANONICALIZATION_FORBIDDEN"],
    );
  }

  for (const [name, source] of [
    ["require.call 间接加载", 'require.call(null, "@datapulse/api-contracts/http");'],
    ["require.apply 间接加载", 'require.apply(null, ["@datapulse/api-contracts/http"]);'],
    [
      "require.bind 间接加载",
      'const load = require.bind(null);\nload("@datapulse/api-contracts/http");',
    ],
    [
      "require 变量别名",
      'const load = require;\nload("@datapulse/api-contracts/http");',
    ],
    ["require 元素访问", 'require["resolve"]("@datapulse/api-contracts/http");'],
    ["module.require 元素访问", 'module["require"]("@datapulse/api-contracts/http");'],
  ]) {
    expectFailureCodes(
      name,
      (root) => {
        writeSource(
          resolve(root, "apps/custom-connector/src/main.ts"),
          `${source}\nexport {};`,
        );
      },
      ["ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN"],
    );
  }

  expectFailureCodes(
    "process 解构模块解析器旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        "const { getBuiltinModule } = process;\nconst { createRequire } = getBuiltinModule(\"node:module\");\nconst load = createRequire(import.meta.url);\nload(\"../../../packages/domain/src/index.js\");\nexport {};",
      );
    },
    ["ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN"],
  );

  expectFailureCodes(
    "动态代码生成模块解析器旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'const load = Function("return require")();\nload("@datapulse/api-contracts/http");\nexport {};',
      );
    },
    ["ARCH_RUNTIME_CODE_GENERATION_FORBIDDEN"],
  );

  expectFailureCodes(
    "Connector window.eval 动态代码旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'window.eval(\'import("@datapulse/api-contracts/http")\');\nexport {};',
      );
    },
    ["ARCH_RUNTIME_CODE_GENERATION_FORBIDDEN"],
  );

  expectFailureCodes(
    "Viewer self.Function 动态代码旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/viewer/src/main.ts"),
        'self.Function(\'return import("@datapulse/analysis-engine")\')();\nexport {};',
      );
    },
    ["ARCH_RUNTIME_CODE_GENERATION_FORBIDDEN"],
  );

  expectFailureCodes(
    "Node global.require 模块解析器旁路",
    (root) => {
      writeSource(
        resolve(root, "services/share-api/src/main.ts"),
        'global.require("@datapulse/local-storage");\nexport {};',
      );
    },
    ["ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN"],
  );

  for (const [name, viteConfigSource] of [
    [
      "Vite 对象 alias 旁路",
      'import { defineConfig } from "vite";\nexport default defineConfig({ resolve: { alias: { react: "../../packages/api-contracts/src/http.ts" } } });',
    ],
    [
      "Vite 数组 alias 旁路",
      'export default { resolve: { alias: [{ find: "react", replacement: "../../packages/api-contracts/src/http.ts" }] } };',
    ],
    [
      "Vite 计算 alias 旁路",
      'export default { resolve: { ["alias"]: { react: "../../packages/api-contracts/src/http.ts" } } };',
    ],
    [
      "Vite alias 赋值旁路",
      'const config = { resolve: {} };\nconfig.resolve.alias = { react: "../../packages/api-contracts/src/http.ts" };\nexport default config;',
    ],
    [
      "Vite mergeConfig 旁路",
      'import { mergeConfig } from "vite";\nexport default mergeConfig({}, { resolve: { alias: {} } });',
    ],
  ]) {
    expectFailureCodes(
      name,
      (root) => {
        mutateWorkspaceManifest(root, "apps/custom-connector", (manifest) => {
          manifest.dependencies.react = "19.0.0";
          manifest.devDependencies = { vite: "7.0.0" };
        });
        writeSource(resolve(root, "apps/custom-connector/src/main.ts"), 'import "react";\nexport {};');
        writeSource(resolve(root, "apps/custom-connector/vite.config.ts"), viteConfigSource);
      },
      ["ARCH_VITE_ALIAS_FORBIDDEN"],
    );
  }

  expectFailureCodes(
    "Vite JSON.parse 动态 alias 旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/vite.config.ts"),
        'export default JSON.parse(\'{"resolve":{"alias":{"@datapulse/api-contracts/connector-message":"../../packages/domain/src/index.ts"}}}\');',
      );
    },
    ["ARCH_VITE_DYNAMIC_CONFIG_FORBIDDEN"],
  );

  expectFailureCodes(
    "Vite plugin 解析旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/creator/vite.config.ts"),
        "export default { plugins: [] };",
      );
    },
    ["ARCH_VITE_PLUGIN_FORBIDDEN"],
  );

  expectFailureCodes(
    "Vite 自定义配置文件名旁路",
    (root) => {
      const manifestPath = resolve(root, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.scripts = { "build:connector": "vite --config config/build.ts" };
      writeJson(manifestPath, manifest);
    },
    ["ARCH_VITE_CUSTOM_CONFIG_FORBIDDEN"],
  );

  expectFailureCodes(
    "根 Vite 配置改写独立 app 旁路",
    (root) => {
      writeSource(
        resolve(root, "vite.config.ts"),
        'export default JSON.parse(\'{"resolve":{"alias":{"react":"./packages/domain/src/index.ts"}}}\');',
      );
    },
    ["ARCH_ROOT_VITE_CONFIG_FORBIDDEN"],
  );

  expectFailureCodes(
    "Vite 程序化配置旁路",
    (root) => {
      mutateWorkspaceManifest(root, "apps/creator", (manifest) => {
        manifest.devDependencies = { vite: "7.0.0" };
      });
      writeSource(
        resolve(root, "apps/creator/src/vite-programmatic.ts"),
        'import { createServer } from "vite";\nawait createServer({ resolve: { alias: {} } });\nexport {};',
      );
    },
    ["ARCH_VITE_PROGRAMMATIC_CONFIG_FORBIDDEN"],
  );

  expectFailureCodes(
    "Vite 导入配置片段旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/vite.config.ts"),
        'import config from "./vite.shared.js";\nexport default config;',
      );
      writeSource(
        resolve(root, "apps/custom-connector/vite.shared.ts"),
        'export default { resolve: { alias: { react: "../../packages/api-contracts/src/http.ts" } } };',
      );
    },
    ["ARCH_VITE_CONFIG_FRAGMENT_FORBIDDEN"],
  );

  expectFailureCodes(
    "Vite 动态导入配置片段旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/vite.config.ts"),
        'export default (await import("./vite.shared.js")).default;',
      );
      writeSource(
        resolve(root, "apps/custom-connector/vite.shared.ts"),
        'export default { resolve: { alias: { react: "../../packages/domain/src/index.ts" } } };',
      );
    },
    ["ARCH_VITE_CONFIG_FRAGMENT_FORBIDDEN", "ARCH_VITE_DYNAMIC_CONFIG_FORBIDDEN"],
  );

  expectFailureCodes(
    "export target 逃逸",
    (root) => {
      const manifestPath = resolve(root, "packages/api-contracts/package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.exports["./connector-message"] = "../domain/src/index.ts";
      writeJson(manifestPath, manifest);
    },
    ["ARCH_EXPORT_TARGET_ESCAPE"],
  );

  expectFailureCodes(
    "export target junction/symlink 所有者旁路",
    (root) => {
      const linkPath = resolve(root, "packages/domain/dist");
      const targetPath = resolve(root, "apps/creator/src");
      symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
      mutateWorkspaceManifest(root, "packages/domain", (manifest) => {
        manifest.exports["."] = "./dist/main.ts";
      });
    },
    ["ARCH_SYMLINK_FORBIDDEN", "ARCH_EXPORT_TARGET_REALPATH_ESCAPE"],
  );

  expectFailureCodes(
    "TypeScript paths 别名旁路",
    (root) => {
      const tsconfigPath = resolve(root, "apps/custom-connector/tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      tsconfig.compilerOptions.baseUrl = ".";
      tsconfig.compilerOptions.paths = {
        "@hidden-http": ["../../packages/api-contracts/src/http.ts"],
      };
      writeJson(tsconfigPath, tsconfig);
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import "@hidden-http";\nexport {};',
      );
    },
    ["ARCH_TSCONFIG_ALIAS_FORBIDDEN", "ARCH_UNDECLARED_BARE_IMPORT"],
  );

  expectFailureCodes(
    "TypeScript 输入逃逸",
    (root) => {
      const tsconfigPath = resolve(root, "apps/custom-connector/tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      tsconfig.include.push("../../packages/api-contracts/src/http.ts");
      writeJson(tsconfigPath, tsconfig);
    },
    ["ARCH_TSCONFIG_INPUT_ESCAPE"],
  );

  expectFailureCodes(
    "require.resolve 旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'require.resolve("@datapulse/api-contracts/http");\nexport {};',
      );
    },
    ["ARCH_CONSUMER_SUBPATH_BOUNDARY"],
  );

  expectFailureCodes(
    "createRequire 旁路",
    (root) => {
      writeSource(
        resolve(root, "apps/custom-connector/src/main.ts"),
        'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nload("@datapulse/api-contracts/http");\nexport {};',
      );
    },
    ["ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN"],
  );

  expectFailureCodes(
    "服务端越界",
    (root) => {
      addLocalStorage(root);
      updateWorkspaceDependencies(root, "services/share-api", {
        "@datapulse/api-contracts": "workspace:*",
        "@datapulse/local-storage": "workspace:*",
      });
      writeSource(
        resolve(root, "services/share-api/src/main.ts"),
        'import "@datapulse/api-contracts/http";\nimport "@datapulse/local-storage";\nexport {};',
      );
    },
    ["ARCH_SERVICE_BOUNDARY"],
  );

  expectFailureCodes(
    "跨 workspace 相对深导入",
    (root) => {
      writeSource(
        resolve(root, "apps/viewer/src/main.ts"),
        'import "../../../packages/domain/src/index.js";\nexport {};',
      );
    },
    ["ARCH_RELATIVE_IMPORT_ESCAPE"],
  );

  expectFailureCodes(
    "未声明 workspace import",
    (root) => {
      writeSource(
        resolve(root, "apps/creator/src/main.ts"),
        'import "@datapulse/api-contracts/http";\nexport {};',
      );
    },
    ["ARCH_UNDECLARED_WORKSPACE_IMPORT"],
  );

  expectFailureCodes(
    "非精确 workspace 协议",
    (root) => {
      const manifestPath = resolve(root, "apps/viewer/package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.dependencies["@datapulse/domain"] = "workspace:^";
      writeJson(manifestPath, manifest);
    },
    ["ARCH_WORKSPACE_PROTOCOL_REQUIRED"],
  );

  expectFailureCodes(
    "未知内部包",
    (root) => {
      writeSource(
        resolve(root, "apps/creator/src/main.ts"),
        'import "@datapulse/not-a-workspace";\nexport {};',
      );
    },
    ["ARCH_SOURCE_WORKSPACE_TARGET_MISSING"],
  );

  expectFailureCodes(
    "未导出子路径",
    (root) => {
      updateWorkspaceDependencies(root, "apps/creator", {
        "@datapulse/domain": "workspace:*",
        "@datapulse/api-contracts": "workspace:*",
      });
      writeSource(
        resolve(root, "apps/creator/src/main.ts"),
        'import "@datapulse/domain";\nimport "@datapulse/api-contracts/private";\nexport {};',
      );
    },
    ["ARCH_UNEXPORTED_WORKSPACE_IMPORT"],
  );

  expectFailureCodes(
    "TypeScript reference 缺失",
    (root) => {
      const tsconfigPath = resolve(root, "apps/creator/tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      tsconfig.references = [];
      writeJson(tsconfigPath, tsconfig);
    },
    ["ARCH_TSCONFIG_REFERENCE_MISMATCH"],
  );

  expectFailureCodes(
    "TypeScript references 非数组输入",
    (root) => {
      const tsconfigPath = resolve(root, "apps/viewer/tsconfig.json");
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
      tsconfig.references = { path: "../../packages/domain" };
      writeJson(tsconfigPath, tsconfig);
    },
    ["ARCH_TSCONFIG_REFERENCES_INVALID"],
  );

  expectFailureCodes(
    "非字面动态 import",
    (root) => {
      writeSource(
        resolve(root, "apps/creator/src/main.ts"),
        'const target = "@datapulse/domain";\nawait import(target);\nexport {};',
      );
    },
    ["ARCH_NON_LITERAL_MODULE_SPECIFIER"],
  );

  withFixture((root) => {
    writeSource(
      resolve(root, "apps/custom-connector/src/main.ts"),
      'import "@datapulse/api-contracts/origin-policy";\nexport {};',
    );
    const processResult = spawnSync(process.execPath, [checkScriptPath, "--root", root], {
      encoding: "utf8",
      windowsHide: true,
    });
    let childReport = null;
    try {
      childReport = JSON.parse(processResult.stdout);
    } catch {
      childReport = null;
    }
    record("恶意 fixture CLI 返回非零", processResult.status === 1, 1, processResult.status);
    record(
      "恶意 fixture CLI 返回结构化失败",
      childReport?.result === "failed",
      "failed",
      childReport?.result ?? processResult.stdout,
    );
    record(
      "--root fixture 不依赖真实 domain 合同",
      childReport !== null && !("domainContract" in childReport),
      "domainContract absent",
      childReport && "domainContract" in childReport ? "domainContract present" : "absent",
    );
  });

  const invalidCliResult = spawnSync(
    process.execPath,
    [checkScriptPath, "--root", "--self-test"],
    { encoding: "utf8", windowsHide: true },
  );
  let invalidCliReport = null;
  try {
    invalidCliReport = JSON.parse(invalidCliResult.stdout);
  } catch {
    invalidCliReport = null;
  }
  record("CLI 缺失 --root 路径返回参数错误", invalidCliResult.status === 2, 2, invalidCliResult.status);
  record(
    "CLI 参数错误返回稳定诊断",
    invalidCliReport?.failures?.[0]?.code === "ARCH_CLI_ARGUMENT",
    "ARCH_CLI_ARGUMENT",
    invalidCliReport?.failures?.[0]?.code ?? invalidCliResult.stdout,
  );

  const failures = assertions.filter(({ passed }) => !passed);
  return {
    result: failures.length === 0 ? "passed" : "failed",
    assertions: {
      executed: assertions.length,
      passed: assertions.length - failures.length,
      failed: failures.length,
      skipped: 0,
    },
    failures: failures.map(({ name, expected, actual }) => ({
      code: "ARCH_SELF_TEST_FAILURE",
      subject: name,
      message: "依赖边界自测期望未满足",
      expected,
      actual,
    })),
  };
}

function parseArguments(argumentsList) {
  const options = {
    repositoryRoot: defaultRepositoryRoot,
    selfTest: false,
    runDomainContract: true,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--self-test") {
      options.selfTest = true;
    } else if (argument === "--root") {
      const repositoryRoot = argumentsList[index + 1];
      if (!repositoryRoot || repositoryRoot.startsWith("--")) {
        throw new Error("--root requires a path");
      }
      options.repositoryRoot = resolve(repositoryRoot);
      options.runDomainContract = false;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: "1.0.0",
        kind: "datapulse-root-check-summary",
        check: "dependency-boundaries",
        gateId: process.env.DATAPULSE_GATE_ID ?? null,
        runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
        result: "failed",
        assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
        failures: [
          {
            code: "ARCH_CLI_ARGUMENT",
            subject: "command-line",
            message: error instanceof Error ? error.message : String(error),
            expected: "--self-test and/or --root <path>",
            actual: process.argv.slice(2),
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
}

if (options) {
  const repositoryReport = analyzeDependencyBoundaries({
    repositoryRoot: options.repositoryRoot,
  });
  const selfTestReport = options.selfTest ? runSelfTests() : null;
  const domainContractReport = options.runDomainContract
    ? await runRepositoryDomainContract()
    : null;
  const selfTestFailures = selfTestReport?.failures ?? [];
  const domainContractFailures = domainContractReport?.failures ?? [];
  const failures = [
    ...repositoryReport.failures,
    ...selfTestFailures,
    ...domainContractFailures,
  ];
  const report = {
    ...repositoryReport,
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: failures.length === 0 ? "passed" : "failed",
    assertions: {
      executed:
        repositoryReport.assertions.executed +
        (selfTestReport?.assertions.executed ?? 0) +
        (domainContractReport?.assertions.executed ?? 0),
      passed:
        repositoryReport.assertions.passed +
        (selfTestReport?.assertions.passed ?? 0) +
        (domainContractReport?.assertions.passed ?? 0),
      failed:
        repositoryReport.assertions.failed +
        (selfTestReport?.assertions.failed ?? 0) +
        (domainContractReport?.assertions.failed ?? 0),
      skipped:
        repositoryReport.assertions.skipped +
        (selfTestReport?.assertions.skipped ?? 0) +
        (domainContractReport?.assertions.skipped ?? 0),
    },
    failures,
    ...(selfTestReport ? { selfTest: selfTestReport } : {}),
    ...(domainContractReport ? { domainContract: domainContractReport } : {}),
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "passed") {
    process.exitCode = 1;
  }
}
