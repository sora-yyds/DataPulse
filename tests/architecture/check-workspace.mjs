import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = fileURLToPath(new URL("../../", import.meta.url));
const assertions = [];

const requiredWorkspaces = [
  {
    kind: "package",
    path: "packages/domain",
    name: "@datapulse/domain",
    dependencies: {},
    references: [],
    entries: { ".": "index" },
  },
  {
    kind: "package",
    path: "packages/story-schema",
    name: "@datapulse/story-schema",
    dependencies: { ajv: "8.17.1" },
    devDependencies: { "json-schema-to-typescript": "15.0.4" },
    references: [],
    entries: {
      ".": "index",
      "./development-migration-support": "development-migration-support",
      "./formal-migration-support": "formal-migration-support",
    },
    inputs: ["src/**/*.ts", "src/**/*.json"],
    buildScript: "node ./scripts/generate-artifacts.mjs --check && tsc --build tsconfig.json",
  },
  {
    kind: "package",
    path: "packages/story-migrations",
    name: "@datapulse/story-migrations",
    dependencies: {
      "@datapulse/domain": "workspace:*",
      "@datapulse/story-schema": "workspace:*",
    },
    references: ["../domain", "../story-schema"],
    entries: { ".": "index" },
  },
  {
    kind: "package",
    path: "packages/metric-runtime",
    name: "@datapulse/metric-runtime",
    dependencies: { "@datapulse/domain": "workspace:*" },
    devDependencies: {
      ajv: "8.17.1",
      "json-schema-to-typescript": "15.0.4",
    },
    references: ["../domain"],
    entries: { ".": "index" },
    inputs: ["src/**/*.ts", "src/**/*.json"],
    buildScript: "node ./scripts/generate-artifacts.mjs --check && tsc --build tsconfig.json",
  },
  {
    kind: "package",
    path: "packages/crypto",
    name: "@datapulse/crypto",
    dependencies: {
      "@datapulse/domain": "workspace:*",
      "hash-wasm": "4.12.0",
    },
    devDependencies: { "@types/node": "24.13.3" },
    references: ["../domain"],
    entries: { ".": "index" },
  },
  {
    kind: "package",
    path: "packages/api-contracts",
    name: "@datapulse/api-contracts",
    dependencies: { "@datapulse/domain": "workspace:*" },
    references: ["../domain"],
    entries: {
      "./connector-message": "connector-message",
      "./http": "http",
      "./origin-policy": "origin-policy",
    },
  },
  {
    kind: "package",
    path: "packages/themes",
    name: "@datapulse/themes",
    dependencies: {},
    references: [],
    entries: { ".": "index" },
  },
  {
    kind: "package",
    path: "packages/renderer",
    name: "@datapulse/renderer",
    dependencies: {
      "@datapulse/story-schema": "workspace:*",
      "@datapulse/themes": "workspace:*",
    },
    peerDependencies: { react: "19.2.8" },
    devDependencies: {
      "@types/react": "19.2.18",
    },
    references: ["../story-schema", "../themes"],
    entries: { ".": "index" },
    inputs: ["src/**/*.ts", "src/**/*.tsx"],
  },
  {
    kind: "app",
    path: "apps/creator",
    name: "@datapulse/creator",
    dependencies: {
      "@datapulse/domain": "workspace:*",
      "@datapulse/metric-runtime": "workspace:*",
      "@datapulse/renderer": "workspace:*",
      "@datapulse/story-migrations": "workspace:*",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      "@types/react": "19.2.18",
      "@types/react-dom": "19.2.4",
      vite: "8.2.0",
    },
    references: [
      "../../packages/domain",
      "../../packages/metric-runtime",
      "../../packages/renderer",
      "../../packages/story-migrations",
    ],
    entries: { main: "main" },
    inputs: ["src/**/*.ts", "src/**/*.tsx"],
    buildScript: "tsc --build tsconfig.json && vite build",
    siteBundle: true,
  },
  {
    kind: "app",
    path: "apps/viewer",
    name: "@datapulse/viewer",
    dependencies: {
      "@datapulse/metric-runtime": "workspace:*",
      "@datapulse/renderer": "workspace:*",
      "@datapulse/story-migrations": "workspace:*",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      "@types/react": "19.2.18",
      "@types/react-dom": "19.2.4",
      vite: "8.2.0",
    },
    references: [
      "../../packages/metric-runtime",
      "../../packages/renderer",
      "../../packages/story-migrations",
    ],
    entries: { main: "main" },
    inputs: ["src/**/*.ts", "src/**/*.tsx"],
    buildScript: "tsc --build tsconfig.json && vite build",
    siteBundle: true,
  },
  {
    kind: "app",
    path: "apps/custom-connector",
    name: "@datapulse/custom-connector",
    dependencies: { "@datapulse/api-contracts": "workspace:*" },
    references: ["../../packages/api-contracts"],
    entries: { main: "main" },
  },
  {
    kind: "app",
    path: "apps/device-probe",
    name: "@datapulse/device-probe",
    dependencies: { "@datapulse/crypto": "workspace:*" },
    devDependencies: {
      "@types/node": "24.13.3",
      vite: "8.2.0",
    },
    references: ["../../packages/crypto"],
    entries: { main: "main" },
    inputs: ["src/**/*.ts"],
    buildScript: "tsc --build tsconfig.json && vite build",
  },
  {
    kind: "service",
    path: "services/share-api",
    name: "@datapulse/share-api",
    dependencies: { "@datapulse/api-contracts": "workspace:*" },
    references: ["../../packages/api-contracts"],
    entries: { main: "main" },
  },
];

const rootReferences = [
  "./packages/domain",
  "./packages/story-schema",
  "./packages/story-migrations",
  "./packages/metric-runtime",
  "./packages/api-contracts",
  "./packages/themes",
  "./packages/renderer",
  "./apps/creator",
  "./apps/viewer",
  "./apps/custom-connector",
  "./apps/device-probe",
  "./services/share-api",
  "./packages/crypto",
];

const deferredWorkspacePaths = [
  "packages/narrative",
  "packages/package-codec",
  "packages/provider-adapters",
  "packages/static-export",
  "services/model-proxy",
  "services/telemetry-ingest",
];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function readText(path) {
  return readFileSync(resolve(rootDirectory, path), "utf8").replaceAll("\r\n", "\n");
}

function readJson(path) {
  return JSON.parse(readText(path));
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

function pathExists(path) {
  return existsSync(resolve(rootDirectory, path));
}

function discoverWorkspacePaths() {
  const discovered = [];

  for (const scope of ["apps", "packages", "services"]) {
    const scopePath = resolve(rootDirectory, scope);
    if (!existsSync(scopePath)) {
      continue;
    }

    for (const entry of readdirSync(scopePath, { withFileTypes: true })) {
      const workspacePath = `${scope}/${entry.name}`;
      if (entry.isDirectory() && pathExists(`${workspacePath}/package.json`)) {
        discovered.push(workspacePath);
      }
    }
  }

  return discovered.sort();
}

function expectedExportTarget(entry, kind) {
  return `./dist/${entry}.${kind}`;
}

function validateRequiredWorkspace(workspace) {
  const packageJson = readJson(`${workspace.path}/package.json`);
  const tsconfig = readJson(`${workspace.path}/tsconfig.json`);
  const label = workspace.name;

  equal(`${label} 包名`, packageJson.name, workspace.name);
  equal(`${label} 版本`, packageJson.version, "0.0.0");
  equal(`${label} 保持私有`, packageJson.private, true);
  equal(`${label} ESM`, packageJson.type, "module");
  equal(`${label} 许可证`, packageJson.license, "AGPL-3.0-only");
  equal(
    `${label} 独立构建入口`,
    packageJson.scripts?.build,
    workspace.buildScript ?? "tsc --build tsconfig.json",
  );
  jsonEqual(`${label} workspace 依赖`, packageJson.dependencies ?? {}, workspace.dependencies);
  jsonEqual(`${label} workspace peer 依赖`, packageJson.peerDependencies ?? {}, workspace.peerDependencies ?? {});
  jsonEqual(`${label} workspace 开发依赖`, packageJson.devDependencies ?? {}, workspace.devDependencies ?? {});

  equal(`${label} 继承严格基线`, tsconfig.extends, "../../tsconfig.base.json");
  equal(`${label} composite`, tsconfig.compilerOptions?.composite, true);
  equal(`${label} declaration`, tsconfig.compilerOptions?.declaration, true);
  equal(`${label} declarationMap`, tsconfig.compilerOptions?.declarationMap, true);
  equal(`${label} sourceMap`, tsconfig.compilerOptions?.sourceMap, true);
  equal(`${label} rootDir`, tsconfig.compilerOptions?.rootDir, "src");
  equal(`${label} outDir`, tsconfig.compilerOptions?.outDir, "dist");
  equal(`${label} 独立 build info`, tsconfig.compilerOptions?.tsBuildInfoFile, "dist/.tsbuildinfo");
  jsonEqual(`${label} 输入边界`, tsconfig.include, workspace.inputs ?? ["src/**/*.ts"]);
  jsonEqual(
    `${label} TypeScript 引用`,
    (tsconfig.references ?? []).map(({ path }) => path),
    workspace.references,
  );

  if (workspace.kind === "package") {
    jsonEqual(`${label} 发布文件边界`, packageJson.files, ["dist"]);
    const exportKeys = Object.keys(packageJson.exports ?? {});
    jsonEqual(`${label} 显式 exports`, exportKeys, Object.keys(workspace.entries));
    record(
      `${label} 禁止通配符 exports`,
      exportKeys.every((key) => !key.includes("*")),
      true,
      exportKeys,
    );

    for (const [exportKey, entry] of Object.entries(workspace.entries)) {
      const exportDefinition = packageJson.exports?.[exportKey];
      jsonEqual(`${label} ${exportKey} export 条件`, exportDefinition, {
        types: expectedExportTarget(entry, "d.ts"),
        import: expectedExportTarget(entry, "js"),
        default: expectedExportTarget(entry, "js"),
      });
    }
  } else {
    equal(`${label} 不暴露可依赖 exports`, Object.hasOwn(packageJson, "exports"), false);
  }

  for (const entry of Object.values(workspace.entries)) {
    equal(`${label} ${entry} 源入口存在`, pathExists(`${workspace.path}/src/${entry}.ts`), true);
    equal(`${label} ${entry} JavaScript 构建产物`, pathExists(`${workspace.path}/dist/${entry}.js`), true);
    equal(`${label} ${entry} 类型构建产物`, pathExists(`${workspace.path}/dist/${entry}.d.ts`), true);
    equal(`${label} ${entry} source map`, pathExists(`${workspace.path}/dist/${entry}.js.map`), true);
    equal(`${label} ${entry} declaration map`, pathExists(`${workspace.path}/dist/${entry}.d.ts.map`), true);
  }

  equal(`${label} build info 产物`, pathExists(`${workspace.path}/dist/.tsbuildinfo`), true);
  if (workspace.siteBundle) {
    equal(`${label} 独立 Vite 页面入口`, pathExists(`${workspace.path}/index.html`), true);
    equal(`${label} 静态 Vite 配置`, pathExists(`${workspace.path}/vite.config.ts`), true);
    equal(`${label} 产品页面构建产物`, pathExists(`${workspace.path}/dist/site/index.html`), true);
    const siteAssetsPath = `${workspace.path}/dist/site/assets`;
    const siteAssets = pathExists(siteAssetsPath)
      ? readdirSync(resolve(rootDirectory, siteAssetsPath)).sort()
      : [];
    const jsonAssets = siteAssets.filter((asset) => asset.endsWith(".json"));
    const javaScriptAssets = siteAssets.filter((asset) => asset.endsWith(".js"));
    equal(`${label} 两个 JSON fixture 独立发出`, jsonAssets.length, 2);
    jsonEqual(
      `${label} JSON fixture 字节内容保持`,
      jsonAssets.map((asset) => readText(`${siteAssetsPath}/${asset}`)).sort(),
      [
        readText(`${workspace.path}/src/fixtures/metric-runtime.json`),
        readText(`${workspace.path}/src/fixtures/story-artifact.json`),
      ].sort(),
    );
    equal(
      `${label} 页面 bundle 不含 data JSON URL`,
      javaScriptAssets.some((asset) =>
        readText(`${siteAssetsPath}/${asset}`).includes("data:application/json"),
      ),
      false,
    );
  }
}

async function validateResolution(consumerPath, specifier, expectedWorkspacePath) {
  const resolver = createRequire(pathToFileURL(resolve(rootDirectory, consumerPath, "package.json")));
  let resolvedPath;

  try {
    resolvedPath = resolver.resolve(specifier);
  } catch (error) {
    record(
      `${consumerPath} 可解析 ${specifier}`,
      false,
      `${expectedWorkspacePath}/dist 内文件`,
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  const relativePath = normalizePath(relative(rootDirectory, resolvedPath));
  record(
    `${consumerPath} 可解析 ${specifier}`,
    relativePath.startsWith(`${expectedWorkspacePath}/dist/`),
    `${expectedWorkspacePath}/dist 内文件`,
    relativePath,
  );

  try {
    await import(pathToFileURL(resolvedPath).href);
    record(`${consumerPath} 可加载 ${specifier}`, true, true, true);
  } catch (error) {
    record(
      `${consumerPath} 可加载 ${specifier}`,
      false,
      true,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function validateDeniedResolution(consumerPath, specifier) {
  const resolver = createRequire(pathToFileURL(resolve(rootDirectory, consumerPath, "package.json")));

  try {
    const resolvedPath = resolver.resolve(specifier);
    record(`${consumerPath} 拒绝未公开 ${specifier}`, false, "ERR_PACKAGE_PATH_NOT_EXPORTED", resolvedPath);
  } catch (error) {
    record(
      `${consumerPath} 拒绝未公开 ${specifier}`,
      error && typeof error === "object" && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
      error && typeof error === "object" ? error.code : String(error),
    );
  }
}

const rootPackageJson = readJson("package.json");
const rootTsconfig = readJson("tsconfig.json");
const turboConfig = readJson("turbo.json");
const discoveredWorkspacePaths = discoverWorkspacePaths();
const requiredWorkspacePaths = requiredWorkspaces.map(({ path }) => path).sort();

equal("根 build 入口", rootPackageJson.scripts?.build, "turbo run build");
equal(
  "根 workspace 契约入口",
  rootPackageJson.scripts?.["check:workspace"],
  "turbo run build && node ./tests/architecture/check-workspace.mjs",
);
jsonEqual("Turbo build 任务", turboConfig.tasks?.build, {
  dependsOn: ["^build"],
  outputs: ["dist/**"],
});
jsonEqual(
  "Story Schema build 不缓存正式历史 merge-base 检查",
  turboConfig.tasks?.["@datapulse/story-schema#build"],
  {
    cache: false,
    dependsOn: ["^build"],
    env: ["DATAPULSE_MERGE_BASE"],
    outputs: ["dist/**"],
  },
);
jsonEqual(
  "Metric Runtime build 不缓存正式历史 merge-base 检查",
  turboConfig.tasks?.["@datapulse/metric-runtime#build"],
  {
    cache: false,
    dependsOn: ["^build"],
    env: ["DATAPULSE_MERGE_BASE"],
    outputs: ["dist/**"],
  },
);
jsonEqual(
  "根 TypeScript 引用",
  (rootTsconfig.references ?? []).map(({ path }) => path),
  rootReferences,
);
jsonEqual("M0-006 workspace 精确集合", discoveredWorkspacePaths, requiredWorkspacePaths);

for (const path of deferredWorkspacePaths) {
  equal(`延期 workspace 未提前创建 ${path}`, pathExists(path), false);
}

equal("Infra 作用域已登记", pathExists("infra/README.md"), true);
equal("Tests 作用域已登记", pathExists("tests/README.md"), true);

for (const workspace of requiredWorkspaces) {
  validateRequiredWorkspace(workspace);
}

await validateResolution("packages/api-contracts", "@datapulse/domain", "packages/domain");
await validateResolution(
  "packages/story-migrations",
  "@datapulse/domain",
  "packages/domain",
);
await validateResolution(
  "packages/story-migrations",
  "@datapulse/story-schema",
  "packages/story-schema",
);
await validateResolution(
  "packages/story-migrations",
  "@datapulse/story-schema/development-migration-support",
  "packages/story-schema",
);
await validateResolution(
  "packages/story-migrations",
  "@datapulse/story-schema/formal-migration-support",
  "packages/story-schema",
);
await validateResolution(
  "packages/metric-runtime",
  "@datapulse/domain",
  "packages/domain",
);
await validateResolution(
  "packages/renderer",
  "@datapulse/story-schema",
  "packages/story-schema",
);
await validateResolution(
  "packages/renderer",
  "@datapulse/themes",
  "packages/themes",
);
await validateResolution("apps/creator", "@datapulse/domain", "packages/domain");
await validateResolution(
  "apps/creator",
  "@datapulse/metric-runtime",
  "packages/metric-runtime",
);
await validateResolution(
  "apps/creator",
  "@datapulse/story-migrations",
  "packages/story-migrations",
);
await validateResolution(
  "apps/creator",
  "@datapulse/renderer",
  "packages/renderer",
);
await validateResolution(
  "apps/viewer",
  "@datapulse/metric-runtime",
  "packages/metric-runtime",
);
await validateResolution(
  "apps/viewer",
  "@datapulse/story-migrations",
  "packages/story-migrations",
);
await validateResolution(
  "apps/viewer",
  "@datapulse/renderer",
  "packages/renderer",
);
await validateResolution(
  "apps/custom-connector",
  "@datapulse/api-contracts/connector-message",
  "packages/api-contracts",
);
await validateResolution("services/share-api", "@datapulse/api-contracts/http", "packages/api-contracts");
await validateResolution(
  "services/share-api",
  "@datapulse/api-contracts/origin-policy",
  "packages/api-contracts",
);
await validateDeniedResolution("apps/custom-connector", "@datapulse/api-contracts");

const failedAssertions = assertions.filter(({ passed }) => !passed);
const summary = {
  schemaVersion: "1.0.0",
  kind: "datapulse-root-check-summary",
  check: "workspace-foundation",
  gateId: process.env.DATAPULSE_GATE_ID ?? null,
  runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
  result: failedAssertions.length === 0 ? "passed" : "failed",
  platform: process.platform,
  architecture: process.arch,
  workspaces: {
    required: requiredWorkspaces.length,
    discovered: discoveredWorkspacePaths.length,
    requiredPaths: requiredWorkspacePaths,
  },
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
