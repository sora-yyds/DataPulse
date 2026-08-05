import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const EXPECTED_ACTION_SHA = "48f256284bd46cdaab1048c3721360e808335d50";

const REQUIRED_CODEOWNER_PATTERNS = [
  "*",
  "/docs/adr/",
  "/docs/PRD.md",
  "/docs/ARCHITECTURE.md",
  "/CONTEXT.md",
  "/packages/story-schema/",
  "/packages/story-migrations/",
  "/packages/crypto/",
  "/packages/package-codec/",
  "/packages/local-storage/",
  "/packages/evidence/",
  "/services/share-api/",
  "/services/telemetry-ingest/",
  "/apps/custom-connector/",
  "/infra/",
  "/services/",
  "/.github/",
  "/AGENTS.md",
  "/DESIGN.md",
];

const REQUIRED_TEMPLATE_MARKERS = [
  "## 关联任务与事实源",
  "PRD／SEC 需求 ID",
  "当前有效 ADR",
  "## 结果与范围",
  "## 验证",
  "未运行项、原因与风险",
  "## Changeset",
  ".changeset/*.md",
  "## 同步检查",
  "## 安全、隐私与数据",
];

const REQUIRED_POLICY_MARKERS = [
  "permissions: {}",
  "pull_request_target",
  "完整 40 位提交 SHA",
  "Fork PR",
  "付费专有 SaaS",
  "直接插值到 `run` shell",
  "稳定且唯一的 workflow／job 名",
  "timeout-minutes",
];

function readText(relativePath) {
  return readFileSync(join(REPOSITORY_ROOT, ...relativePath.split("/")), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function loadSnapshot() {
  const workflowDirectory = join(REPOSITORY_ROOT, ".github", "workflows");
  const workflows = Object.fromEntries(
    readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/i.test(name))
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((name) => [name, readText(`.github/workflows/${name}`)]),
  );

  return {
    rootPackage: readText("package.json"),
    changesetConfig: readText(".changeset/config.json"),
    changesetReadme: readText(".changeset/README.md"),
    codeowners: readText(".github/CODEOWNERS"),
    pullRequestTemplate: readText(".github/pull_request_template.md"),
    workflowPolicy: readText("docs/governance/github-workflow-policy.md"),
    workflows,
  };
}

function parseCodeowners(source) {
  const rules = new Map();
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [pattern, ...owners] = trimmed.split(/\s+/u);
    if (pattern) rules.set(pattern, owners);
  }
  return rules;
}

function validateSnapshot(snapshot) {
  const assertions = [];
  const record = (name, passed, expected, actual) => {
    assertions.push({ name, passed, expected, actual });
  };

  let rootPackage;
  try {
    rootPackage = JSON.parse(snapshot.rootPackage);
    record("根 package.json 是有效 JSON", true, true, true);
  } catch (error) {
    record("根 package.json 是有效 JSON", false, "有效 JSON", error.message);
  }

  if (rootPackage) {
    record(
      "Changesets CLI 根依赖精确固定",
      rootPackage.devDependencies?.["@changesets/cli"] === "2.31.1",
      "2.31.1",
      rootPackage.devDependencies?.["@changesets/cli"] ?? null,
    );
    record(
      "Changesets 根命令使用固定本地二进制",
      rootPackage.scripts?.changeset === "changeset",
      "changeset",
      rootPackage.scripts?.changeset ?? null,
    );
  }

  let changesetConfig;
  try {
    changesetConfig = JSON.parse(snapshot.changesetConfig);
    record("Changesets 配置是有效 JSON", true, true, true);
  } catch (error) {
    record("Changesets 配置是有效 JSON", false, "有效 JSON", error.message);
  }

  if (changesetConfig) {
    record(
      "Changesets Schema 固定到配置版本",
      changesetConfig.$schema === "https://unpkg.com/@changesets/config@3.1.4/schema.json",
      "https://unpkg.com/@changesets/config@3.1.4/schema.json",
      changesetConfig.$schema,
    );
    record(
      "Changesets changelog 使用本地 CLI",
      changesetConfig.changelog === "@changesets/cli/changelog",
      "@changesets/cli/changelog",
      changesetConfig.changelog,
    );
    record("Changesets access 保持 restricted", changesetConfig.access === "restricted", "restricted", changesetConfig.access);
    record("Changesets 基线分支固定", changesetConfig.baseBranch === "main", "main", changesetConfig.baseBranch);
    record("Changesets 不自动提交", changesetConfig.commit === false, false, changesetConfig.commit);
    record(
      "Changesets 内部依赖使用 patch",
      changesetConfig.updateInternalDependencies === "patch",
      "patch",
      changesetConfig.updateInternalDependencies,
    );
    record(
      "Changesets 只提升 workspace 协议依赖",
      changesetConfig.bumpVersionsWithWorkspaceProtocolOnly === true,
      true,
      changesetConfig.bumpVersionsWithWorkspaceProtocolOnly,
    );
    record(
      "Changesets 私有包参与版本化",
      changesetConfig.privatePackages?.version === true,
      true,
      changesetConfig.privatePackages?.version,
    );
    record(
      "Changesets 私有包不创建 tag",
      changesetConfig.privatePackages?.tag === false,
      false,
      changesetConfig.privatePackages?.tag,
    );
    for (const field of ["fixed", "linked", "ignore"]) {
      record(`Changesets ${field} 使用显式数组`, Array.isArray(changesetConfig[field]), "array", typeof changesetConfig[field]);
    }
  }

  for (const marker of ["面向用户", "不得添加空 Changeset", "corepack pnpm changeset", "privatePackages"]) {
    record(
      `Changesets README 包含 ${marker}`,
      snapshot.changesetReadme.includes(marker),
      marker,
      snapshot.changesetReadme.includes(marker),
    );
  }

  const codeownerRules = parseCodeowners(snapshot.codeowners);
  for (const pattern of REQUIRED_CODEOWNER_PATTERNS) {
    const owners = codeownerRules.get(pattern) ?? [];
    record(
      `CODEOWNERS 覆盖 ${pattern}`,
      owners.includes("@sora-yyds"),
      "@sora-yyds",
      owners,
    );
  }
  record(
    "CODEOWNERS 不冒充第二维护者",
    !snapshot.codeowners.includes("@placeholder") && !snapshot.codeowners.includes("@second-maintainer"),
    "不含占位 owner",
    "未发现占位 owner",
  );

  for (const marker of REQUIRED_TEMPLATE_MARKERS) {
    record(
      `PR 模板包含 ${marker}`,
      snapshot.pullRequestTemplate.includes(marker),
      marker,
      snapshot.pullRequestTemplate.includes(marker),
    );
  }

  for (const marker of REQUIRED_POLICY_MARKERS) {
    record(
      `workflow policy 包含 ${marker}`,
      snapshot.workflowPolicy.includes(marker),
      marker,
      snapshot.workflowPolicy.includes(marker),
    );
  }

  const workflowEntries = Object.entries(snapshot.workflows);
  record("至少存在一个真实 workflow", workflowEntries.length >= 1, ">=1", workflowEntries.length);
  for (const [name, source] of workflowEntries) {
    record(
      `workflow 禁止 pull_request_target (${name})`,
      !/(?:^|\n)\s*pull_request_target\s*:/u.test(source),
      false,
      /(?:^|\n)\s*pull_request_target\s*:/u.test(source),
    );
    const remoteActions = [...source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gmu)]
      .map((match) => match[1])
      .filter((reference) => !reference.startsWith("./"));
    for (const reference of remoteActions) {
      record(
        `所有远程 Action 使用完整提交 SHA (${name})`,
        /^[^@\s]+@[a-f0-9]{40}$/u.test(reference),
        "owner/action@40-char-sha",
        reference,
      );
    }
  }

  const titleWorkflow = snapshot.workflows["pr-title.yml"] ?? "";
  record(
    "PR 标题 workflow 使用 pull_request",
    /(?:^|\n)on:\n\s{2}pull_request:\n/u.test(titleWorkflow),
    "pull_request",
    /(?:^|\n)on:\n\s{2}pull_request:\n/u.test(titleWorkflow),
  );
  record(
    "PR 标题 workflow 禁止 pull_request_target",
    !titleWorkflow.includes("pull_request_target"),
    false,
    titleWorkflow.includes("pull_request_target"),
  );
  record(
    "PR 标题 workflow 只授予 pull-requests: read",
    /(?:^|\n)permissions:\n\s{2}pull-requests:\s*read\n\n/u.test(titleWorkflow) &&
      !/(?:^|\n)\s+[a-z-]+:\s*write\s*$/gmu.test(titleWorkflow),
    "pull-requests: read; no write",
    "checked",
  );
  record(
    "PR 标题 workflow Action 固定到审核 SHA",
    titleWorkflow.includes(`amannn/action-semantic-pull-request@${EXPECTED_ACTION_SHA}`),
    EXPECTED_ACTION_SHA,
    titleWorkflow.match(/amannn\/action-semantic-pull-request@([^\s#]+)/u)?.[1] ?? null,
  );
  record(
    "PR 标题 workflow 使用受限内建 token",
    titleWorkflow.includes("GITHUB_TOKEN: ${{ github.token }}") && !titleWorkflow.includes("secrets."),
    "github.token without secrets.*",
    "checked",
  );
  record(
    "PR 标题 workflow check 名稳定",
    (titleWorkflow.match(/name:\s*governance \/ conventional-pr-title/gmu)?.length ?? 0) >= 2,
    ">=2",
    titleWorkflow.match(/name:\s*governance \/ conventional-pr-title/gmu)?.length ?? 0,
  );
  record(
    "PR 标题 workflow 有有限超时",
    /timeout-minutes:\s*[1-5]\s*$/mu.test(titleWorkflow),
    "1..5 minutes",
    titleWorkflow.match(/timeout-minutes:\s*([^\s]+)/u)?.[1] ?? null,
  );
  record(
    "PR 标题 workflow 并发键不使用不可信文本",
    titleWorkflow.includes("group: governance-pr-title-${{ github.event.pull_request.number }}") &&
      titleWorkflow.includes("cancel-in-progress: true") &&
      !/github\.event\.pull_request\.(?:title|body|head)/u.test(titleWorkflow),
    "pull request number only",
    "checked",
  );
  record(
    "PR 标题 workflow 无 label 或 WIP 绕过",
    !/ignoreLabels:|\nwip:/u.test(titleWorkflow),
    false,
    /ignoreLabels:|\nwip:/u.test(titleWorkflow),
  );
  for (const type of ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"]) {
    record(
      `PR 标题允许 Conventional type ${type}`,
      new RegExp(`^\\s{12}${type}$`, "mu").test(titleWorkflow),
      type,
      new RegExp(`^\\s{12}${type}$`, "mu").test(titleWorkflow),
    );
  }

  return assertions;
}

function summarize(assertions) {
  const failures = assertions.filter(({ passed }) => !passed);
  return {
    result: failures.length === 0 ? "passed" : "failed",
    assertions: {
      executed: assertions.length,
      passed: assertions.length - failures.length,
      failed: failures.length,
      skipped: 0,
    },
    failures: failures.map(({ name, expected, actual }) => ({ name, expected, actual })),
  };
}

function runSelfTests(snapshot) {
  const cases = [
    {
      name: "拒绝 pull_request_target",
      expectedFailure: "PR 标题 workflow 禁止 pull_request_target",
      mutate(candidate) {
        candidate.workflows["pr-title.yml"] = candidate.workflows["pr-title.yml"].replace(
          "  pull_request:",
          "  pull_request_target:",
        );
      },
    },
    {
      name: "拒绝浮动 Action tag",
      expectedFailure: "所有远程 Action 使用完整提交 SHA (pr-title.yml)",
      mutate(candidate) {
        candidate.workflows["pr-title.yml"] = candidate.workflows["pr-title.yml"].replace(
          EXPECTED_ACTION_SHA,
          "v6.1.1",
        );
      },
    },
    {
      name: "拒绝 PR workflow 写权限",
      expectedFailure: "PR 标题 workflow 只授予 pull-requests: read",
      mutate(candidate) {
        candidate.workflows["pr-title.yml"] = candidate.workflows["pr-title.yml"].replace(
          "  pull-requests: read",
          "  contents: write",
        );
      },
    },
    {
      name: "拒绝遗漏密码学 owner",
      expectedFailure: "CODEOWNERS 覆盖 /packages/crypto/",
      mutate(candidate) {
        candidate.codeowners = candidate.codeowners.replace("/packages/crypto/ @sora-yyds\n", "");
      },
    },
    {
      name: "拒绝私有包发布 tag",
      expectedFailure: "Changesets 私有包不创建 tag",
      mutate(candidate) {
        const config = JSON.parse(candidate.changesetConfig);
        config.privatePackages.tag = true;
        candidate.changesetConfig = JSON.stringify(config);
      },
    },
    {
      name: "拒绝 PR 模板遗漏 Changeset",
      expectedFailure: "PR 模板包含 ## Changeset",
      mutate(candidate) {
        candidate.pullRequestTemplate = candidate.pullRequestTemplate.replace("## Changeset", "## 发布说明");
      },
    },
    {
      name: "拒绝 label 绕过标题检查",
      expectedFailure: "PR 标题 workflow 无 label 或 WIP 绕过",
      mutate(candidate) {
        candidate.workflows["pr-title.yml"] += "\n          ignoreLabels: |\n            skip-title\n";
      },
    },
  ];

  return cases.map(({ name, expectedFailure, mutate }) => {
    const candidate = {
      ...snapshot,
      workflows: { ...snapshot.workflows },
    };
    mutate(candidate);
    const failures = validateSnapshot(candidate).filter(({ passed }) => !passed);
    const passed = failures.some((failure) => failure.name === expectedFailure);
    return {
      name,
      passed,
      expected: expectedFailure,
      actual: failures.map((failure) => failure.name),
    };
  });
}

const snapshot = loadSnapshot();
const validation = summarize(validateSnapshot(snapshot));
const selfTestRequested = process.argv.includes("--self-test");
const selfTests = selfTestRequested ? runSelfTests(snapshot) : [];
const selfTestFailures = selfTests.filter(({ passed }) => !passed);
const selfTest = {
  result: selfTestRequested ? (selfTestFailures.length === 0 ? "passed" : "failed") : "not_run",
  assertions: {
    executed: selfTests.length,
    passed: selfTests.length - selfTestFailures.length,
    failed: selfTestFailures.length,
    skipped: 0,
  },
  failures: selfTestFailures.map(({ name, expected, actual }) => ({ name, expected, actual })),
};

console.log(
  JSON.stringify(
    {
      schemaVersion: "1.0.0",
      kind: "datapulse-root-check-summary",
      check: "repository-governance",
      gateId: process.env.DATAPULSE_GATE_ID ?? null,
      runNonce: process.env.DATAPULSE_RUN_NONCE ?? null,
      result: validation.result === "passed" && selfTest.result !== "failed" ? "passed" : "failed",
      assertions: validation.assertions,
      selfTest,
      failures: validation.failures,
    },
    null,
    2,
  ),
);

if (validation.result !== "passed" || selfTest.result === "failed") process.exitCode = 1;
