import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const testScripts = [
  "test:unit",
  "test:component",
  "test:storybook",
  "test:storage",
  "test:worker-csp",
  "test:e2e",
  "test:a11y",
  "test:visual",
];
const childTimeoutMilliseconds = 600_000;
const childOutputTailLength = 4_000;

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathDirectories() {
  const pathKey = Object.keys(process.env).find(
    (key) => key.toLowerCase() === "path",
  );
  const rawDirectories = (pathKey ? process.env[pathKey] : "")?.split(delimiter) ?? [];
  const candidates = [dirname(process.execPath), ...rawDirectories]
    .map((directory) => directory.trim().replace(/^"|"$/gu, ""))
    .filter((directory) => directory.length > 0);
  const seen = new Set();

  return candidates.filter((directory) => {
    const identity = process.platform === "win32" ? directory.toLowerCase() : directory;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function findExecutable(names) {
  for (const directory of pathDirectories()) {
    for (const name of names) {
      const candidate = resolve(directory, name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function resolvePackageManagerLauncher() {
  if (process.platform === "win32") {
    const corepackShim = findExecutable(["corepack.cmd"]);
    const pnpmShim = findExecutable(["pnpm.cmd"]);
    const shim = corepackShim ?? pnpmShim;
    if (shim === null) {
      return {
        error: "TEST_RUNNER_PACKAGE_MANAGER_NOT_FOUND",
        executable: null,
        prefixArguments: [],
        name: null,
      };
    }

    return {
      error: null,
      executable: process.env.ComSpec ?? "cmd.exe",
      prefixArguments: [
        "/d",
        "/s",
        "/c",
        "call",
        shim,
        ...(corepackShim !== null ? ["pnpm"] : []),
        "run",
      ],
      name: corepackShim !== null ? "corepack-pnpm" : "pnpm",
    };
  }

  const corepackExecutable = findExecutable(["corepack"]);
  const pnpmExecutable = findExecutable(["pnpm"]);
  if (corepackExecutable !== null) {
    return {
      error: null,
      executable: corepackExecutable,
      prefixArguments: ["pnpm", "run"],
      name: "corepack-pnpm",
    };
  }
  if (pnpmExecutable !== null) {
    return {
      error: null,
      executable: pnpmExecutable,
      prefixArguments: ["run"],
      name: "pnpm",
    };
  }
  return {
    error: "TEST_RUNNER_PACKAGE_MANAGER_NOT_FOUND",
    executable: null,
    prefixArguments: [],
    name: null,
  };
}

function readRootScripts() {
  try {
    const rootPackage = JSON.parse(
      readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
    );
    if (
      rootPackage === null ||
      typeof rootPackage !== "object" ||
      Array.isArray(rootPackage) ||
      rootPackage.scripts === null ||
      typeof rootPackage.scripts !== "object" ||
      Array.isArray(rootPackage.scripts)
    ) {
      return { error: "TEST_RUNNER_ROOT_SCRIPTS_INVALID", scripts: null };
    }
    return { error: null, scripts: rootPackage.scripts };
  } catch (error) {
    return {
      error: `TEST_RUNNER_ROOT_PACKAGE_INVALID: ${
        error instanceof Error ? error.message : String(error)
      }`,
      scripts: null,
    };
  }
}

function outputTail(value) {
  return String(value ?? "")
    .replace(/\u001b\[[0-9;]*m/gu, "")
    .slice(-childOutputTailLength);
}

function failedRun(scriptKey, code, error) {
  return {
    scriptKey,
    result: "failed",
    exitCode: null,
    signal: null,
    error,
    failureCode: code,
    stdoutTail: "",
    stderrTail: "",
  };
}

function runTestScript(scriptKey, rootScripts, launcher) {
  const rootCommand = rootScripts?.[scriptKey];
  if (typeof rootCommand !== "string" || rootCommand.trim().length === 0) {
    return failedRun(
      scriptKey,
      "TEST_RUNNER_ROOT_SCRIPT_MISSING",
      `package.json#scripts.${scriptKey} must be a non-empty command`,
    );
  }
  if (launcher.executable === null || launcher.error !== null) {
    return failedRun(
      scriptKey,
      "TEST_RUNNER_PACKAGE_MANAGER_UNAVAILABLE",
      launcher.error ?? "package manager launcher is unavailable",
    );
  }

  let execution;
  try {
    execution = spawnSync(
      launcher.executable,
      [...launcher.prefixArguments, scriptKey],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: process.env,
        shell: false,
        timeout: childTimeoutMilliseconds,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
    );
  } catch (error) {
    return failedRun(
      scriptKey,
      "TEST_RUNNER_CHILD_EXCEPTION",
      error instanceof Error ? error.message : String(error),
    );
  }

  const error = execution.error instanceof Error ? execution.error.message : null;
  const passed = execution.status === 0 && execution.signal === null && error === null;
  return {
    scriptKey,
    result: passed ? "passed" : "failed",
    exitCode: execution.status,
    signal: execution.signal,
    error,
    failureCode: passed ? null : "TEST_RUNNER_CHILD_FAILED",
    stdoutTail: passed ? "" : outputTail(execution.stdout),
    stderrTail: passed ? "" : outputTail(execution.stderr),
  };
}

function createSummary(runs, launcherName) {
  const failures = runs.filter(({ result }) => result !== "passed");
  return {
    schemaVersion: "1.0.0",
    kind: "datapulse-root-check-summary",
    check: "test-runners",
    gateId: process.env.DATAPULSE_GATE_ID ?? null,
    runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
    result: failures.length === 0 ? "passed" : "failed",
    platform: process.platform,
    architecture: process.arch,
    launcher: launcherName,
    scripts: runs.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...run }) => run),
    assertions: {
      executed: runs.length,
      passed: runs.length - failures.length,
      failed: failures.length,
      skipped: 0,
    },
    failures: failures.map(
      ({ scriptKey, failureCode, exitCode, signal, error, stdoutTail, stderrTail }) => ({
        code: failureCode,
        subject: scriptKey,
        message: "根测试脚本必须真实启动并以状态 0 完成",
        expected: { exitCode: 0, signal: null, error: null },
        actual: { exitCode, signal, error, stdoutTail, stderrTail },
      }),
    ),
  };
}

function emergencySummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  const runs = testScripts.map((scriptKey) =>
    failedRun(scriptKey, "TEST_RUNNER_UNEXPECTED_ERROR", message),
  );
  return createSummary(runs, null);
}

try {
  const rootScripts = readRootScripts();
  const launcher = resolvePackageManagerLauncher();
  const runs = testScripts.map((scriptKey) =>
    rootScripts.scripts === null
      ? failedRun(
          scriptKey,
          "TEST_RUNNER_ROOT_PACKAGE_UNAVAILABLE",
          rootScripts.error ?? "root scripts are unavailable",
        )
      : runTestScript(scriptKey, rootScripts.scripts, launcher),
  );
  const summary = createSummary(runs, launcher.name);
  console.log(JSON.stringify(summary));
  if (summary.result !== "passed") {
    process.exitCode = 1;
  }
} catch (error) {
  const summary = emergencySummary(error);
  console.log(JSON.stringify(summary));
  process.exitCode = 1;
}
