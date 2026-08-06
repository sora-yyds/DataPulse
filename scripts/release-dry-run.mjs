
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const DRY_RUN_VERSION = "0.0.0-m0-dry-run";
export const STAGING_ROOT = resolve(repositoryRoot, "release", "dry-run");
export const WORKSPACE_SOURCE_DIRECTORIES = ["apps", "packages", "services"];
export const FORBIDDEN_ENTRY_NAMES = new Set([
  "node_modules",
  ".turbo",
  "package-lock.json",
]);
export const EXCLUDED_FILE_SUFFIXES = [".tsbuildinfo"];

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function workspaceDirectories(root) {
  const result = [];
  for (const directory of WORKSPACE_SOURCE_DIRECTORIES) {
    const parent = join(root, directory);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent).sort()) {
      const candidate = join(parent, entry);
      if (!statSync(candidate).isDirectory()) continue;
      if (!existsSync(join(candidate, "package.json"))) continue;
      result.push({
        relativePath: `${directory}/${entry}`,
        absolutePath: candidate,
        packageName: readJsonFile(join(candidate, "package.json")).name ?? null,
      });
    }
  }
  result.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  return result;
}

export function collectReleaseFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      if (FORBIDDEN_ENTRY_NAMES.has(entry)) continue;
      const absolute = join(current, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      if (EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;
      files.push(absolute);
    }
  };
  walk(directory);
  files.sort((left, right) => left.localeCompare(right, "en"));
  return files;
}

export function stageRelease(root, version) {
  const targetRoot = join(STAGING_ROOT, version);
  rmSync(targetRoot, { recursive: true, force: true });
  const workspaces = workspaceDirectories(root);
  if (workspaces.length === 0) {
    throw new Error("RELEASE_WORKSPACES_EMPTY: no workspace found");
  }
  const manifest = {
    schemaVersion: "1.0.0",
    version,
    generatedBy: "DataPulse release-dry-run",
    workspaces: [],
  };
  const stagedFiles = [];
  for (const workspace of workspaces) {
    const distPath = join(workspace.absolutePath, "dist");
    if (!existsSync(distPath)) {
      throw new Error(`RELEASE_MISSING_DIST: ${workspace.relativePath}`);
    }
    const sourceFiles = collectReleaseFiles(distPath);
    if (sourceFiles.length === 0) {
      throw new Error(`RELEASE_EMPTY_DIST: ${workspace.relativePath}`);
    }
    const stagedWorkspace = join(targetRoot, ...workspace.relativePath.split("/"));
    let bytes = 0;
    const workspaceFiles = [];
    for (const sourceFile of sourceFiles) {
      const relativeInDist = relative(distPath, sourceFile).split(sep).join("/");
      const stagedPath = `${workspace.relativePath}/${relativeInDist}`;
      const target = join(stagedWorkspace, ...relativeInDist.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      const content = readFileSync(sourceFile);
      writeFileSync(target, content);
      bytes += content.byteLength;
      workspaceFiles.push(stagedPath);
    }
    workspaceFiles.sort((left, right) => left.localeCompare(right, "en"));
    manifest.workspaces.push({
      relativePath: workspace.relativePath,
      packageName: workspace.packageName,
      files: workspaceFiles.length,
      bytes,
    });
    stagedFiles.push(...workspaceFiles);
  }
  stagedFiles.sort((left, right) => left.localeCompare(right, "en"));
  writeJsonFile(join(targetRoot, "manifest.json"), manifest);
  return { targetRoot, manifest, stagedFiles };
}

export function writeChecksums(targetRoot, stagedFiles) {
  const lines = stagedFiles
    .map((relativePath) => {
      const absolute = join(targetRoot, ...relativePath.split("/"));
      return `${sha256File(absolute)}  ${relativePath}`;
    })
    .sort((left, right) => left.localeCompare(right, "en"));
  const manifestPath = join(targetRoot, "manifest.json");
  const sbomPath = join(targetRoot, "sbom.spdx.json");
  const payloadLines = [];
  if (existsSync(manifestPath)) {
    payloadLines.push(`${sha256File(manifestPath)}  manifest.json`);
  }
  if (existsSync(sbomPath)) {
    payloadLines.push(`${sha256File(sbomPath)}  sbom.spdx.json`);
  }
  const content = [...lines, ...payloadLines].sort().join("\n") + "\n";
  writeFileSync(join(targetRoot, "SHA256SUMS.txt"), content, "utf8");
  return content;
}

export function resolvePackageManagerLauncher() {
  const pathKey = Object.keys(process.env).find(
    (key) => key.toLowerCase() === "path",
  );
  const candidates = [
    dirname(process.execPath),
    ...(pathKey ? (process.env[pathKey] ?? "").split(delimiter) : []),
  ]
    .map((directory) => directory.trim().replace(/^"|"$/gu, ""))
    .filter((directory) => directory.length > 0);
  const seen = new Set();
  const directories = candidates.filter((directory) => {
    const identity = process.platform === "win32" ? directory.toLowerCase() : directory;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  const findExecutable = (names) => {
    for (const directory of directories) {
      for (const name of names) {
        const candidate = resolve(directory, name);
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // not found in this directory
        }
      }
    }
    return null;
  };
  if (process.platform === "win32") {
    const corepackShim = findExecutable(["corepack.cmd", "corepack"]);
    const shim = corepackShim ?? findExecutable(["pnpm.cmd", "pnpm"]);
    if (shim === null) {
      return { error: "RELEASE_PACKAGE_MANAGER_NOT_FOUND", executable: null, corepack: false };
    }
    return {
      error: null,
      executable: process.env.ComSpec ?? "cmd.exe",
      arguments: ["/d", "/s", "/c", "call", shim, ...(corepackShim !== null ? ["pnpm"] : [])],
      corepack: corepackShim !== null,
    };
  }
  const corepackExecutable = findExecutable(["corepack"]);
  const executable = corepackExecutable ?? findExecutable(["pnpm"]);
  if (executable === null) {
    return { error: "RELEASE_PACKAGE_MANAGER_NOT_FOUND", executable: null, corepack: false };
  }
  return {
    error: null,
    executable,
    arguments: corepackExecutable !== null ? ["pnpm"] : [],
    corepack: corepackExecutable !== null,
  };
}

export function runPnpm(root, args) {
  const launcher = resolvePackageManagerLauncher();
  if (launcher.error !== null || launcher.executable === null) {
    throw new Error(launcher.error ?? "RELEASE_PACKAGE_MANAGER_UNAVAILABLE");
  }
  const execution = spawnSync(launcher.executable, [...launcher.arguments, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: false,
    timeout: 300_000,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (execution.error !== undefined) {
    throw new Error(`RELEASE_PNPM_SPAWN_FAILED: ${execution.error.message}`);
  }
  return execution;
}

export function loadDependencies(root) {
  const execution = runPnpm(root, ["licenses", "list", "--json"]);
  if (execution.status !== 0) {
    throw new Error(
      `RELEASE_LICENSES_FAILED: ${execution.status} ${(execution.stderr ?? "").slice(-2000)}`,
    );
  }
  const grouped = JSON.parse(execution.stdout);
  const dependencies = [];
  for (const [license, entries] of Object.entries(grouped)) {
    for (const entry of entries) {
      for (const version of entry.versions ?? []) {
        dependencies.push({
          name: entry.name,
          version,
          license: license === "Unknown" ? "NOASSERTION" : (license ?? "NOASSERTION"),
          supplier: entry.author ?? null,
          homepage: entry.homepage ?? null,
        });
      }
    }
  }
  dependencies.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "en") ||
      left.version.localeCompare(right.version, "en"),
  );
  return dependencies;
}

export function purlForNpm(name, version) {
  const encoded = encodeURIComponent(name).replace(/%2F/gu, "/");
  return `pkg:npm/${encoded}@${version}`;
}

export function spdxDocument({ version, stagedFiles, workspaces, dependencies }) {
  const workspacePackages = workspaces.map((workspace, index) => ({
    SPDXID: `SPDXRef-Package-WS-${String(index + 1).padStart(2, "0")}`,
    name: workspace.packageName ?? workspace.relativePath,
    versionInfo: version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: true,
    licenseConcluded: "AGPL-3.0-only",
    licenseDeclared: "AGPL-3.0-only",
    copyrightText: "NOASSERTION",
    attributionTexts: [workspace.relativePath],
  }));
  const fileRecords = stagedFiles.map((relativePath, index) => ({
    SPDXID: `SPDXRef-File-${String(index + 1).padStart(4, "0")}`,
    fileName: relativePath,
    checksums: [
      {
        algorithm: "SHA256",
        checksumValue: sha256File(join(STAGING_ROOT, version, ...relativePath.split("/"))),
      },
    ],
  }));
  const dependencyPackages = dependencies.map((dependency, index) => ({
    SPDXID: `SPDXRef-Package-DEP-${String(index + 1).padStart(4, "0")}`,
    name: dependency.name,
    versionInfo: dependency.version,
    downloadLocation: dependency.homepage ?? "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: dependency.license === "NOASSERTION" ? "NOASSERTION" : dependency.license,
    licenseDeclared: dependency.license === "NOASSERTION" ? "NOASSERTION" : dependency.license,
    supplier: dependency.supplier ? `Person: ${dependency.supplier}` : "NOASSERTION",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: purlForNpm(dependency.name, dependency.version),
      },
    ],
  }));
  const contentHash = sha256Text(
    JSON.stringify({
      version,
      files: stagedFiles.map((path) => path),
      dependencies: dependencies.map((dependency) => `${dependency.name}@${dependency.version}`),
    }),
  );
  const created = "2026-08-06T00:00:00Z";
  const relationships = [
    {
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: "SPDXRef-Package-ROOT",
    },
    ...workspacePackages.map((pkg) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "CONTAINS",
      relatedSpdxElement: pkg.SPDXID,
    })),
    ...dependencyPackages.map((pkg) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: pkg.SPDXID,
    })),
  ];
  for (let index = 0; index < workspaces.length; index += 1) {
    const prefix = `${workspaces[index].relativePath}/`;
    const workspaceFileIds = fileRecords
      .filter((file) => file.fileName.startsWith(prefix))
      .map((file) => file.SPDXID);
    for (const fileId of workspaceFileIds) {
      relationships.push({
        spdxElementId: workspacePackages[index].SPDXID,
        relationshipType: "CONTAINS",
        relatedSpdxElement: fileId,
      });
    }
  }
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `DataPulse release dry-run SBOM ${version}`,
    documentNamespace: `https://datapulse.invalid/sbom/dry-run/${version}#${contentHash}`,
    creationInfo: {
      created,
      creators: ["Tool: DataPulse release-dry-run 1.0.0"],
    },
    packages: [
      {
        SPDXID: "SPDXRef-Package-ROOT",
        name: "datapulse-monorepo",
        versionInfo: version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: false,
        licenseConcluded: "AGPL-3.0-only",
        licenseDeclared: "AGPL-3.0-only",
      },
      ...workspacePackages,
      ...dependencyPackages,
    ],
    files: fileRecords,
    relationships,
  };
}

export function generateReleaseDryRun(root, version = DRY_RUN_VERSION) {
  const { targetRoot, manifest, stagedFiles } = stageRelease(root, version);
  const dependencies = loadDependencies(root);
  const document = spdxDocument({ version, stagedFiles, workspaces: manifest.workspaces, dependencies });
  writeJsonFile(join(targetRoot, "sbom.spdx.json"), document);
  const checksums = writeChecksums(targetRoot, stagedFiles);
  return {
    version,
    targetRoot,
    workspaceCount: manifest.workspaces.length,
    fileCount: stagedFiles.length,
    dependencyCount: dependencies.length,
    stagedBytes: manifest.workspaces.reduce((sum, workspace) => sum + workspace.bytes, 0),
    checksumLines: checksums.trim().split("\n").length,
    sbomPackages: document.packages.length,
  };
}

function runCli() {
  const unknownArguments = process.argv.slice(2).filter((argument) => !argument.startsWith("--version="));
  if (unknownArguments.length > 0) {
    throw new Error("RELEASE_DRY_RUN_ARGUMENT_INVALID");
  }
  const versionArgument = process.argv.find((argument) => argument.startsWith("--version="));
  const version = versionArgument ? versionArgument.slice("--version=".length) : DRY_RUN_VERSION;
  const result = generateReleaseDryRun(repositoryRoot, version);
  console.log(JSON.stringify({ check: "release-dry-run", result: "passed", ...result }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          check: "release-dry-run",
          result: "failed",
          code: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
