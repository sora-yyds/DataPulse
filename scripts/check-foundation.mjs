import {
  assertionsFromRun,
  runRootScript,
} from "./m0-gates.mjs";

const checks = [
  { scriptKey: "check:toolchain:root", summaryCheck: "toolchain" },
  { scriptKey: "check:workspace", summaryCheck: "workspace-foundation" },
  { scriptKey: "check:governance", summaryCheck: "repository-governance" },
];
const assertions = [];
const runNonce = process.env.DATAPULSE_RUN_NONCE ?? null;
const gateId = process.env.DATAPULSE_GATE_ID ?? null;

for (const { scriptKey, summaryCheck } of checks) {
  const run = runRootScript(scriptKey);
  const childAssertions = assertionsFromRun(run);
  const passed =
    run.status === 0 &&
    run.summary?.schemaVersion === "1.0.0" &&
    run.summary?.kind === "datapulse-root-check-summary" &&
    run.summary?.check === summaryCheck &&
    run.summary?.result === "passed" &&
    run.summary?.gateId === gateId &&
    run.summary?.runNonce === runNonce &&
    childAssertions !== null &&
    childAssertions.executed >= 1 &&
    childAssertions.passed === childAssertions.executed &&
    childAssertions.failed === 0 &&
    childAssertions.skipped === 0;

  assertions.push({
    name: `根脚本 ${scriptKey}`,
    passed,
    expected: "exit=0 且结构化断言无失败/跳过",
    actual: {
      exitCode: run.status,
      signal: run.signal,
      error: run.error,
      check: run.summary?.check,
      result: run.summary?.result,
      gateId: run.summary?.gateId,
      runNonce: run.summary?.runNonce,
      assertions: childAssertions,
      stderr: passed ? "" : run.stderr.slice(-4000),
      stdoutTail: passed ? "" : run.stdout.slice(-4000),
    },
  });
}

const failures = assertions.filter(({ passed }) => !passed);
const summary = {
  schemaVersion: "1.0.0",
  kind: "datapulse-root-check-summary",
  check: "repository-foundation",
  gateId,
  runNonce,
  result: failures.length === 0 ? "passed" : "failed",
  assertions: {
    executed: assertions.length,
    passed: assertions.length - failures.length,
    failed: failures.length,
    skipped: 0,
  },
  failures: failures.map(({ name, expected, actual }) => ({ name, expected, actual })),
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
