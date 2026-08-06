import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { builtinModules } from "node:module";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const workspaceNamespace = "@datapulse/";
const dependencySections = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredSourceDirectories = new Set(["node_modules", "dist", "coverage", ".turbo"]);
const forbiddenDependencyProtocols = ["file:", "link:", "npm:", "portal:"];
const viteConfigPattern = /^vite\.config\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u;
const expectedPnpmWorkspaceConfiguration = [
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
const forbiddenRootManifestGraphKeys = new Set([
  "overrides",
  "pnpm",
  "resolutions",
  "workspaces",
]);
const pnpmHookFileNames = [".pnpmfile.cjs", ".pnpmfile.js", ".pnpmfile.mjs"];
const builtinModuleNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => (name.startsWith("node:") ? name : `node:${name}`)),
]);

const names = Object.freeze({
  analysisEngine: "@datapulse/analysis-engine",
  apiContracts: "@datapulse/api-contracts",
  crypto: "@datapulse/crypto",
  domain: "@datapulse/domain",
  evidence: "@datapulse/evidence",
  generation: "@datapulse/generation",
  importEngine: "@datapulse/import-engine",
  localStorage: "@datapulse/local-storage",
  metricRuntime: "@datapulse/metric-runtime",
  narrative: "@datapulse/narrative",
  packageCodec: "@datapulse/package-codec",
  providerAdapters: "@datapulse/provider-adapters",
  renderer: "@datapulse/renderer",
  staticExport: "@datapulse/static-export",
  storyMigrations: "@datapulse/story-migrations",
  storySchema: "@datapulse/story-schema",
  themes: "@datapulse/themes",
});

function policy(name, allowedWorkspaceDependencies) {
  return Object.freeze({ name, allowedWorkspaceDependencies: new Set(allowedWorkspaceDependencies) });
}

const workspacePolicies = new Map([
  ["packages/domain", policy(names.domain, [])],
  ["packages/story-schema", policy(names.storySchema, [])],
  ["packages/themes", policy(names.themes, [])],
  [
    "packages/story-migrations",
    policy(names.storyMigrations, [names.domain, names.storySchema]),
  ],
  ["packages/metric-runtime", policy(names.metricRuntime, [names.domain])],
  ["packages/crypto", policy(names.crypto, [names.domain])],
  ["packages/import-engine", policy(names.importEngine, [names.domain])],
  ["packages/api-contracts", policy(names.apiContracts, [names.domain])],
  [
    "packages/analysis-engine",
    policy(names.analysisEngine, [names.domain, names.metricRuntime]),
  ],
  [
    "packages/evidence",
    policy(names.evidence, [names.storySchema, names.analysisEngine, names.metricRuntime]),
  ],
  ["packages/narrative", policy(names.narrative, [names.storySchema, names.metricRuntime])],
  [
    "packages/local-storage",
    policy(names.localStorage, [names.domain, names.crypto, names.storyMigrations]),
  ],
  [
    "packages/generation",
    policy(names.generation, [names.storySchema, names.evidence, names.narrative]),
  ],
  ["packages/renderer", policy(names.renderer, [names.storySchema, names.themes])],
  ["packages/package-codec", policy(names.packageCodec, [names.domain, names.storySchema])],
  ["packages/provider-adapters", policy(names.providerAdapters, [names.apiContracts])],
  ["packages/static-export", policy(names.staticExport, [names.renderer, names.themes])],
  [
    "apps/creator",
    policy("@datapulse/creator", [
      names.domain,
      names.localStorage,
      names.metricRuntime,
      names.renderer,
      names.storyMigrations,
    ]),
  ],
  [
    "apps/viewer",
    policy("@datapulse/viewer", [
      names.storySchema,
      names.storyMigrations,
      names.packageCodec,
      names.metricRuntime,
      names.narrative,
      names.renderer,
      names.themes,
      names.crypto,
    ]),
  ],
  ["apps/custom-connector", policy("@datapulse/custom-connector", [names.apiContracts])],
  ["apps/device-probe", policy("@datapulse/device-probe", [names.crypto])],
  [
    "services/model-proxy",
    policy("@datapulse/model-proxy", [names.apiContracts, names.providerAdapters]),
  ],
  ["services/share-api", policy("@datapulse/share-api", [names.apiContracts])],
  ["services/telemetry-ingest", policy("@datapulse/telemetry-ingest", [names.apiContracts])],
]);

const consumerSubpathPolicies = new Map([
  [
    names.storyMigrations,
    new Map([
      [names.domain, new Set(["."])],
      [
        names.storySchema,
        new Set([
          ".",
          "./development-migration-support",
          "./formal-migration-support",
        ]),
      ],
    ]),
  ],
  [
    "@datapulse/custom-connector",
    new Map([[names.apiContracts, new Set(["./connector-message"])]]),
  ],
]);

// Package exports describe what can resolve, not which consumer may use a
// security-sensitive implementation seam. These producer-owned subpaths are
// denied to every consumer unless consumerSubpathPolicies explicitly grants
// the exact target/subpath pair.
const restrictedProducerSubpaths = new Map([
  [
    names.storySchema,
    new Set([
      "./development-migration-support",
      "./formal-migration-support",
    ]),
  ],
]);

const consumerManifestDependencyPolicies = new Map([
  ["@datapulse/custom-connector", new Set([names.apiContracts])],
  [
    names.renderer,
    new Set([
      names.storySchema,
      names.themes,
      "@types/react",
      "react",
    ]),
  ],
  [
    "@datapulse/creator",
    new Set([
      names.domain,
      names.localStorage,
      names.metricRuntime,
      names.renderer,
      names.storyMigrations,
      "@types/react",
      "@types/react-dom",
      "react",
      "react-dom",
      "vite",
    ]),
  ],
  [
    "@datapulse/viewer",
    new Set([
      ...workspacePolicies.get("apps/viewer").allowedWorkspaceDependencies,
      "@types/react",
      "@types/react-dom",
      "@vitejs/plugin-react",
      "react",
      "react-dom",
      "vite",
    ]),
  ],
]);

const consumerExternalImportPolicies = new Map([
  ["@datapulse/custom-connector", new Set()],
  [names.renderer, new Set(["react"])],
  ["@datapulse/creator", new Set(["react", "react-dom", "vite"])],
  ["@datapulse/viewer", new Set(["react", "react-dom", "vite"])],
]);

const consumerBuiltinImportPolicies = new Map([
  ["@datapulse/custom-connector", new Set()],
  [names.renderer, new Set()],
  ["@datapulse/creator", new Set()],
  ["@datapulse/viewer", new Set()],
]);

const pureDeterministicWorkspaceNames = new Set([names.metricRuntime]);
const pureDeterministicManifestDependencyPolicies = new Map([
  [
    names.metricRuntime,
    new Map([
      ["dependencies", new Set([names.domain])],
      ["optionalDependencies", new Set()],
      ["peerDependencies", new Set()],
      ["devDependencies", new Set(["ajv", "json-schema-to-typescript"])],
    ]),
  ],
]);
const pureDeterministicCapabilityGlobalNames = new Set([
  "Buffer",
  "BroadcastChannel",
  "EventSource",
  "FileSystemHandle",
  "IDBFactory",
  "Storage",
  "WebSocket",
  "XMLHttpRequest",
  "caches",
  "document",
  "fetch",
  "indexedDB",
  "localStorage",
  "navigator",
  "process",
  "sessionStorage",
]);
const pureDeterministicNondeterministicGlobalNames = new Set([
  "Date",
  "Temporal",
  "crypto",
  "performance",
]);
const implicitLocaleMethodArgumentIndexes = new Map([
  ["localeCompare", 1],
  ["toLocaleDateString", 0],
  ["toLocaleString", 0],
  ["toLocaleTimeString", 0],
]);

function normalizePath(path) {
  return path.split(sep).join("/");
}

function isWithin(path, parentPath) {
  const relativePath = relative(parentPath, path);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

function isAbsoluteModuleSpecifier(specifier) {
  return posix.isAbsolute(specifier) || win32.isAbsolute(specifier);
}

function hasUrlScheme(specifier) {
  return /^[A-Za-z][A-Za-z\d+.-]*:/u.test(specifier);
}

function resolveRelativeModuleSpecifier(specifier, sourcePath) {
  if (/%[\dA-Fa-f]{2}/u.test(specifier) || specifier.includes("\\")) {
    return {
      error: "percent-encoded bytes and backslashes are not allowed",
      path: null,
    };
  }
  if (specifier.includes("?") || specifier.includes("#")) {
    return {
      error: "query and fragment module specifiers are not allowed",
      path: null,
    };
  }

  try {
    const targetUrl = new URL(specifier, pathToFileURL(sourcePath));
    if (targetUrl.protocol !== "file:") {
      return { error: `unexpected protocol ${targetUrl.protocol}`, path: null };
    }
    return { error: null, path: fileURLToPath(targetUrl) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      path: null,
    };
  }
}

function unwrapStaticExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isStaticViteConfigValue(node) {
  const value = unwrapStaticExpression(node);
  if (
    ts.isStringLiteralLike(value) ||
    ts.isNumericLiteral(value) ||
    value.kind === ts.SyntaxKind.TrueKeyword ||
    value.kind === ts.SyntaxKind.FalseKeyword ||
    value.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (
    ts.isPrefixUnaryExpression(value) &&
    [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(value.operator) &&
    ts.isNumericLiteral(value.operand)
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every(
      (element) => !ts.isSpreadElement(element) && isStaticViteConfigValue(element),
    );
  }
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        propertyNameText(property) !== null &&
        isStaticViteConfigValue(property.initializer),
    );
  }
  return false;
}

function isStaticViteConfigExport(node) {
  const expression = unwrapStaticExpression(node);
  if (isStaticViteConfigValue(expression)) {
    return true;
  }
  return (
    ts.isCallExpression(expression) &&
    isNamedIdentifier(expression.expression, "defineConfig") &&
    expression.arguments.length === 1 &&
    isStaticViteConfigValue(expression.arguments[0])
  );
}

function propertyNameText(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  if (
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node)
  ) {
    if (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) {
      return node.name.text;
    }
    if (
      ts.isComputedPropertyName(node.name) &&
      ts.isStringLiteralLike(node.name.expression)
    ) {
      return node.name.expression.text;
    }
  }
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text;
  }
  return null;
}

function isNamedIdentifier(node, name) {
  return ts.isIdentifier(node) && node.text === name;
}

function isImportMeta(node) {
  return (
    ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

function isDirectCallTarget(node) {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

function isRuntimeResolverMember(node, isUnboundIdentifier) {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) {
    return false;
  }

  const propertyName = propertyNameText(node);
  const receiver = node.expression;
  return (
    (isNamedIdentifier(receiver, "require") &&
      isUnboundIdentifier(receiver) &&
      ["apply", "bind", "call", "context", "resolve"].includes(propertyName ?? "")) ||
    (isNamedIdentifier(receiver, "module") &&
      isUnboundIdentifier(receiver) &&
      propertyName === "require") ||
    (isNamedIdentifier(receiver, "globalThis") &&
      isUnboundIdentifier(receiver) &&
      propertyName === "require") ||
    (isNamedIdentifier(receiver, "process") &&
      isUnboundIdentifier(receiver) &&
      propertyName === "getBuiltinModule") ||
    (isImportMeta(receiver) && ["glob", "globEager", "resolve"].includes(propertyName ?? ""))
  );
}

function isAllowedDirectRuntimeResolverMember(node, isUnboundIdentifier) {
  if (!ts.isPropertyAccessExpression(node) || !isDirectCallTarget(node)) {
    return false;
  }
  const propertyName = propertyNameText(node);
  const receiver = node.expression;
  return (
    (isNamedIdentifier(receiver, "require") &&
      isUnboundIdentifier(receiver) &&
      ["context", "resolve"].includes(propertyName ?? "")) ||
    (isNamedIdentifier(receiver, "module") &&
      isUnboundIdentifier(receiver) &&
      propertyName === "require") ||
    (isNamedIdentifier(receiver, "process") &&
      isUnboundIdentifier(receiver) &&
      propertyName === "getBuiltinModule") ||
    (isImportMeta(receiver) && ["glob", "globEager", "resolve"].includes(propertyName ?? ""))
  );
}

function isDeclarationOrPropertyName(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    ("name" in parent && parent.name === node)
  ) {
    return true;
  }
  return false;
}

function isAllowedDirectResolverIdentifier(node, isUnboundIdentifier) {
  const parent = node.parent;
  if (isNamedIdentifier(node, "require") && isUnboundIdentifier(node)) {
    if (ts.isCallExpression(parent) && parent.expression === node) {
      return true;
    }
    if (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === node &&
      ["context", "resolve"].includes(propertyNameText(parent) ?? "") &&
      isDirectCallTarget(parent)
    ) {
      return true;
    }
  }
  if (
    isNamedIdentifier(node, "module") &&
    isUnboundIdentifier(node) &&
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node &&
    propertyNameText(parent) === "require" &&
    isDirectCallTarget(parent)
  ) {
    return true;
  }
  return false;
}

function dependencyUsesForbiddenAlias(dependencyName, version) {
  if (typeof version !== "string") {
    return true;
  }
  if (forbiddenDependencyProtocols.some((protocol) => version.startsWith(protocol))) {
    return true;
  }
  if (!version.startsWith("workspace:")) {
    return false;
  }
  if (!dependencyName.startsWith(workspaceNamespace)) {
    return true;
  }
  const workspaceSelector = version.slice("workspace:".length);
  return workspaceSelector.startsWith("@") || workspaceSelector.includes("/");
}

function existingRealpath(path) {
  let candidate = resolve(path);
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) {
      return null;
    }
    candidate = parent;
  }
  try {
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createCollector() {
  const failures = [];
  let executed = 0;

  return {
    assert(condition, code, subject, message, expected, actual) {
      executed += 1;
      if (!condition) {
        failures.push({ code, subject, message, expected, actual });
      }
    },
    result() {
      const stableFailures = failures.sort((left, right) =>
        `${left.code}\0${left.subject}\0${left.message}`.localeCompare(
          `${right.code}\0${right.subject}\0${right.message}`,
          "en",
        ),
      );
      return {
        assertions: {
          executed,
          passed: executed - stableFailures.length,
          failed: stableFailures.length,
          skipped: 0,
        },
        failures: stableFailures,
      };
    },
  };
}

function readJson(path, collector, code, subject) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    collector.assert(true, code, subject, "JSON 可解析", true, true);
    return value;
  } catch (error) {
    collector.assert(
      false,
      code,
      subject,
      "JSON 必须存在且可解析",
      "valid JSON",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function validatePnpmWorkspaceConfiguration(collector, repositoryRoot) {
  const configurationPath = resolve(repositoryRoot, "pnpm-workspace.yaml");
  let configuration = null;
  try {
    configuration = readFileSync(configurationPath, "utf8").replaceAll("\r\n", "\n");
    collector.assert(
      true,
      "ARCH_PNPM_WORKSPACE_CONFIG_INVALID",
      "pnpm-workspace.yaml",
      "pnpm workspace 配置必须存在且可读",
      true,
      true,
    );
  } catch (error) {
    collector.assert(
      false,
      "ARCH_PNPM_WORKSPACE_CONFIG_INVALID",
      "pnpm-workspace.yaml",
      "pnpm workspace 配置必须存在且可读",
      "readable UTF-8 configuration",
      error instanceof Error ? error.message : String(error),
    );
  }

  collector.assert(
    configuration === expectedPnpmWorkspaceConfiguration,
    "ARCH_PNPM_WORKSPACE_CONFIG_INVALID",
    "pnpm-workspace.yaml",
    "pnpm workspace 范围与影响依赖图的设置必须精确匹配冻结配置",
    expectedPnpmWorkspaceConfiguration,
    configuration,
  );

  for (const hookFileName of pnpmHookFileNames) {
    collector.assert(
      !existsSync(resolve(repositoryRoot, hookFileName)),
      "ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN",
      hookFileName,
      "pnpm readPackage hook 可在 manifest 检查后改写依赖图，必须 fail-closed 禁止",
      "absent",
      existsSync(resolve(repositoryRoot, hookFileName)) ? "present" : "absent",
    );
  }
}

function validateRootPnpmGraphConfiguration(collector, manifest) {
  for (const graphKey of forbiddenRootManifestGraphKeys) {
    collector.assert(
      !Object.hasOwn(manifest, graphKey),
      "ARCH_PNPM_GRAPH_MUTATION_FORBIDDEN",
      `package.json#${graphKey}`,
      "root manifest 不得通过 pnpm、overrides、resolutions 或 workspaces 改写冻结依赖图",
      "absent",
      manifest[graphKey] ?? null,
    );
  }
}

function validateViteScriptConfiguration(collector, manifest, subject) {
  const scripts = manifest?.scripts;
  collector.assert(
    scripts === undefined || (scripts !== null && typeof scripts === "object" && !Array.isArray(scripts)),
    "ARCH_PACKAGE_SCRIPTS_INVALID",
    subject,
    "package scripts 必须是字符串映射",
    "object or absent",
    scripts === null ? null : typeof scripts,
  );
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return;
  }
  for (const [scriptName, command] of Object.entries(scripts)) {
    collector.assert(
      typeof command === "string",
      "ARCH_PACKAGE_SCRIPT_INVALID",
      `${subject}#scripts.${scriptName}`,
      "package script 必须是字符串",
      "string",
      typeof command,
    );
    if (typeof command !== "string") {
      continue;
    }
    const invokesVite = /\bvite(?:\.(?:c|m)?js|\.cmd)?\b/iu.test(command);
    const selectsCustomConfig = /(?:^|\s)(?:--config(?:=|\s)|--root(?:=|\s)|-c(?:=|\s))/u.test(command);
    collector.assert(
      !(invokesVite && selectsCustomConfig),
      "ARCH_VITE_CUSTOM_CONFIG_FORBIDDEN",
      `${subject}#scripts.${scriptName}`,
      "Vite 只能从 workspace 目录使用可发现并受检查的默认 vite.config.*，禁止 --config/-c/--root 改写入口",
      "default Vite config discovery",
      command,
    );
  }
}

function discoverWorkspacePaths(repositoryRoot, collector) {
  const workspacePaths = [];
  const repositoryRealpath = existingRealpath(repositoryRoot);

  for (const scope of ["apps", "packages", "services"]) {
    const scopePath = resolve(repositoryRoot, scope);
    if (!existsSync(scopePath)) {
      continue;
    }

    const scopeStat = lstatSync(scopePath);
    const scopeRealpath = existingRealpath(scopePath);
    collector.assert(
      scopeStat.isDirectory() && !scopeStat.isSymbolicLink(),
      "ARCH_SYMLINK_FORBIDDEN",
      scope,
      "workspace scope 根目录不得使用 symlink 或 junction 隐藏真实所有者",
      "real directory",
      scopeStat.isSymbolicLink() ? "symbolic link or junction" : "non-directory",
    );
    collector.assert(
      Boolean(
        repositoryRealpath &&
          scopeRealpath &&
          isWithin(scopeRealpath, repositoryRealpath),
      ),
      "ARCH_SCOPE_REALPATH_ESCAPE",
      scope,
      "workspace scope 的真实路径必须留在仓库根目录内",
      normalizePath(repositoryRealpath ?? repositoryRoot),
      scopeRealpath ? normalizePath(scopeRealpath) : null,
    );

    for (const entry of readdirSync(scopePath, { withFileTypes: true })) {
      const workspacePath = `${scope}/${entry.name}`;
      collector.assert(
        !entry.isSymbolicLink(),
        "ARCH_SYMLINK_FORBIDDEN",
        workspacePath,
        "workspace 根目录不得使用 symlink 或 junction 隐藏真实所有者",
        "real directory",
        "symbolic link or junction",
      );
      const workspaceDirectory = resolve(repositoryRoot, workspacePath);
      const hasManifest = existsSync(resolve(workspaceDirectory, "package.json"));
      if (hasManifest) {
        const workspaceRealpath = existingRealpath(workspaceDirectory);
        collector.assert(
          Boolean(
            repositoryRealpath &&
              scopeRealpath &&
              workspaceRealpath &&
              isWithin(workspaceRealpath, repositoryRealpath) &&
              isWithin(workspaceRealpath, scopeRealpath),
          ),
          "ARCH_WORKSPACE_REALPATH_ESCAPE",
          workspacePath,
          "workspace 根目录的真实路径必须由对应 scope 和仓库共同所有",
          normalizePath(scopeRealpath ?? scopePath),
          workspaceRealpath ? normalizePath(workspaceRealpath) : null,
        );
      }
      if (entry.isDirectory() && hasManifest) {
        workspacePaths.push(workspacePath);
      }
    }
  }

  return sorted(workspacePaths);
}

function collectSourceFiles({
  collector,
  configuredSourceFiles,
  repositoryRoot,
  workspaceDirectory,
  workspacePath,
}) {
  if (!existsSync(workspaceDirectory)) {
    return [];
  }

  const workspaceRealpath = existingRealpath(workspaceDirectory);
  const files = new Set();
  for (const configuredSourcePath of configuredSourceFiles) {
    if (!sourceExtensions.has(extname(configuredSourcePath).toLowerCase())) {
      continue;
    }
    const absoluteSourcePath = resolve(configuredSourcePath);
    const sourceRealpath = existingRealpath(absoluteSourcePath);
    collector.assert(
      Boolean(workspaceRealpath && sourceRealpath && isWithin(sourceRealpath, workspaceRealpath)),
      "ARCH_SOURCE_REALPATH_ESCAPE",
      normalizePath(relative(repositoryRoot, absoluteSourcePath)),
      "TypeScript 输入的真实路径必须留在当前 workspace",
      workspacePath,
      sourceRealpath ? normalizePath(relative(repositoryRoot, sourceRealpath)) : null,
    );
    if (workspaceRealpath && sourceRealpath && isWithin(sourceRealpath, workspaceRealpath)) {
      files.add(absoluteSourcePath);
    }
  }
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      if (ignoredSourceDirectories.has(entry.name)) {
        if (entry.name !== "node_modules") {
          collector.assert(
            !entry.isSymbolicLink(),
            "ARCH_SYMLINK_FORBIDDEN",
            normalizePath(relative(repositoryRoot, entryPath)),
            "生成目录不得使用 symlink 或 junction 改写真实所有者",
            "real directory or absent",
            "symbolic link or junction",
          );
        }
        continue;
      }
      collector.assert(
        !entry.isSymbolicLink(),
        "ARCH_SYMLINK_FORBIDDEN",
        normalizePath(relative(repositoryRoot, entryPath)),
        "workspace 源码与配置不得使用 symlink 或 junction 改写真实路径",
        "regular file or directory",
        "symbolic link or junction",
      );
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase())) {
        files.add(entryPath);
      }
    }
  };
  visit(workspaceDirectory);
  return [...files].sort((left, right) => left.localeCompare(right, "en"));
}

function parsePackageSpecifier(specifier) {
  if (!specifier.startsWith(workspaceNamespace)) {
    return null;
  }

  const segments = specifier.split("/");
  if (segments.length < 2 || segments[0] !== "@datapulse" || segments[1] === "") {
    return null;
  }

  return {
    packageName: `${segments[0]}/${segments[1]}`,
    subpath: segments.length === 2 ? "." : `./${segments.slice(2).join("/")}`,
  };
}

function externalPackageName(specifier) {
  if (specifier.startsWith("@")) {
    const segments = specifier.split("/");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

function exportSubpaths(exportsField) {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return new Set(["."]);
  }
  if (!exportsField || typeof exportsField !== "object") {
    return new Set();
  }

  const keys = Object.keys(exportsField);
  const subpathKeys = keys.filter((key) => key.startsWith("."));
  return new Set(subpathKeys.length > 0 ? subpathKeys : ["."]);
}

function stringLeaves(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => stringLeaves(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => stringLeaves(entry));
  }
  return [];
}

function dependencyFailureCode(workspacePath) {
  if (workspacePath === "apps/viewer") {
    return "ARCH_VIEWER_BOUNDARY";
  }
  if (workspacePath === "apps/custom-connector") {
    return "ARCH_CONNECTOR_BOUNDARY";
  }
  if (workspacePath.startsWith("services/")) {
    return "ARCH_SERVICE_BOUNDARY";
  }
  return "ARCH_DEPENDENCY_DIRECTION";
}

function findCycles(graph) {
  const cycles = new Set();
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  const visit = (node) => {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const cycle = [...stack.slice(cycleStart), node];
      cycles.add(cycle.join(" -> "));
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    stack.push(node);
    for (const dependency of sorted(graph.get(node) ?? [])) {
      if (graph.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of sorted(graph.keys())) {
    visit(node);
  }
  return sorted(cycles);
}

function collectModuleSpecifiers(
  sourceFile,
  checker,
  { enforcePureDeterministicRuntime, workspaceName },
) {
  const specifiers = [];
  const forbiddenLocations = new Set();
  const isViteConfig = viteConfigPattern.test(basename(sourceFile.fileName));
  const isUnboundIdentifier = (node) =>
    ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === undefined;
  const hasLocalRuntimeDeclaration = (node) => {
    const symbol = checker.getSymbolAtLocation(node);
    return (
      symbol?.declarations?.some(
        (declaration) =>
          declaration.getSourceFile() === sourceFile &&
          !declaration.getSourceFile().isDeclarationFile &&
          (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient) === 0,
      ) === true
    );
  };
  const browserConsumer = consumerBuiltinImportPolicies.has(workspaceName);
  const safeProcessProperties = new Set([
    "arch",
    "argv",
    "cwd",
    "env",
    "exitCode",
    "platform",
    "version",
    "versions",
  ]);
  const runtimeGlobalNames = new Set([
    "frames",
    "global",
    "globalThis",
    "parent",
    "self",
    "top",
    "window",
  ]);
  const runtimeCodeGenerationProperties = new Set(["Function", "constructor", "eval"]);
  const runtimeModuleResolverProperties = new Set([
    "importScripts",
    "module",
    "process",
    "require",
  ]);

  const directPropertyUse = (node) => {
    const parent = node.parent;
    if (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === node
    ) {
      return propertyNameText(parent);
    }
    return null;
  };

  const recordLiteral = (node, kind, dependencyCandidates) => {
    if (node && ts.isStringLiteralLike(node)) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      specifiers.push({
        kind,
        literal: true,
        specifier: node.text,
        ...(dependencyCandidates ? { dependencyCandidates } : {}),
        line: location.line + 1,
        column: location.character + 1,
      });
      return true;
    }
    return false;
  };

  const recordDirective = (directive, kind, dependencyCandidates) => {
    const location = sourceFile.getLineAndCharacterOfPosition(directive.pos);
    specifiers.push({
      kind,
      literal: true,
      specifier: directive.fileName,
      ...(dependencyCandidates ? { dependencyCandidates } : {}),
      line: location.line + 1,
      column: location.character + 1,
    });
  };

  const recordNonLiteral = (node, kind) => {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    specifiers.push({
      kind,
      literal: false,
      specifier: null,
      line: location.line + 1,
      column: location.character + 1,
    });
  };

  const recordForbidden = (node, kind, code, message) => {
    const start = node.getStart(sourceFile);
    const key = `${start}:${code}`;
    if (forbiddenLocations.has(key)) {
      return;
    }
    forbiddenLocations.add(key);
    const location = sourceFile.getLineAndCharacterOfPosition(start);
    specifiers.push({
      kind,
      literal: false,
      specifier: null,
      line: location.line + 1,
      column: location.character + 1,
      forbidden: { code, message },
    });
  };

  if (isViteConfig) {
    const defaultExports = sourceFile.statements.filter(
      (statement) => ts.isExportAssignment(statement) && !statement.isExportEquals,
    );
    const defaultExport = defaultExports[0] ?? sourceFile;
    if (
      defaultExports.length !== 1 ||
      !ts.isExportAssignment(defaultExport) ||
      !isStaticViteConfigExport(defaultExport.expression)
    ) {
      recordForbidden(
        defaultExport,
        "vite-dynamic-config",
        "ARCH_VITE_DYNAMIC_CONFIG_FORBIDDEN",
        "Vite 配置只允许单一静态 export default 对象或 defineConfig(静态对象)",
      );
    }
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        recordLiteral(node.moduleSpecifier, ts.isImportDeclaration(node) ? "import" : "export");
        if (
          isViteConfig &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith(".")
        ) {
          recordForbidden(
            node.moduleSpecifier,
            "vite-config-fragment",
            "ARCH_VITE_CONFIG_FRAGMENT_FORBIDDEN",
            "Vite 配置在解析图证明落地前不得导入本地配置片段",
          );
        }
        if (
          !isViteConfig &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          (node.moduleSpecifier.text === "vite" || node.moduleSpecifier.text.startsWith("vite/"))
        ) {
          recordForbidden(
            node.moduleSpecifier,
            "vite-programmatic-config",
            "ARCH_VITE_PROGRAMMATIC_CONFIG_FORBIDDEN",
            "Vite 程序化 API 在解析后 realpath 图落地前只能出现在默认配置文件",
          );
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      recordLiteral(node.moduleReference.expression, "import-equals");
    } else if (ts.isImportTypeNode(node)) {
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
      if (!recordLiteral(literal, "import-type")) {
        recordNonLiteral(node.argument, "import-type");
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        isNamedIdentifier(node.expression, "require") && isUnboundIdentifier(node.expression);
      const propertyCall = ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
      const isRequireResolve =
        propertyCall &&
        isNamedIdentifier(propertyCall.expression, "require") &&
        isUnboundIdentifier(propertyCall.expression) &&
        propertyCall.name.text === "resolve";
      const isModuleRequire =
        propertyCall &&
        isNamedIdentifier(propertyCall.expression, "module") &&
        isUnboundIdentifier(propertyCall.expression) &&
        propertyCall.name.text === "require";
      const isImportMetaCall =
        propertyCall &&
        isImportMeta(propertyCall.expression) &&
        ["resolve", "glob", "globEager"].includes(propertyCall.name.text);
      const isRequireContext =
        propertyCall &&
        isNamedIdentifier(propertyCall.expression, "require") &&
        isUnboundIdentifier(propertyCall.expression) &&
        propertyCall.name.text === "context";
      const isProcessBuiltinModule =
        propertyCall &&
        isNamedIdentifier(propertyCall.expression, "process") &&
        isUnboundIdentifier(propertyCall.expression) &&
        propertyCall.name.text === "getBuiltinModule";
      const resolverKind = isDynamicImport
        ? "dynamic-import"
        : isRequire
          ? "require"
          : isRequireResolve
            ? "require-resolve"
            : isModuleRequire
              ? "module-require"
              : isImportMetaCall
                ? `import-meta-${propertyCall.name.text}`
                : isRequireContext
                  ? "require-context"
                  : isProcessBuiltinModule
                    ? "process-get-builtin-module"
                    : null;
      if (resolverKind) {
        const recordedLiteral = recordLiteral(node.arguments[0], resolverKind);
        if (!recordedLiteral) {
          recordNonLiteral(node, resolverKind);
        } else if (
          isViteConfig &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[0].text.startsWith(".")
        ) {
          recordForbidden(
            node.arguments[0],
            "vite-config-fragment",
            "ARCH_VITE_CONFIG_FRAGMENT_FORBIDDEN",
            "Vite 配置在解析图证明落地前不得加载本地配置片段",
          );
        }
      }
    }

    if (
      isRuntimeResolverMember(node, isUnboundIdentifier) &&
      !isAllowedDirectRuntimeResolverMember(node, isUnboundIdentifier)
    ) {
      recordForbidden(
        node,
        "runtime-module-resolver-reference",
        "ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN",
        "运行时 module resolver 只能使用已静态检查的直接调用形式",
      );
    }
    if (
      ts.isIdentifier(node) &&
      ["module", "require"].includes(node.text) &&
      isUnboundIdentifier(node) &&
      !isDeclarationOrPropertyName(node) &&
      !isAllowedDirectResolverIdentifier(node, isUnboundIdentifier)
    ) {
      recordForbidden(
        node,
        "runtime-module-resolver-alias",
        "ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN",
        "禁止保存、转发或间接调用 require/module 运行时解析器",
      );
    }
    if (
      ts.isIdentifier(node) &&
      isUnboundIdentifier(node) &&
      ["eval", "Function"].includes(node.text) &&
      !isDeclarationOrPropertyName(node)
    ) {
      recordForbidden(
        node,
        "runtime-code-generation",
        "ARCH_RUNTIME_CODE_GENERATION_FORBIDDEN",
        "禁止通过 eval/Function 构造无法静态检查的模块加载路径",
      );
    }
    if (
      isNamedIdentifier(node, "process") &&
      isUnboundIdentifier(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      const propertyName = directPropertyUse(node);
      if (browserConsumer || !safeProcessProperties.has(propertyName ?? "")) {
        recordForbidden(
          node,
          "runtime-process-alias",
          "ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN",
          "process 只能在非浏览器 workspace 直接访问批准属性，禁止解构或传播运行时模块解析能力",
        );
      }
    }
    if (
      ts.isIdentifier(node) &&
      runtimeGlobalNames.has(node.text) &&
      isUnboundIdentifier(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      const propertyName = directPropertyUse(node);
      if (propertyName === null || runtimeCodeGenerationProperties.has(propertyName)) {
        recordForbidden(
          node,
          "runtime-global-code-generation",
          "ARCH_RUNTIME_CODE_GENERATION_FORBIDDEN",
          "运行时全局对象只能直接访问静态批准属性，禁止传播或取得 eval/Function/constructor 动态代码能力",
        );
      } else if (runtimeModuleResolverProperties.has(propertyName)) {
        recordForbidden(
          node,
          "runtime-global-module-resolver",
          "ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN",
          "运行时全局对象禁止取得 importScripts/process/module/require 模块解析能力",
        );
      }
    }
    if (
      enforcePureDeterministicRuntime &&
      ts.isIdentifier(node) &&
      pureDeterministicCapabilityGlobalNames.has(node.text) &&
      !hasLocalRuntimeDeclaration(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      recordForbidden(
        node,
        "pure-runtime-capability-global",
        "ARCH_PURE_RUNTIME_CAPABILITY_BOUNDARY",
        "纯确定性运行时禁止访问网络、浏览器存储或环境能力全局对象",
      );
    }
    if (
      enforcePureDeterministicRuntime &&
      ts.isIdentifier(node) &&
      runtimeGlobalNames.has(node.text) &&
      !hasLocalRuntimeDeclaration(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      recordForbidden(
        node,
        "pure-runtime-capability-global-member",
        "ARCH_PURE_RUNTIME_CAPABILITY_BOUNDARY",
        "纯确定性运行时禁止访问或传播 window、self、globalThis 等运行时环境对象",
      );
    }
    if (
      enforcePureDeterministicRuntime &&
      ts.isIdentifier(node) &&
      pureDeterministicNondeterministicGlobalNames.has(node.text) &&
      !hasLocalRuntimeDeclaration(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      recordForbidden(
        node,
        "pure-runtime-nondeterministic-global",
        "ARCH_PURE_RUNTIME_NONDETERMINISTIC_BOUNDARY",
        "纯确定性运行时禁止读取设备时间、计时器或随机环境能力",
      );
    }
    if (
      enforcePureDeterministicRuntime &&
      isNamedIdentifier(node, "Math") &&
      !hasLocalRuntimeDeclaration(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      const propertyName = directPropertyUse(node);
      if (propertyName === null || propertyName === "random") {
        recordForbidden(
          node,
          "pure-runtime-random",
          "ARCH_PURE_RUNTIME_NONDETERMINISTIC_BOUNDARY",
          "纯确定性运行时禁止 Math.random 或传播 Math 以间接取得随机能力",
        );
      }
    }
    if (
      enforcePureDeterministicRuntime &&
      isNamedIdentifier(node, "Intl") &&
      !hasLocalRuntimeDeclaration(node) &&
      !isDeclarationOrPropertyName(node)
    ) {
      recordForbidden(
        node,
        "pure-runtime-intl",
        "ARCH_PURE_RUNTIME_IMPLICIT_LOCALE",
        "纯确定性运行时禁止读取默认 Intl locale、时区或实现环境",
      );
    }
    if (
      enforcePureDeterministicRuntime &&
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    ) {
      const propertyName = propertyNameText(node);
      const localeArgumentIndex = implicitLocaleMethodArgumentIndexes.get(propertyName ?? "");
      if (localeArgumentIndex !== undefined) {
        const hasLocalPropertyDeclaration =
          ts.isPropertyAccessExpression(node) && hasLocalRuntimeDeclaration(node.name);
        const call = ts.isCallExpression(node.parent) && node.parent.expression === node
          ? node.parent
          : null;
        const localeArgument = call?.arguments[localeArgumentIndex];
        const hasExplicitLiteralLocale =
          localeArgument !== undefined &&
          ts.isStringLiteralLike(localeArgument) &&
          localeArgument.text.length > 0;
        if (!hasLocalPropertyDeclaration && !hasExplicitLiteralLocale) {
          recordForbidden(
            node,
            "pure-runtime-implicit-locale",
            "ARCH_PURE_RUNTIME_IMPLICIT_LOCALE",
            "纯确定性运行时的 locale-sensitive 操作必须直接传入非空字面量 locale",
          );
        }
      }
    }

    if (isViteConfig) {
      const propertyName =
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node))
          ? propertyNameText(node)
          : null;
      const isAliasIdentifier =
        ts.isIdentifier(node) && node.text === "alias" && !isDeclarationOrPropertyName(node);
      const isMergeConfigIdentifier = ts.isIdentifier(node) && node.text === "mergeConfig";
      if (propertyName === "alias" || isAliasIdentifier || isMergeConfigIdentifier) {
        recordForbidden(
          node,
          "vite-resolve-alias",
          "ARCH_VITE_ALIAS_FORBIDDEN",
          "Vite alias/mergeConfig 在解析后 realpath 图证明落地前必须 fail-closed 禁止",
        );
      }
      if (propertyName === "plugins") {
        recordForbidden(
          node,
          "vite-plugin",
          "ARCH_VITE_PLUGIN_FORBIDDEN",
          "Vite plugins 在解析后 realpath module graph 落地前必须 fail-closed 禁止",
        );
      }
      if (
        (ts.isComputedPropertyName(node) || ts.isElementAccessExpression(node)) &&
        propertyNameText(node) === null
      ) {
        recordForbidden(
          node,
          "vite-dynamic-config-key",
          "ARCH_VITE_DYNAMIC_CONFIG_FORBIDDEN",
          "Vite 配置不得使用无法静态证明不含 alias 的动态属性",
        );
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  for (const directive of sourceFile.referencedFiles) {
    recordDirective(directive, "triple-slash-path");
  }
  for (const directive of sourceFile.typeReferenceDirectives) {
    const packageName = externalPackageName(directive.fileName);
    const dependencyCandidates = packageName.startsWith("@")
      ? [packageName]
      : [packageName, `@types/${packageName}`];
    recordDirective(directive, "triple-slash-types", dependencyCandidates);
  }

  const visitedJsDoc = new Set();
  const visitJsDoc = (node) => {
    if (visitedJsDoc.has(node)) {
      return;
    }
    visitedJsDoc.add(node);
    if (ts.isImportTypeNode(node)) {
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
      if (!recordLiteral(literal, "jsdoc-import-type")) {
        recordNonLiteral(node.argument, "jsdoc-import-type");
      }
    }
    for (const child of node.getChildren(sourceFile)) {
      visitJsDoc(child);
    }
  };
  const discoverJsDoc = (node) => {
    for (const jsDoc of node.jsDoc ?? []) {
      visitJsDoc(jsDoc);
    }
    ts.forEachChild(node, discoverJsDoc);
  };
  discoverJsDoc(sourceFile);
  return specifiers;
}

function validatePolicyCatalog(collector) {
  const knownNames = new Set([...workspacePolicies.values()].map(({ name }) => name));
  const policyGraph = new Map();

  collector.assert(
    knownNames.size === workspacePolicies.size,
    "ARCH_POLICY_NAME_DUPLICATE",
    "dependency-policy",
    "完整策略目录的 workspace 包名必须唯一",
    workspacePolicies.size,
    knownNames.size,
  );

  for (const [workspacePath, workspacePolicy] of workspacePolicies) {
    policyGraph.set(workspacePolicy.name, workspacePolicy.allowedWorkspaceDependencies);
    for (const dependency of workspacePolicy.allowedWorkspaceDependencies) {
      collector.assert(
        knownNames.has(dependency),
        "ARCH_POLICY_TARGET_UNKNOWN",
        workspacePath,
        "计划依赖目标必须登记在完整策略目录",
        "known policy package",
        dependency,
      );
    }
  }

  for (const workspaceName of pureDeterministicWorkspaceNames) {
    collector.assert(
      knownNames.has(workspaceName),
      "ARCH_PURE_RUNTIME_POLICY_TARGET_UNKNOWN",
      workspaceName,
      "纯确定性运行时策略必须指向已登记 workspace",
      "known policy package",
      workspaceName,
    );
    const manifestSectionPolicies =
      pureDeterministicManifestDependencyPolicies.get(workspaceName);
    collector.assert(
      manifestSectionPolicies instanceof Map &&
        dependencySections.every((section) => manifestSectionPolicies.has(section)),
      "ARCH_PURE_RUNTIME_POLICY_INVALID",
      workspaceName,
      "纯确定性运行时必须为每个 manifest 依赖区声明精确集合",
      dependencySections,
      manifestSectionPolicies === undefined ? null : sorted(manifestSectionPolicies.keys()),
    );
    for (const [section, allowedDependencies] of manifestSectionPolicies ?? []) {
      collector.assert(
        allowedDependencies instanceof Set,
        "ARCH_PURE_RUNTIME_POLICY_INVALID",
        `${workspaceName}#${section}`,
        "纯确定性运行时 manifest 依赖区策略必须是集合",
        "dependency set",
        typeof allowedDependencies,
      );
      for (const dependency of allowedDependencies ?? []) {
        if (!dependency.startsWith(workspaceNamespace)) {
          continue;
        }
        collector.assert(
          knownNames.has(dependency),
          "ARCH_PURE_RUNTIME_POLICY_TARGET_UNKNOWN",
          `${workspaceName}#${section}`,
          "纯确定性运行时批准的内部依赖必须指向已登记 workspace",
          "known policy package",
          dependency,
        );
      }
    }
  }

  for (const [producerName, restrictedSubpaths] of restrictedProducerSubpaths) {
    collector.assert(
      knownNames.has(producerName),
      "ARCH_RESTRICTED_SUBPATH_PRODUCER_UNKNOWN",
      producerName,
      "受限 export 子路径的生产者必须登记在完整策略目录",
      "known policy package",
      producerName,
    );
    collector.assert(
      restrictedSubpaths.size > 0 &&
        [...restrictedSubpaths].every((subpath) => subpath.startsWith("./")),
      "ARCH_RESTRICTED_SUBPATH_INVALID",
      producerName,
      "生产者受限 export 必须是非空显式子路径集合",
      "non-empty explicit subpaths",
      sorted(restrictedSubpaths),
    );
  }

  const policyCycles = findCycles(policyGraph);
  collector.assert(
    policyCycles.length === 0,
    "ARCH_POLICY_CYCLE",
    "dependency-policy",
    "完整目标依赖方向本身必须无循环",
    [],
    policyCycles,
  );
}

function validateSourceImports({ collector, repositoryRoot, workspace, workspaceByName }) {
  const sourceFiles = collectSourceFiles({
    collector,
    configuredSourceFiles: workspace.configuredSourceFiles,
    repositoryRoot,
    workspaceDirectory: workspace.absolutePath,
    workspacePath: workspace.path,
  });
  const workspaceRealpath = existingRealpath(workspace.absolutePath);
  const program = ts.createProgram({
    rootNames: sourceFiles,
    options: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      noLib: true,
      noResolve: true,
      target: ts.ScriptTarget.Latest,
    },
  });
  const checker = program.getTypeChecker();
  let importCount = 0;

  for (const sourcePath of sourceFiles) {
    const relativeSourcePath = normalizePath(relative(repositoryRoot, sourcePath));
    const relativeWorkspaceSourcePath = normalizePath(relative(workspace.absolutePath, sourcePath));
    const enforcePureDeterministicRuntime =
      pureDeterministicWorkspaceNames.has(workspace.name) &&
      relativeWorkspaceSourcePath.startsWith("src/");
    let sourceText;
    try {
      sourceText = readFileSync(sourcePath, "utf8");
      collector.assert(
        true,
        "ARCH_SOURCE_UNREADABLE",
        relativeSourcePath,
        "源码必须可读",
        true,
        true,
      );
    } catch (error) {
      collector.assert(
        false,
        "ARCH_SOURCE_UNREADABLE",
        relativeSourcePath,
        "源码必须可读",
        "readable UTF-8 source",
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
    const sourceFile =
      program.getSourceFile(sourcePath) ??
      ts.createSourceFile(
        sourcePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.getScriptKindFromFileName(sourcePath),
      );
    collector.assert(
      sourceFile.parseDiagnostics.length === 0,
      "ARCH_SOURCE_PARSE_ERROR",
      relativeSourcePath,
      "源码必须可由 TypeScript 解析后再检查依赖",
      [],
      sourceFile.parseDiagnostics.map((diagnostic) => diagnostic.code),
    );

    for (const imported of collectModuleSpecifiers(sourceFile, checker, {
      enforcePureDeterministicRuntime,
      workspaceName: workspace.name,
    })) {
      importCount += 1;
      const subject = `${relativeSourcePath}:${imported.line}:${imported.column}`;
      if (imported.forbidden) {
        collector.assert(
          false,
          imported.forbidden.code,
          subject,
          imported.forbidden.message,
          "statically auditable module resolution",
          imported.kind,
        );
        continue;
      }
      collector.assert(
        imported.literal,
        "ARCH_NON_LITERAL_MODULE_SPECIFIER",
        subject,
        `${imported.kind} 必须使用可静态检查的字符串模块标识`,
        "string literal",
        imported.specifier,
      );
      if (!imported.literal) {
        continue;
      }

      const specifier = imported.specifier;
      collector.assert(
        specifier !== "node:module" && specifier !== "module",
        "ARCH_RUNTIME_MODULE_RESOLVER_FORBIDDEN",
        subject,
        "workspace 源码禁止引入可创建不透明 require 的运行时 module resolver",
        "no node:module/module import",
        specifier,
      );
      if (builtinModuleNames.has(specifier)) {
        if (enforcePureDeterministicRuntime) {
          collector.assert(
            false,
            "ARCH_PURE_RUNTIME_BUILTIN_BOUNDARY",
            subject,
            "纯确定性运行时不得导入 Node 内建模块",
            [],
            specifier,
          );
        }
        const allowedBuiltins = consumerBuiltinImportPolicies.get(workspace.name);
        if (allowedBuiltins) {
          const canonicalBuiltin = specifier.startsWith("node:")
            ? specifier
            : `node:${specifier}`;
          collector.assert(
            allowedBuiltins.has(canonicalBuiltin),
            "ARCH_BROWSER_CONSUMER_BUILTIN_BOUNDARY",
            subject,
            "高风险浏览器消费者只能使用显式批准的 Node 内建模块",
            sorted(allowedBuiltins),
            canonicalBuiltin,
          );
        }
        continue;
      }
      collector.assert(
        !isAbsoluteModuleSpecifier(specifier),
        "ARCH_ABSOLUTE_MODULE_SPECIFIER",
        subject,
        "模块标识不得使用 POSIX、Windows 盘符或 UNC 绝对路径",
        "relative or declared package specifier",
        specifier,
      );
      if (isAbsoluteModuleSpecifier(specifier)) {
        continue;
      }
      collector.assert(
        !hasUrlScheme(specifier),
        "ARCH_URL_MODULE_SPECIFIER",
        subject,
        "模块标识不得使用 file/http/data 等 URL scheme 绕过 package seam",
        "relative or declared package specifier",
        specifier,
      );
      if (hasUrlScheme(specifier)) {
        continue;
      }
      if (specifier.startsWith(".")) {
        const relativeTarget = resolveRelativeModuleSpecifier(specifier, sourcePath);
        collector.assert(
          relativeTarget.error === null,
          "ARCH_RELATIVE_IMPORT_CANONICALIZATION_FORBIDDEN",
          subject,
          "相对 import 必须是不含百分号编码、反斜杠、query 或 fragment 歧义的有效 file URL 路径",
          "canonical relative file URL",
          relativeTarget.error,
        );
        if (!relativeTarget.path) {
          continue;
        }
        const targetPath = relativeTarget.path;
        collector.assert(
          isWithin(targetPath, workspace.absolutePath),
          "ARCH_RELATIVE_IMPORT_ESCAPE",
          subject,
          "相对 import 不得逃逸 workspace；跨 workspace 必须经过公开 package export",
          workspace.path,
          normalizePath(relative(repositoryRoot, targetPath)),
        );
        const targetRealpath = existingRealpath(targetPath);
        collector.assert(
          Boolean(workspaceRealpath && targetRealpath && isWithin(targetRealpath, workspaceRealpath)),
          "ARCH_RELATIVE_IMPORT_REALPATH_ESCAPE",
          subject,
          "相对 import 的最近真实路径不得经 symlink/junction 逃逸 workspace",
          workspace.path,
          targetRealpath ? normalizePath(relative(repositoryRoot, targetRealpath)) : null,
        );
        continue;
      }

      const parsedSpecifier = parsePackageSpecifier(specifier);
      if (!parsedSpecifier) {
        const dependencyCandidates = imported.dependencyCandidates ?? [externalPackageName(specifier)];
        const dependencyName = dependencyCandidates.find((candidate) =>
          workspace.allDeclaredDependencies.has(candidate),
        );
        collector.assert(
          Boolean(dependencyName),
          "ARCH_UNDECLARED_BARE_IMPORT",
          subject,
          "非相对 import 必须对应当前 workspace 显式依赖，禁止未登记 alias",
          sorted(workspace.allDeclaredDependencies),
          dependencyCandidates,
        );
        const allowedExternalImports = consumerExternalImportPolicies.get(workspace.name);
        if (allowedExternalImports) {
          collector.assert(
            dependencyCandidates.some((candidate) => allowedExternalImports.has(candidate)),
            "ARCH_BROWSER_CONSUMER_EXTERNAL_IMPORT_BOUNDARY",
            subject,
            "高风险浏览器消费者源码只能导入显式批准的外部 package",
            sorted(allowedExternalImports),
            dependencyCandidates,
          );
        }
        if (enforcePureDeterministicRuntime) {
          collector.assert(
            false,
            "ARCH_PURE_RUNTIME_EXTERNAL_IMPORT_BOUNDARY",
            subject,
            "纯确定性运行时源码不得导入外部 package",
            [],
            dependencyCandidates,
          );
        }
        continue;
      }

      const targetWorkspace = workspaceByName.get(parsedSpecifier.packageName);
      collector.assert(
        Boolean(targetWorkspace),
        "ARCH_SOURCE_WORKSPACE_TARGET_MISSING",
        subject,
        "@datapulse import 必须指向当前已登记 workspace",
        "registered workspace package",
        parsedSpecifier.packageName,
      );
      if (!targetWorkspace) {
        continue;
      }

      collector.assert(
        targetWorkspace.name !== workspace.name,
        "ARCH_SELF_WORKSPACE_IMPORT",
        subject,
        "workspace 内部实现使用相对 import，不经自身 package export 回绕",
        "different workspace",
        targetWorkspace.name,
      );
      collector.assert(
        workspace.workspaceDependencies.has(targetWorkspace.name),
        "ARCH_UNDECLARED_WORKSPACE_IMPORT",
        subject,
        "源码 workspace import 必须在 package.json 显式声明",
        sorted(workspace.workspaceDependencies),
        targetWorkspace.name,
      );

      const allowedDependencies = workspace.policy?.allowedWorkspaceDependencies ?? new Set();
      collector.assert(
        allowedDependencies.has(targetWorkspace.name),
        dependencyFailureCode(workspace.path),
        subject,
        "源码 import 必须遵循目标依赖方向",
        sorted(allowedDependencies),
        targetWorkspace.name,
      );

      const availableSubpaths = targetWorkspace.exportSubpaths;
      collector.assert(
        availableSubpaths.has(parsedSpecifier.subpath),
        "ARCH_UNEXPORTED_WORKSPACE_IMPORT",
        subject,
        "workspace import 必须使用生产者显式 export 子路径",
        sorted(availableSubpaths),
        parsedSpecifier.subpath,
      );

      const consumerPolicy = consumerSubpathPolicies.get(workspace.name);
      const allowedSubpaths = consumerPolicy?.get(targetWorkspace.name);
      const producerRestrictedSubpaths = restrictedProducerSubpaths.get(
        targetWorkspace.name,
      );
      if (producerRestrictedSubpaths?.has(parsedSpecifier.subpath)) {
        collector.assert(
          allowedSubpaths?.has(parsedSpecifier.subpath) === true,
          "ARCH_CONSUMER_SUBPATH_BOUNDARY",
          subject,
          "生产者受限 export 子路径只对白名单消费者开放",
          sorted(allowedSubpaths ?? new Set()),
          parsedSpecifier.subpath,
        );
      }
      if (allowedSubpaths) {
        collector.assert(
          allowedSubpaths.has(parsedSpecifier.subpath),
          "ARCH_CONSUMER_SUBPATH_BOUNDARY",
          subject,
          "消费者只能使用为其批准的受限 export 子路径",
          sorted(allowedSubpaths),
          parsedSpecifier.subpath,
        );
      }
    }
  }

  return { sourceFileCount: sourceFiles.length, importCount };
}

/**
 * Analyze DataPulse workspace dependencies through one fail-closed seam.
 * Expected repository violations are returned as stable diagnostics; they are not thrown.
 */
function analyzeDependencyBoundariesInternal({ repositoryRoot }) {
  const absoluteRepositoryRoot = resolve(repositoryRoot);
  const collector = createCollector();
  validatePolicyCatalog(collector);

  collector.assert(
    existsSync(absoluteRepositoryRoot) && statSync(absoluteRepositoryRoot).isDirectory(),
    "ARCH_REPOSITORY_UNREADABLE",
    "repository-root",
    "repositoryRoot 必须是可读目录",
    "readable directory",
    absoluteRepositoryRoot,
  );
  validatePnpmWorkspaceConfiguration(collector, absoluteRepositoryRoot);

  const rootManifestPath = resolve(absoluteRepositoryRoot, "package.json");
  if (existsSync(rootManifestPath)) {
    const rootManifest = readJson(
      rootManifestPath,
      collector,
      "ARCH_ROOT_PACKAGE_JSON_INVALID",
      "package.json",
    );
    if (rootManifest) {
      validateRootPnpmGraphConfiguration(collector, rootManifest);
      validateViteScriptConfiguration(collector, rootManifest, "package.json");
    }
  }
  if (existsSync(absoluteRepositoryRoot) && statSync(absoluteRepositoryRoot).isDirectory()) {
    const rootViteConfigs = readdirSync(absoluteRepositoryRoot, { withFileTypes: true })
      .filter((entry) => viteConfigPattern.test(entry.name))
      .map((entry) => entry.name);
    collector.assert(
      rootViteConfigs.length === 0,
      "ARCH_ROOT_VITE_CONFIG_FORBIDDEN",
      "repository-root",
      "Creator、Viewer 与 Connector 必须独立构建，根目录不得提供可改写全部 app 的 Vite 配置",
      [],
      sorted(rootViteConfigs),
    );
  }

  const workspacePaths = existsSync(absoluteRepositoryRoot)
    ? discoverWorkspacePaths(absoluteRepositoryRoot, collector)
    : [];
  collector.assert(
    workspacePaths.length > 0,
    "ARCH_NO_WORKSPACES",
    "workspace-discovery",
    "依赖检查不得对空 workspace 集合返回绿色",
    ">= 1",
    workspacePaths.length,
  );

  const workspaces = [];
  for (const workspacePath of workspacePaths) {
    const manifestPath = resolve(absoluteRepositoryRoot, workspacePath, "package.json");
    const manifest = readJson(
      manifestPath,
      collector,
      "ARCH_PACKAGE_JSON_INVALID",
      `${workspacePath}/package.json`,
    );
    if (!manifest) {
      continue;
    }

    const workspacePolicy = workspacePolicies.get(workspacePath);
    collector.assert(
      Boolean(workspacePolicy),
      "ARCH_WORKSPACE_NOT_IN_POLICY",
      workspacePath,
      "每个 workspace 必须先登记完整方向策略",
      sorted(workspacePolicies.keys()),
      workspacePath,
    );
    collector.assert(
      manifest.name === workspacePolicy?.name,
      "ARCH_WORKSPACE_NAME_MISMATCH",
      workspacePath,
      "workspace 路径与 @datapulse 包名必须匹配策略目录",
      workspacePolicy?.name ?? null,
      manifest.name ?? null,
    );
    validateViteScriptConfiguration(collector, manifest, `${workspacePath}/package.json`);

    const allDeclaredDependencies = new Map();
    const declaredDependencies = new Map();
    const allowedManifestDependencies = consumerManifestDependencyPolicies.get(
      workspacePolicy?.name,
    );
    const pureDeterministicManifestSectionPolicies =
      pureDeterministicManifestDependencyPolicies.get(workspacePolicy?.name);
    for (const section of dependencySections) {
      const dependencies = manifest[section] ?? {};
      for (const [dependencyName, version] of Object.entries(dependencies)) {
        collector.assert(
          !allDeclaredDependencies.has(dependencyName),
          "ARCH_DUPLICATE_DEPENDENCY_DECLARATION",
          `${workspacePath}/package.json`,
          "同一依赖不得跨多个依赖区重复声明",
          "single dependency section",
          dependencyName,
        );
        allDeclaredDependencies.set(dependencyName, { section, version });
        if (allowedManifestDependencies) {
          collector.assert(
            allowedManifestDependencies.has(dependencyName),
            "ARCH_BROWSER_CONSUMER_MANIFEST_DEPENDENCY_BOUNDARY",
            `${workspacePath}/package.json#${section}`,
            "高风险浏览器消费者 manifest 只能声明显式批准的依赖",
            sorted(allowedManifestDependencies),
            dependencyName,
          );
        }
        if (pureDeterministicManifestSectionPolicies) {
          const allowedDependencies =
            pureDeterministicManifestSectionPolicies.get(section) ?? new Set();
          collector.assert(
            allowedDependencies.has(dependencyName),
            "ARCH_PURE_RUNTIME_MANIFEST_DEPENDENCY_BOUNDARY",
            `${workspacePath}/package.json#${section}`,
            "纯确定性运行时每个 manifest 依赖区只能声明精确批准的运行时或构建期依赖",
            sorted(allowedDependencies),
            dependencyName,
          );
        }
        collector.assert(
          !dependencyUsesForbiddenAlias(dependencyName, version),
          "ARCH_DEPENDENCY_ALIAS_FORBIDDEN",
          `${workspacePath}/package.json`,
          "依赖不得用 link/file/portal/npm 或 workspace 包别名隐藏真实 package 所有者",
          "registry dependency or matching @datapulse workspace:*",
          { dependencyName, version },
        );
        if (!dependencyName.startsWith(workspaceNamespace)) {
          continue;
        }
        collector.assert(
          !declaredDependencies.has(dependencyName),
          "ARCH_DUPLICATE_WORKSPACE_DEPENDENCY",
          `${workspacePath}/package.json`,
          "同一 workspace 依赖不得跨多个依赖区重复声明",
          "single dependency section",
          dependencyName,
        );
        declaredDependencies.set(dependencyName, { section, version });
        collector.assert(
          version === "workspace:*",
          "ARCH_WORKSPACE_PROTOCOL_REQUIRED",
          `${workspacePath}/package.json`,
          "@datapulse 依赖必须使用 workspace: 协议",
          "workspace:*",
          version,
        );
      }
    }

    const exportedSubpaths = exportSubpaths(manifest.exports);
    collector.assert(
      !Object.hasOwn(manifest, "imports"),
      "ARCH_PACKAGE_IMPORTS_ALIAS_FORBIDDEN",
      `${workspacePath}/package.json`,
      "package.json imports 别名尚未纳入方向解析，必须 fail-closed 禁止",
      "imports field absent",
      manifest.imports ?? null,
    );
    collector.assert(
      !Object.hasOwn(manifest, "browser"),
      "ARCH_BROWSER_ALIAS_FORBIDDEN",
      `${workspacePath}/package.json`,
      "browser 字段可改写模块目标，必须先纳入方向解析才能使用",
      "browser field absent",
      manifest.browser ?? null,
    );
    collector.assert(
      !Object.hasOwn(manifest, "typesVersions"),
      "ARCH_TYPES_VERSIONS_ALIAS_FORBIDDEN",
      `${workspacePath}/package.json`,
      "typesVersions 可改写类型模块目标，必须先纳入方向解析才能使用",
      "typesVersions field absent",
      manifest.typesVersions ?? null,
    );
    for (const exportTarget of stringLeaves(manifest.exports)) {
      const workspaceDirectory = resolve(absoluteRepositoryRoot, workspacePath);
      const resolvedTarget = resolve(workspaceDirectory, exportTarget);
      const lexicallyOwned = exportTarget.startsWith("./") && isWithin(resolvedTarget, workspaceDirectory);
      collector.assert(
        lexicallyOwned,
        "ARCH_EXPORT_TARGET_ESCAPE",
        `${workspacePath}/package.json`,
        "package export target 必须是当前 workspace 内的显式相对路径",
        `${workspacePath}/...`,
        exportTarget,
      );
      const relativeExportTarget = normalizePath(relative(workspaceDirectory, resolvedTarget));
      collector.assert(
        !relativeExportTarget.split("/").includes("node_modules"),
        "ARCH_EXPORT_TARGET_NODE_MODULES",
        `${workspacePath}/package.json`,
        "package export target 不得委托给 node_modules 中的第三方所有者",
        "workspace-owned target",
        exportTarget,
      );
      if (lexicallyOwned) {
        const workspaceRealpath = existingRealpath(workspaceDirectory);
        const targetRealpath = existingRealpath(resolvedTarget);
        collector.assert(
          Boolean(
            workspaceRealpath &&
              targetRealpath &&
              isWithin(targetRealpath, workspaceRealpath),
          ),
          "ARCH_EXPORT_TARGET_REALPATH_ESCAPE",
          `${workspacePath}/package.json`,
          "package export target 的真实路径必须仍由生产者 workspace 所有",
          workspacePath,
          targetRealpath
            ? normalizePath(relative(absoluteRepositoryRoot, targetRealpath))
            : null,
        );
      }
    }
    if (workspacePath.startsWith("packages/")) {
      collector.assert(
        exportedSubpaths.size > 0,
        "ARCH_PACKAGE_EXPORTS_REQUIRED",
        `${workspacePath}/package.json`,
        "共享 package 必须提供显式 exports",
        ">= 1 explicit export",
        sorted(exportedSubpaths),
      );
      collector.assert(
        [...exportedSubpaths].every((subpath) => !subpath.includes("*")),
        "ARCH_WILDCARD_EXPORT_FORBIDDEN",
        `${workspacePath}/package.json`,
        "共享 package 禁止通配符 export",
        "explicit subpaths",
        sorted(exportedSubpaths),
      );
    }

    const workspaceName = typeof manifest.name === "string" && manifest.name.length > 0
      ? manifest.name
      : `__invalid_workspace_name__:${workspacePath}`;

    workspaces.push({
      absolutePath: resolve(absoluteRepositoryRoot, workspacePath),
      allDeclaredDependencies: new Set(allDeclaredDependencies.keys()),
      exportSubpaths: exportedSubpaths,
      manifest,
      name: workspaceName,
      path: workspacePath,
      policy: workspacePolicy,
      configuredSourceFiles: [],
      workspaceDependencies: new Set(declaredDependencies.keys()),
    });
  }

  const workspaceByName = new Map();
  for (const workspace of workspaces) {
    collector.assert(
      typeof workspace.name === "string" && !workspaceByName.has(workspace.name),
      "ARCH_DUPLICATE_WORKSPACE_NAME",
      workspace.path,
      "workspace 包名必须唯一",
      "unique package name",
      workspace.name ?? null,
    );
    if (typeof workspace.name === "string" && !workspaceByName.has(workspace.name)) {
      workspaceByName.set(workspace.name, workspace);
    }
  }

  const graph = new Map();
  let edgeCount = 0;
  for (const workspace of workspaces) {
    graph.set(workspace.name, new Set());
    const allowedDependencies = workspace.policy?.allowedWorkspaceDependencies ?? new Set();
    for (const dependencyName of sorted(workspace.workspaceDependencies)) {
      const targetWorkspace = workspaceByName.get(dependencyName);
      collector.assert(
        Boolean(targetWorkspace),
        "ARCH_WORKSPACE_DEPENDENCY_TARGET_MISSING",
        `${workspace.path}/package.json`,
        "@datapulse manifest 依赖必须指向当前 workspace",
        "registered workspace package",
        dependencyName,
      );
      if (!targetWorkspace) {
        continue;
      }
      edgeCount += 1;
      graph.get(workspace.name).add(dependencyName);
      collector.assert(
        allowedDependencies.has(dependencyName),
        dependencyFailureCode(workspace.path),
        `${workspace.path}/package.json`,
        "workspace manifest 依赖必须遵循目标方向",
        sorted(allowedDependencies),
        dependencyName,
      );
    }
  }

  const cycles = findCycles(graph);
  collector.assert(
    cycles.length === 0,
    "ARCH_DEPENDENCY_CYCLE",
    "workspace-graph",
    "workspace manifest 依赖图必须无循环",
    [],
    cycles,
  );

  const workspaceByAbsolutePath = new Map(
    workspaces.map((workspace) => [workspace.absolutePath, workspace]),
  );
  for (const workspace of workspaces) {
    const tsconfigPath = resolve(workspace.absolutePath, "tsconfig.json");
    const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    collector.assert(
      !readResult.error,
      "ARCH_TSCONFIG_INVALID",
      `${workspace.path}/tsconfig.json`,
      "TypeScript 配置必须存在且可解析",
      "valid tsconfig",
      readResult.error?.code ?? null,
    );
    if (readResult.error) {
      continue;
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      readResult.config,
      ts.sys,
      workspace.absolutePath,
      undefined,
      tsconfigPath,
    );
    collector.assert(
      parsedConfig.errors.length === 0,
      "ARCH_TSCONFIG_EFFECTIVE_INVALID",
      `${workspace.path}/tsconfig.json`,
      "TypeScript 有效配置必须无解析错误",
      [],
      parsedConfig.errors.map((diagnostic) => diagnostic.code),
    );
    collector.assert(
      !parsedConfig.options.baseUrl &&
        !parsedConfig.options.rootDirs &&
        Object.keys(parsedConfig.options.paths ?? {}).length === 0,
      "ARCH_TSCONFIG_ALIAS_FORBIDDEN",
      `${workspace.path}/tsconfig.json`,
      "baseUrl、rootDirs 与 paths 可绕过 package seam，纳入解析前必须禁止",
      { baseUrl: null, rootDirs: null, paths: {} },
      {
        baseUrl: parsedConfig.options.baseUrl ?? null,
        rootDirs: parsedConfig.options.rootDirs ?? null,
        paths: parsedConfig.options.paths ?? {},
      },
    );
    for (const configuredSourcePath of parsedConfig.fileNames) {
      collector.assert(
        isWithin(configuredSourcePath, workspace.absolutePath),
        "ARCH_TSCONFIG_INPUT_ESCAPE",
        `${workspace.path}/tsconfig.json`,
        "TypeScript 输入不得逃逸当前 workspace",
        workspace.path,
        normalizePath(relative(absoluteRepositoryRoot, configuredSourcePath)),
      );
      if (isWithin(configuredSourcePath, workspace.absolutePath)) {
        workspace.configuredSourceFiles.push(configuredSourcePath);
      }
    }

    const referenceNames = new Set();
    const referenceDefinitions = readResult.config.references ?? [];
    collector.assert(
      Array.isArray(referenceDefinitions),
      "ARCH_TSCONFIG_REFERENCES_INVALID",
      `${workspace.path}/tsconfig.json`,
      "TypeScript project references 必须是数组",
      "array",
      referenceDefinitions === null ? null : typeof referenceDefinitions,
    );
    for (const referenceDefinition of Array.isArray(referenceDefinitions)
      ? referenceDefinitions
      : []) {
      const referencePath = referenceDefinition?.path;
      const targetPath = typeof referencePath === "string"
        ? resolve(workspace.absolutePath, referencePath)
        : null;
      const targetWorkspace = targetPath ? workspaceByAbsolutePath.get(targetPath) : null;
      collector.assert(
        Boolean(targetWorkspace),
        "ARCH_TSCONFIG_REFERENCE_TARGET",
        `${workspace.path}/tsconfig.json`,
        "project reference 必须指向已登记 workspace 根目录",
        "registered workspace path",
        referencePath ?? null,
      );
      if (targetWorkspace) {
        referenceNames.add(targetWorkspace.name);
      }
    }

    const expectedReferences = sorted(
      [...workspace.workspaceDependencies].filter((dependency) => workspaceByName.has(dependency)),
    );
    const actualReferences = sorted(referenceNames);
    collector.assert(
      jsonEqual(actualReferences, expectedReferences),
      "ARCH_TSCONFIG_REFERENCE_MISMATCH",
      `${workspace.path}/tsconfig.json`,
      "project references 必须与直接 workspace manifest 依赖精确一致",
      expectedReferences,
      actualReferences,
    );
  }

  let sourceFileCount = 0;
  let importCount = 0;
  for (const workspace of workspaces) {
    const sourceResult = validateSourceImports({
      collector,
      repositoryRoot: absoluteRepositoryRoot,
      workspace,
      workspaceByName,
    });
    sourceFileCount += sourceResult.sourceFileCount;
    importCount += sourceResult.importCount;
  }

  const collected = collector.result();
  return {
    check: "dependency-boundaries",
    result: collected.failures.length === 0 ? "passed" : "failed",
    platform: process.platform,
    architecture: process.arch,
    policy: {
      registeredWorkspaces: workspacePolicies.size,
      instantiatedWorkspaces: workspaces.length,
    },
    graph: {
      nodes: workspaces.length,
      edges: edgeCount,
      cycles: cycles.length,
    },
    sources: {
      files: sourceFileCount,
      moduleSpecifiers: importCount,
    },
    assertions: collected.assertions,
    failures: collected.failures,
  };
}

export function analyzeDependencyBoundaries(input) {
  try {
    return analyzeDependencyBoundariesInternal(input ?? {});
  } catch (error) {
    return {
      check: "dependency-boundaries",
      result: "failed",
      platform: process.platform,
      architecture: process.arch,
      policy: {
        registeredWorkspaces: workspacePolicies.size,
        instantiatedWorkspaces: 0,
      },
      graph: { nodes: 0, edges: 0, cycles: 0 },
      sources: { files: 0, moduleSpecifiers: 0 },
      assertions: { executed: 1, passed: 0, failed: 1, skipped: 0 },
      failures: [
        {
          code: "ARCH_ANALYZER_EXCEPTION",
          subject: "repository-input",
          message: "无法安全解析仓库输入时必须返回结构化失败",
          expected: "statically auditable repository",
          actual: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
